# PRD: Scenario-Based Validation for Agent0 (Monorepo, Black-Box Preserved)

## Document metadata

- **Project**: Agent0 (A0)
- **Repo**: `ThomasRohde/Agent0`
- **Document type**: Product Requirements Document (developer-ready)
- **Status**: Draft for implementation
- **Audience**: Core Agent0 maintainers, coding agents, contributors
- **Primary goal**: Add StrongDM-inspired scenario-based validation while keeping a **monorepo** and preserving **black-box CLI validation**

---

## 1. Problem statement

Agent0 currently relies on traditional TypeScript tests embedded in code directories (parser/evaluator/tools/unit behavior). That is necessary, but it does not fully protect the user-facing contract of the CLI or reflect real end-to-end usage patterns.

As Agent0 evolves, regressions are more likely to appear in:

- CLI behavior and output contracts
- policy/capability enforcement
- error handling and diagnostics
- tool integration behavior (`fs`, `http`, `sh`)
- traces/evidence artifacts
- interactions between parsing, evaluation, tools, and CLI options

Unit tests catch local correctness. They do **not** by themselves provide a strong “user story” quality gate.

### Why scenario-based validation now

A scenario-based validation layer provides:

1. **Black-box confidence**: Validate `a0` through its CLI contract, not internal function calls.
2. **Realistic workflows**: Express tests as executable user scenarios with setup, policy, and expected outputs.
3. **Regression safety**: Catch changes in observable behavior early.
4. **Future readiness**: Supports holdout scenarios and “satisfaction” scoring later.
5. **Agent-friendly workflow**: Coding agents can add features while CI enforces realistic behavior.

---

## 2. Product vision

Add a **scenario validation framework** to Agent0 inside the existing monorepo.

The framework will:

- live as a dedicated package/workspace (`packages/scenarios`)
- discover scenario folders (data-driven tests)
- run the compiled CLI as a **subprocess** (`node packages/cli/dist/main.js ...`)
- isolate execution via temporary `cwd` and temporary `HOME`
- capture and validate:
  - exit codes
  - stdout / stderr (text or JSON)
  - evidence artifacts
  - trace artifacts (via normalized summary)
  - generated files
- support deterministic “digital twin” fixtures for HTTP and shell over time
- be CI-friendly and allow future private holdout packs

This preserves the **monorepo** while keeping the validation layer **black-box**.

---

## 3. Goals and non-goals

## Goals

- Add a **developer-ready** scenario validation package in the monorepo.
- Keep validation **black-box** (CLI subprocess only).
- Make scenarios mostly **data-driven** (`scenario.json` + `.a0` + fixtures).
- Ensure **deterministic and isolated** test runs.
- Support **incremental adoption** (start with a few high-value scenarios).
- Be compatible with current build/test workflow (`tsc` + `node --test`).
- Create a path to:
  - holdout/private scenario packs
  - scenario pass-rate (“satisfaction”) metrics
  - tool twins for failure-mode testing

## Non-goals (v1)

- Replacing existing unit tests.
- Building a full simulation platform.
- LLM-as-judge scoring for all scenarios.
- Cross-machine orchestration or distributed scenario execution.
- Runtime mocking by monkey-patching internal Agent0 modules (violates black-box principle).

---

## 4. Principles

1. **Black-box first**
   - The runner must only invoke the CLI executable and inspect outputs/artifacts.
   - No direct imports from parser/evaluator internals for validation.

2. **Monorepo-native**
   - The scenario package belongs in the same monorepo for easy builds, CI wiring, and contribution flow.
   - Black-box behavior is preserved by process boundary and file contracts.

3. **Deterministic by default**
   - Normalize volatile fields (timestamps, run IDs, durations).
   - Isolate temp directories and home directories.
   - Avoid internet dependency in scenario tests.

4. **Scenarios are data**
   - Most tests should be expressed as files and expectations, not custom code.
   - Contributors should be able to add a scenario by copying a folder.

5. **Traceability**
   - Scenarios should validate machine-readable contracts (JSON stdout, evidence JSON, trace summaries, file hashes).

---

## 5. Proposed monorepo design

## 5.1 Workspace/package layout

Add a new package:

```text
Agent0/
├─ packages/
│  ├─ cli/
│  ├─ core/
│  ├─ tools/
│  └─ scenarios/               # NEW
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ src/
│     │  ├─ scenarios.test.ts  # data-driven black-box runner
│     │  ├─ types.ts           # optional (schema/types)
│     │  └─ normalize.ts       # optional (trace/event normalization)
│     ├─ scenarios/            # public scenario pack(s)
│     │  ├─ hello/
│     │  │  ├─ scenario.json
│     │  │  └─ hello.a0
│     │  ├─ cap-denied-http/
│     │  │  ├─ scenario.json
│     │  │  └─ program.a0
│     │  └─ ...
│     └─ README.md
└─ ...
```

### Why `packages/scenarios/scenarios` (instead of repo-root `/scenarios`)?

Either is acceptable, but defaulting to `packages/scenarios/scenarios` keeps scenario content versioned with the package and makes package-local commands simpler.

The runner should support **both** locations:

1. `./scenarios` (repo root)
2. `./packages/scenarios/scenarios` (package-local)

This preserves flexibility without breaking monorepo ergonomics.

---

## 6. Functional requirements

## FR-1: Scenario discovery

The runner must recursively discover scenario folders containing `scenario.json`.

- Ignore `node_modules`, `dist`, hidden folders.
- Sort scenarios deterministically by path.
- Each scenario folder is a self-contained test case.

**Acceptance criteria**
- Given multiple scenario folders, the test runner discovers and executes all in stable order.

---

## FR-2: Black-box CLI execution

Each scenario must execute the compiled CLI via subprocess:

```bash
node packages/cli/dist/main.js <args...>
```

Requirements:
- Set `cwd` to a temporary per-scenario work directory.
- Set `HOME` / `USERPROFILE` to a temp directory to prevent policy leakage.
- Do not import or call internal evaluator functions directly.

**Acceptance criteria**
- Scenario tests pass/fail based on subprocess outputs only.
- No package internals are imported from `@agent0/core` or `@agent0/tools` for test execution.

---

## FR-3: Scenario setup and isolation

Scenarios may include fixtures in `setup/` that are copied into the temporary work directory before execution.

The runner must:
- create temp `workDir`
- create temp `homeDir`
- copy `setup/` contents into `workDir`
- copy `.a0` files from scenario folder into `workDir`
- write `.a0policy.json` into `workDir` if defined in scenario config

**Acceptance criteria**
- Scenario execution does not depend on developer machine state.
- A local/global user policy cannot change scenario results.

---

## FR-4: Scenario configuration schema

Each scenario is defined by `scenario.json`. The schema must support:

- CLI args (`cmd`)
- optional stdin (`stdin`)
- optional inline policy (`policy`)
- capture flags (`trace`, `evidence`)
- expectations:
  - exit code
  - stdout JSON/text
  - stderr JSON/text
  - evidence JSON
  - trace summary
  - generated file assertions (sha256/text/json)
- optional timeout

### Canonical v1 schema (TypeScript shape)

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

type ScenarioConfig = {
  id?: string;
  cmd: string[];
  stdin?: string;
  policy?: {
    version?: number;
    allow: string[];
    deny?: string[];
    limits?: Record<string, unknown>;
  };
  capture?: {
    trace?: boolean;
    evidence?: boolean;
  };
  expect: {
    exitCode: number;
    stdoutJson?: Json;
    stdoutText?: string;
    stderrJson?: Json;
    stderrText?: string;
    evidenceJson?: Json;
    traceSummary?: Json;
    files?: Array<
      | { path: string; sha256: string }
      | { path: string; text: string }
      | { path: string; json: Json }
    >;
  };
  timeoutMs?: number;
};
```

**Acceptance criteria**
- Invalid/missing schema fields fail fast with readable test errors.

---

## FR-5: Output validation (stdout/stderr)

The runner must support validating:

- exact text output (normalized line endings)
- exact JSON output (deep equality)

Text validation is useful for:
- deterministic messages
- fmt/check output

JSON validation is preferred for:
- machine-readable CLI results
- stable contracts

**Acceptance criteria**
- `stdoutText` and `stderrText` compare after `\r\n` normalization.
- `stdoutJson` and `stderrJson` parse and deep-compare.

---

## FR-6: Evidence and trace artifact validation

The runner must support validating:

1. **Evidence JSON** (if `--evidence` is enabled)
   - Compare expected JSON exactly (or exact-enough, see normalization below)

2. **Trace JSONL** (if `--trace` is enabled)
   - Parse JSONL events
   - Normalize volatile fields
   - Compute a **trace summary**
   - Compare summary JSON rather than raw event-by-event snapshot by default

### Required normalization (v1)

For trace events, strip/ignore:
- `ts`
- `runId`
- any `durationMs` fields

This avoids flakiness.

### Trace summary (v1)

The runner should compute a summary like:

```json
{
  "totalEvents": 12,
  "toolInvocations": 2,
  "toolsByName": { "http.get": 1, "fs.write": 1 },
  "evidenceCount": 1,
  "failures": 0,
  "budgetExceeded": 0
}
```

**Acceptance criteria**
- Trace validations remain stable across machines/runs.
- Changes in tool usage or failures show up as summary diffs.

---

## FR-7: File artifact assertions

Scenarios must be able to assert generated file outputs (relative to `workDir`) using:

- `sha256`
- `text`
- `json`

This is important for `fs.write`, formatted outputs, generated content, etc.

**Acceptance criteria**
- Missing files fail the scenario.
- File content mismatches produce clear test output.

---

## FR-8: Scenario categories (public pack)

The initial public scenario pack should include at least these categories:

1. **Happy path / return data**
2. **Formatter behavior / idempotence**
3. **Parse errors / diagnostics**
4. **Capability denial**
5. **Evidence gating**
6. **Trace emission**
7. **File write determinism**
8. **HTTP tool (local twin)**
9. **Shell tool contract (deterministic commands)**

**Acceptance criteria**
- At least 6 scenarios are implemented in v1.
- At least one scenario covers capability denial and exits with expected error code.
- At least one scenario validates trace summary.
- At least one scenario validates file artifact hash or JSON.

---

## FR-9: CI integration

The monorepo CI pipeline must run scenario tests after build.

Recommended order:

1. install deps
2. build all packages
3. run unit tests
4. run scenario tests

Example package scripts:

- `npm run test:scenarios`
- `npm run test:all`

**Acceptance criteria**
- Scenario tests run in CI without external network dependency.
- CI output clearly identifies failing scenario path.

---

## 7. Non-functional requirements

## NFR-1: Determinism

Scenario runs should be deterministic and reproducible.

- No internet dependency in public scenarios.
- No dependency on local user config or policy.
- Normalize volatile fields.

---

## NFR-2: Performance

Scenario pack execution should remain reasonably fast for contributors.

Target:
- v1 public scenario pack completes in **< 30 seconds** on a typical dev machine.

Strategies:
- small scenario set
- short timeouts
- local-only HTTP server (when used)
- no expensive shell commands

---

## NFR-3: Developer ergonomics

Adding a scenario should require minimal boilerplate:
- create folder
- add `scenario.json`
- add `.a0` file (+ optional `setup/`)
- run tests

A contributor should not need to write TypeScript for most scenarios.

---

## NFR-4: Debuggability

When a scenario fails, developers must be able to quickly diagnose it.

Requirements:
- include scenario path/name in test title
- show stderr/stdout on exit code mismatch
- optionally support keeping temp workdir via env flag (future enhancement)

Recommended future flag:
- `A0_SCENARIO_KEEP_TMP=1`

---

## 8. User stories (developer-facing)

1. **As an Agent0 maintainer**, I want to validate CLI behavior end-to-end so I can refactor internals without breaking users.

2. **As a contributor**, I want to add a new regression test by creating a scenario folder, not writing custom test code.

3. **As a CI pipeline**, I want deterministic, isolated scenario tests so results are stable across environments.

4. **As a future maintainer**, I want to add private holdout scenarios without changing the runner architecture.

---

## 9. StrongDM-inspired mapping to Agent0

This section explains how the scenario system maps to the StrongDM-style approach while fitting Agent0.

## 9.1 “Scenario as holdout” → Public + private packs

### v1 (public only)
- Store public scenarios in monorepo (`packages/scenarios/scenarios`).

### v2 (holdout support)
- Add support for loading a second scenario root (e.g. mounted in CI) containing private holdout cases.
- CI runs both public and private packs.
- Local dev usually runs public only.

This preserves the monorepo while preventing overfitting to all scenarios.

---

## 9.2 “Digital Twin Universe” → Deterministic local doubles

Agent0’s key external tool surfaces are:

- `http.get`
- `sh.exec`
- `fs.read` / `fs.write`

### v1
- FS is naturally isolated via temp `workDir`.
- `sh.exec` scenarios use deterministic commands only (e.g., `node -e`).
- HTTP scenarios use a small local HTTP server fixture (in-process or launched before tests).

### v2
- Add a configurable **HTTP twin** server with recorded responses and failure modes.
- Add a shell stub mode (future A0 feature or test harness helper) to emulate `sh.exec` without real processes.

---

## 9.3 “Satisfaction” → Pass-rate metric (later)

Scenario pass/fail is deterministic in v1.

In v2+, add:
- pass-rate across scenario packs
- optional repeat runs for flaky/nondeterministic scenarios
- “satisfaction score” = `passed / total`
- optional weighted categories (e.g., cap enforcement weighted higher than formatting)

This creates a governance metric without making validation fuzzy.

---

## 10. Detailed design

## 10.1 `packages/scenarios` package scripts

Recommended `packages/scenarios/package.json`:

```json
{
  "name": "@agent0/scenarios",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test dist/**/*.test.js",
    "test:watch": "node --test --watch dist/**/*.test.js"
  }
}
```

### Root-level script additions (recommended)

In repo root `package.json`, add:

```json
{
  "scripts": {
    "build": "npm run -ws build",
    "test": "npm run -ws test",
    "test:scenarios": "npm --workspace @agent0/scenarios run build && npm --workspace @agent0/scenarios test",
    "test:all": "npm run build && npm run test"
  }
}
```

Adjust workspace command syntax to your current package manager conventions (`npm`, `pnpm`, or `bun`).

---

## 10.2 `tsconfig.json` for scenarios package

Recommended baseline:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

If the repo already uses a shared TS base config, align with that.

---

## 10.3 Runner behavior (v1)

The runner should:

1. Locate the compiled CLI:
   - `packages/cli/dist/main.js`
2. Locate scenario root:
   - prefer repo `/scenarios`, else `packages/scenarios/scenarios`
3. Discover all `scenario.json` files recursively
4. For each scenario:
   - create temp `workDir` + `homeDir`
   - copy fixtures (`setup/`, `.a0` files)
   - write `.a0policy.json` from scenario config
   - append `--trace trace.jsonl` / `--evidence evidence.json` if configured
   - execute CLI subprocess
   - validate expectations
   - cleanup temp dir (unless debug mode later)
5. Report failures clearly

### Note on preserving black-box in monorepo

Even though the scenario runner lives in the same repo, black-box behavior is preserved because:
- execution happens via subprocess boundary
- validation happens via files/streams/exit code
- runner does not import internal package APIs to execute programs

This is the key design requirement and must be protected in code review.

---

## 10.4 Scenario folder conventions

### Minimal scenario

```text
packages/scenarios/scenarios/hello/
├─ scenario.json
└─ hello.a0
```

### Scenario with fixtures

```text
packages/scenarios/scenarios/write-file/
├─ scenario.json
├─ program.a0
└─ setup/
   ├─ input.json
   └─ nested/
      └─ template.txt
```

### Optional local policy file (alternative to inline policy)

```text
packages/scenarios/scenarios/cap-policy/
├─ scenario.json
├─ .a0policy.json
└─ program.a0
```

---

## 10.5 Example scenarios (developer-ready)

## Example A: Basic return JSON

`scenario.json`
```json
{
  "id": "hello",
  "cmd": ["run", "hello.a0"],
  "policy": { "allow": [] },
  "expect": {
    "exitCode": 0,
    "stdoutJson": {
      "greeting": "Hello, A0!",
      "data": { "name": "world", "version": 1 }
    }
  }
}
```

`hello.a0`
```a0
let greeting = "Hello, A0!"
let data = { name: "world", version: 1 }
return { greeting: greeting, data: data }
```

---

## Example B: Capability denied (black-box policy enforcement)

`scenario.json`
```json
{
  "id": "cap-denied-http",
  "cmd": ["run", "program.a0"],
  "policy": { "allow": [] },
  "capture": { "trace": true },
  "expect": {
    "exitCode": 3,
    "traceSummary": {
      "totalEvents": 0,
      "toolInvocations": 0,
      "toolsByName": {},
      "evidenceCount": 0,
      "failures": 1,
      "budgetExceeded": 0
    }
  }
}
```

`program.a0`
```a0
let r = http.get("http://127.0.0.1:3999/ping")
return r
```

> Note: exact trace summary values depend on your current trace event model. Use one initial run to capture the expected summary and then lock it.

---

## Example C: File output assertion

`scenario.json`
```json
{
  "id": "write-output-json",
  "cmd": ["run", "program.a0"],
  "policy": { "allow": ["fs.read", "fs.write"] },
  "expect": {
    "exitCode": 0,
    "files": [
      {
        "path": "out.json",
        "json": { "ok": true, "value": 42 }
      }
    ]
  }
}
```

`program.a0`
```a0
fs.write("out.json", { ok: true, value: 42 })
return { done: true }
```

---

## 10.6 HTTP twin strategy (v1 and v2)

## v1 (simple local server)
Add a tiny local HTTP server helper in the scenario runner or a dedicated helper module.

Requirements:
- bind to `127.0.0.1` and ephemeral port
- serve deterministic routes
- allow returning:
  - 200 JSON
  - 500 errors
  - delayed responses (optional)
- no internet access required

### Suggested approach
- Start server once per test file (or per scenario category)
- Inject port into scenario via:
  - placeholder replacement in `stdin`, or
  - generated fixture file in `setup`, or
  - custom env var (future enhancement if CLI supports env interpolation)

## v2 (recorded HTTP twin)
Support route fixture files:

```text
http-fixtures/
├─ users-200.json
├─ users-500.json
└─ timeout.json
```

This enables repeatable API-style tests without external dependencies.

---

## 10.7 Shell tool strategy

## v1
Use only deterministic commands in public scenarios, for example:
- `node -e "console.log('ok')"`
- `node -e "process.exit(7)"`

Validate:
- stdout capture
- stderr capture
- non-zero exit codes
- no evaluator crash

## v2
Consider adding one of these:
1. **A0 feature**: shell tool implementation switch (real vs stub)
2. **Scenario harness**: PATH override to point `node`/`echo` to test shims
3. **Policy/tool registry extension**: scenario-only fake `sh.exec`

Option 1 is cleanest long-term but requires product changes.

---

## 10.8 Trace normalization and “golden” strategy

There are two complementary validation styles:

### Style A (default): summary-based validation
- Parse trace JSONL
- Normalize volatile fields
- Compare computed summary JSON

Pros:
- stable
- compact expectations
- easier maintenance

### Style B (optional later): normalized trace snapshots
- Normalize raw events
- write `expected.trace.jsonl` or snapshot
- compare exact sequence

Pros:
- stronger contract
- catches event ordering regressions

Recommendation:
- Start with **Style A** in v1.
- Add optional raw trace snapshot support in v2 for critical flows.

---

## 11. Migration and rollout plan

## Phase 1: Introduce the package and runner (v1 foundation)

### Deliverables
- `packages/scenarios` package created
- `scenarios.test.ts` runner implemented
- package scripts wired
- root scripts wired
- CI job step added

### Exit criteria
- Runner compiles and executes
- At least 2 scenarios pass in CI

---

## Phase 2: Build initial public scenario pack

### Deliverables
Implement at least 6 scenarios:
1. hello return JSON
2. parse error
3. capability denied
4. evidence gating
5. trace summary
6. file write output

### Exit criteria
- Scenario suite runs reliably in CI
- Contributors can add scenarios following README instructions

---

## Phase 3: Add HTTP local twin + shell contract scenarios

### Deliverables
- local HTTP server helper
- 2-3 HTTP scenarios (success/error)
- 1-2 shell deterministic scenarios

### Exit criteria
- No external network required
- Failures are deterministic and readable

---

## Phase 4: Holdout/private scenario support (CI)

### Deliverables
- support optional additional scenario root via env var (e.g., `A0_SCENARIO_ROOT_EXTRA`)
- CI mounts/pulls private scenario pack
- CI runs public + private

### Exit criteria
- private holdout scenarios run in CI
- local contributors can still run public scenarios without secrets

---

## 12. CI/CD requirements

## CI pipeline updates

Add/confirm a workflow step after build:

```bash
npm run test:scenarios
```

If build/test split is already defined differently, integrate accordingly.

### CI constraints
- No external internet calls required
- Scenario package should not rely on OS-specific shell behavior beyond Node
- Use Node version aligned with repo support matrix

### Optional CI improvements (later)
- upload failing scenario artifacts as CI artifacts (trace/evidence/temp outputs)
- matrix test by Node version
- separate job for private holdout pack

---

## 13. Documentation requirements

Add `packages/scenarios/README.md` with:

1. What scenario tests are and why they exist
2. How they differ from unit tests
3. Folder structure
4. `scenario.json` schema reference
5. How to add a new scenario
6. How to run only scenarios
7. Troubleshooting tips
8. Black-box rule (do not import internals in scenario runner)

This README should be written so another coding agent can implement and extend the package safely.

---

## 14. Risks and mitigations

## Risk 1: Flaky tests due to nondeterministic trace fields
**Mitigation**
- Normalize timestamps, run IDs, durations
- Prefer summary-based trace assertions in v1

## Risk 2: Scenario overfitting by contributors/agents
**Mitigation**
- Introduce private holdout pack in CI (v2)
- Keep core contracts broad enough (trace summaries, file outputs, error classes)

## Risk 3: Hidden dependency on local machine state
**Mitigation**
- Temp `HOME`/`USERPROFILE`
- Temp `cwd`
- No network dependency
- Explicit policy in scenario config

## Risk 4: Scenario suite becomes slow
**Mitigation**
- Keep public pack small and high-value
- Separate “extended” pack later
- Use short timeouts

## Risk 5: Black-box boundary erodes over time
**Mitigation**
- Document the rule
- Code review check: runner cannot import parser/evaluator internals for execution
- Add lint rule/comment if needed

---

## 15. Success metrics

## v1 success metrics
- Scenario package merged and documented
- ≥ 6 public scenarios implemented
- CI runs scenario suite reliably
- At least one real regression caught by scenario tests within first month (expected outcome)

## v2+ metrics
- Private holdout pack active in CI
- Pass-rate trend visible over time
- Reduced regressions in CLI/policy/traces/tooling behavior

---

## 16. Implementation checklist (coding-agent friendly)

## Foundation
- [ ] Create `packages/scenarios/`
- [ ] Add `package.json`
- [ ] Add `tsconfig.json`
- [ ] Add `src/scenarios.test.ts` (data-driven runner)
- [ ] Add `README.md`

## Runner features
- [ ] Scenario discovery (`scenario.json`)
- [ ] Temp `workDir` + `homeDir`
- [ ] Copy `setup/` fixtures
- [ ] Copy `.a0` files
- [ ] Write `.a0policy.json` from config
- [ ] CLI subprocess execution
- [ ] stdout/stderr text validation
- [ ] stdout/stderr JSON validation
- [ ] evidence JSON validation
- [ ] trace JSONL parsing + normalization
- [ ] trace summary generation
- [ ] file assertions (sha256/text/json)
- [ ] cleanup temp directory

## Monorepo wiring
- [ ] Add package to workspace config (if needed)
- [ ] Add root scripts (`test:scenarios`, `test:all`)
- [ ] Ensure build order compiles `packages/cli` before scenarios

## Initial public scenarios
- [ ] `hello`
- [ ] `parse-error`
- [ ] `cap-denied-http`
- [ ] `evidence-fail`
- [ ] `trace-summary-basic`
- [ ] `file-write-json`
- [ ] `fmt-idempotence` (optional in v1 if easy)
- [ ] `shell-exit-code` (optional if deterministic)

## CI
- [ ] Add scenario test step
- [ ] Verify no internet dependency
- [ ] Verify output readability on failure

## Future (v2+)
- [ ] Extra scenario root via env var
- [ ] Private holdout CI pack
- [ ] HTTP twin helper
- [ ] Keep-temp debug env flag
- [ ] Pass-rate/satisfaction summary

---

## 17. Explicit decisions (to avoid ambiguity)

1. **Monorepo is preserved**
   - Scenario validation lives in `packages/scenarios` inside the same repo.

2. **Black-box is preserved**
   - The runner executes the CLI binary as a subprocess.
   - No direct evaluator/parser execution from tests.

3. **Scenarios are data-driven**
   - Default scenario definition is `scenario.json` + files.
   - Custom TS test code should be the exception, not the rule.

4. **Public scenarios are committed**
   - Private holdout scenarios are a future CI enhancement, not a blocker.

5. **Trace validation is summary-first**
   - Raw trace snapshot validation is optional and can come later.

---

## 18. Appendix A: Suggested package README stub (short)

You can use this as the starting point for `packages/scenarios/README.md`.

```md
# @agent0/scenarios

Black-box scenario validation for Agent0 CLI.

## Purpose

This package runs end-to-end scenario tests against the compiled `a0` CLI. It validates the observable contract (exit code, stdout/stderr, trace/evidence, generated files) and complements unit tests.

## Black-box rule

The scenario runner must invoke the CLI as a subprocess. Do not execute Agent0 internals directly in scenario tests.

## Add a scenario

1. Create a folder under `packages/scenarios/scenarios/<id>/`
2. Add `scenario.json`
3. Add one or more `.a0` files
4. Add `setup/` fixtures if needed
5. Run scenario tests

## Run

```bash
npm run test:scenarios
```
```

---

## 19. Appendix B: Nice-to-have enhancements (not required for v1)

- Scenario schema validation with `zod` (better errors)
- `A0_SCENARIO_FILTER=<glob>` to run subset
- `A0_SCENARIO_KEEP_TMP=1` to preserve temp dirs on failure
- Rich diff output for JSON mismatches
- JUnit output for CI dashboards
- Category tags in `scenario.json` (e.g., `["policy", "trace"]`)
- Weighted “satisfaction” score report after run
- Snapshot mode for normalized traces or stdout

---

## 20. Final recommendation

Implement `packages/scenarios` now as a **monorepo black-box validation package**. It gives you the StrongDM-style benefits (real scenarios, holdout path, future satisfaction scoring, digital twin direction) without over-engineering or violating your current architecture.

Keep your embedded TypeScript unit tests for internals. Add scenario tests as the user-contract safety net.

That combination is the right shape for Agent0 as it grows.
