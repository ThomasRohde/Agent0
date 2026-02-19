# Plan: Scenario-Based Validation Package for Agent0

## Context

Agent0 currently has unit tests for internals but no end-to-end validation of the CLI's user-facing contract. The PRD (`Agent0_Scenario_Validation_PRD.md`) specifies a black-box scenario validation framework that exercises the compiled CLI as a subprocess, validates exit codes / stdout / stderr / trace / evidence / file artifacts, and is data-driven (scenario folders with `scenario.json` + `.a0` files).

This plan implements Phases 1-2 of the PRD: the runner framework, 8+ initial scenarios, monorepo wiring, and CI.

---

## 1. New Package Scaffolding

### `packages/scenarios/package.json`
```json
{
  "name": "@a0/scenarios",
  "version": "0.5.2",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "node --test dist/**/*.test.js"
  },
  "devDependencies": {
    "@types/node": "^25.2.3",
    "typescript": "^5.9.3"
  }
}
```

### `packages/scenarios/tsconfig.json`
Extends `../../tsconfig.base.json`, same pattern as CLI package.

---

## 2. Source Files

### `packages/scenarios/src/types.ts`
TypeScript types for `ScenarioConfig`:
- `cmd: string[]`, `stdin?: string`, `policy?: { allow, deny?, limits? }`, `capture?: { trace?, evidence? }`
- `expect: { exitCode, stdoutJson?, stdoutText?, stderrJson?, stderrText?, stderrContains?, evidenceJson?, traceSummary?, files? }`
- `timeoutMs?: number`
- File assertions: `{ path, sha256 } | { path, text } | { path, json }`

### `packages/scenarios/src/normalize.ts`
Trace JSONL parsing + summary computation (black-box, no imports from `@a0/core`):
- Parse JSONL lines into events
- Compute `TraceSummary`: `{ totalEvents, toolInvocations, toolsByName, evidenceCount, failures, budgetExceeded }`
- Strip volatile fields (`runId`, `ts`, `durationMs`, `startTime`, `endTime`) from comparison

Reuses the summary shape from `packages/cli/src/cmd-trace.ts:37-48` but implemented independently (black-box rule).

### `packages/scenarios/src/scenarios.test.ts` (core runner)
This is the main file. Implementation approach:

1. **Discover** scenario folders by recursively finding `scenario.json` files under `packages/scenarios/scenarios/`
2. **For each scenario**, generate a `test()` call via `describe`/`it` from `node:test`
3. **Setup**: Create temp `workDir` + temp `homeDir` via `fs.mkdtempSync`
4. **Copy files**: Copy `.a0` files and `setup/` fixtures into `workDir`
5. **Write policy**: Write `.a0policy.json` into `workDir` from `scenario.policy`
6. **Build CLI args**: Resolve `node <cliPath> <cmd...>`, append `--trace trace.jsonl` / `--evidence evidence.json` if `capture` flags set
7. **Execute**: `child_process.spawn(process.execPath, [cliPath, ...args], { cwd: workDir, env: { HOME: homeDir, USERPROFILE: homeDir, PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT } })`
8. **Collect**: stdout, stderr, exit code
9. **Validate**: exit code, stdout (text/JSON), stderr (text/JSON/contains), evidence JSON, trace summary, file artifacts
10. **Cleanup**: Remove temp dirs (unless `A0_SCENARIO_KEEP_TMP=1`)

Key references:
- CLI entry point: `packages/cli/dist/main.js` (resolved via `path.resolve(__dirname, '../../cli/dist/main.js')`)
- Policy loading: `loadPolicy(cwd, homeDir)` in `packages/core/src/capabilities.ts:25` — setting cwd and HOME env vars isolates it
- `fs.write` uses `path.resolve(filePath)` relative to cwd (`packages/tools/src/fs-tools.ts:51`)

---

## 3. Initial Scenarios (8 total)

### 3.1 `hello` — Happy path return JSON
- `cmd: ["run", "hello.a0"]`, `policy: { allow: [] }`
- `expect: { exitCode: 0, stdoutJson: { greeting: "Hello, A0!", data: { name: "world", version: 1 } } }`
- Program: same as `examples/hello.a0`

### 3.2 `parse-error` — Invalid syntax
- `cmd: ["run", "bad.a0"]`, `policy: { allow: [] }`
- `expect: { exitCode: 2, stderrContains: "E_PARSE" }` (or `E_LEX`)
- Program: `let = oops` (intentionally broken)

### 3.3 `cap-denied` — Capability denial
- `cmd: ["run", "program.a0"]`, `policy: { allow: [] }`
- `expect: { exitCode: 3, stderrContains: "E_CAP_DENIED" }`
- Program: `cap { fs.read: true }\nlet r = call? fs.read { path: "x.txt" }\nreturn r`

### 3.4 `evidence-pass` — Passing check
- `cmd: ["run", "program.a0"]`, `policy: { allow: [] }`, `capture: { evidence: true }`
- `expect: { exitCode: 0 }` — evidence file should have all `ok: true`
- Program: `let ok = eq { a: 1, b: 1 }\ncheck { that: ok, msg: "1 equals 1" }\nreturn { ok: true }`

### 3.5 `evidence-fail` — Failing check
- `cmd: ["run", "program.a0"]`, `policy: { allow: [] }`, `capture: { evidence: true }`
- `expect: { exitCode: 5 }`
- Program: `let ok = eq { a: 1, b: 2 }\ncheck { that: ok, msg: "should fail" }\nreturn { x: 1 }`

### 3.6 `trace-basic` — Trace emission
- `cmd: ["run", "program.a0"]`, `policy: { allow: [] }`, `capture: { trace: true }`
- `expect: { exitCode: 0, stdoutJson: { value: 42 }, traceSummary: { totalEvents: <calibrate>, toolInvocations: 0, toolsByName: {}, evidenceCount: 0, failures: 0, budgetExceeded: 0 } }`
- Program: `let x = 42\nreturn { value: x }`
- Note: `totalEvents` must be calibrated by running once with `--trace` and counting events

### 3.7 `file-write-json` — File artifact assertion
- `cmd: ["run", "program.a0"]`, `policy: { allow: ["fs.write"] }`
- `expect: { exitCode: 0, files: [{ path: "out.json", json: { ok: true, value: 42 } }] }`
- Program: `cap { fs.write: true }\ndo fs.write { path: "out.json", data: { ok: true, value: 42 }, format: "json" } -> result\nreturn { written: true }`

### 3.8 `check-pass` — Static validation
- `cmd: ["check", "program.a0"]`, `policy: { allow: [] }`
- `expect: { exitCode: 0, stdoutText: "[]" }`
- Program: `let x = 42\nreturn { value: x }`

### 3.9 `fmt-idempotence` — Formatter idempotence (bonus)
- `cmd: ["fmt", "program.a0"]`, `policy: { allow: [] }`
- `expect: { exitCode: 0 }` — stdout should match source (calibrate exact text)
- Program: already-formatted code

---

## 4. Monorepo Wiring

### Root `package.json` changes
- Add to `"scripts"`:
  - `"test:scenarios": "npm run build -w packages/scenarios && npm run test -w packages/scenarios"`
- Update `"build"` to include scenarios: `"build": "npm run build -w packages/core && npm run build -w packages/std -w packages/tools && npm run build -w packages/cli && npm run build -w packages/scenarios"`
- The existing `"workspaces": ["packages/*"]` glob already includes `packages/scenarios`

---

## 5. CI Workflow

### `.github/workflows/ci.yml` (new file)
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run test --workspaces --if-present
```

---

## 6. README

Create `packages/scenarios/README.md` with:
- Purpose and black-box rule
- How to add a scenario (folder structure)
- `scenario.json` schema reference table
- How to run (`npm run test:scenarios`)
- Debug tips (`A0_SCENARIO_KEEP_TMP=1`)

---

## 7. Implementation Order

1. Create `packages/scenarios/` with `package.json`, `tsconfig.json`
2. Create `src/types.ts`, `src/normalize.ts`, `src/scenarios.test.ts`
3. Create all 8-9 scenario folders with `scenario.json` + `.a0` files
4. Update root `package.json` (build script, test:scenarios script)
5. Run `npm install` to wire workspace
6. Build all: `npm run build`
7. **Calibrate** trace-based scenarios by running once and recording exact counts
8. Run `npm run test:scenarios` — fix any failures
9. Create `.github/workflows/ci.yml`
10. Create `packages/scenarios/README.md`

---

## 8. Verification

1. `npm install` — workspace picks up new package
2. `npm run build` — all packages compile including scenarios
3. `npm run test:scenarios` — all scenarios pass
4. `npm test` — full suite (unit + scenarios) passes
5. `npm install -g ./packages/cli` — CLI still works globally
6. Manually verify: `a0 run examples/hello.a0` produces expected output
7. Review CI workflow by pushing to a branch and checking GitHub Actions
