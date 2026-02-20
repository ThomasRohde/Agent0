# @a0/scenarios

Black-box scenario validation for the A0 CLI. Exercises the compiled CLI as a subprocess and validates exit codes, stdout/stderr, trace output, evidence, and file artifacts.

## How it works

Each scenario is a folder containing a `scenario.json` configuration file and one or more `.a0` source files. The test runner discovers scenario folders, spawns the CLI as a child process, and asserts on the expected outputs.

**Black-box rule:** This package has no runtime dependency on `@a0/core`, `@a0/std`, or `@a0/tools`. It treats the CLI as an opaque binary.

## Running scenarios

```bash
# From the repo root (builds all upstream packages first):
npm run test:scenarios

# Or directly:
npm run build && npm run test -w packages/scenarios
```

### Debug tips

Keep temp directories after a test run for inspection:

```bash
A0_SCENARIO_KEEP_TMP=1 npm run test:scenarios
```

Keep temp directories only for failed scenarios:

```bash
A0_SCENARIO_KEEP_TMP_ON_FAIL=1 npm run test:scenarios
```

Run only matching scenarios by id/path substring:

```bash
A0_SCENARIO_FILTER=policy npm run test:scenarios
```

Run scenarios by tags (comma-separated OR match):

```bash
A0_SCENARIO_TAGS=smoke,cli npm run test:scenarios
```

Add extra scenario roots (path-delimited list):

```bash
A0_SCENARIO_ROOT_EXTRA=../private-scenarios npm run test:scenarios
```

## Adding a scenario

1. Create a folder under `packages/scenarios/scenarios/<name>/` (or `scenarios/<name>/` at repo root)
2. Add a `scenario.json` file
3. Add `.a0` source files referenced by the `cmd` field
4. Optionally add a `setup/` subfolder — its contents are copied into the working directory before execution

### Scenario quality guardrails

- Avoid `expect.exitCode`-only scenarios. Add at least one behavior assertion (`stdout*`, `stderr*`, `files`, `evidenceJson`, or `traceSummary`).
- Do not use placeholder checks like `stderrContains: "E_"`; assert a specific code (`E_PARSE`, `E_ASSERT`, etc.) or use `stderrJsonSubset`.
- For `run`/`check`/`fmt` failures, assert a stable diagnostic code (`E_*`) rather than only message wording.
- Prefer `stdoutJson`/`stderrJson` over raw JSON text snapshots (except when explicitly testing `--stable-json` output formatting).
- For successful `trace` text output, prefer `stdoutRegex` (or `traceSummary` when available) over exact `stdoutText` snapshots.
- For text rendering checks with multiple required tokens, prefer `stdoutContainsAll` / `stderrContainsAll` over mega-regex snapshots.
- If `capture.evidence: true` is set, assert `expect.evidenceJson`.
- If `capture.trace: true` is set, assert `expect.traceSummary`.

## `scenario.json` schema

| Field | Type | Required | Description |
|---|---|---|---|
| `cmd` | `string[]` | Yes | CLI arguments (e.g. `["run", "hello.a0"]`) |
| `stdin` | `string` | No | Text piped to the process stdin |
| `policy` | `object` | No | `.a0policy.json` contents written to the working directory |
| `policy.allow` | `string[]` | Yes (if policy) | Allowed capability IDs |
| `policy.deny` | `string[]` | No | Denied capability IDs |
| `policy.limits` | `object` | No | Policy limits (currently surfaced by `a0 policy`; runtime budget enforcement still comes from program `budget { ... }`) |
| `capture` | `object` | No | Output capture options |
| `capture.trace` | `boolean` | No | Append `--trace trace.jsonl` to CLI args |
| `capture.evidence` | `boolean` | No | Append `--evidence evidence.json` to CLI args |
| `meta` | `object` | No | Optional scenario metadata |
| `meta.tags` | `string[]` | No | Tags used by `A0_SCENARIO_TAGS` filtering |
| `expect` | `object` | Yes | Assertions on subprocess output |
| `expect.exitCode` | `number` | Yes | Expected process exit code |
| `expect.stdoutJson` | `any` | No | Parse stdout as JSON, deep-equal compare |
| `expect.stdoutJsonSubset` | `any` | No | Parse stdout as JSON, assert subset match |
| `expect.stdoutText` | `string` | No | Compare stdout text (line endings normalized) |
| `expect.stdoutContains` | `string` | No | Assert stdout contains this substring |
| `expect.stdoutContainsAll` | `string[]` | No | Assert stdout contains every substring in this list |
| `expect.stdoutRegex` | `string` | No | Assert stdout matches this regex |
| `expect.stderrJson` | `any` | No | Parse stderr as JSON, deep-equal compare |
| `expect.stderrJsonSubset` | `any` | No | Parse stderr as JSON, assert subset match |
| `expect.stderrText` | `string` | No | Compare stderr text (line endings normalized) |
| `expect.stderrContains` | `string` | No | Assert stderr contains this substring |
| `expect.stderrContainsAll` | `string[]` | No | Assert stderr contains every substring in this list |
| `expect.stderrRegex` | `string` | No | Assert stderr matches this regex |
| `expect.evidenceJson` | `any` | No | Read `evidence.json`, deep-equal compare |
| `expect.traceSummary` | `object` | No | Compute trace summary, deep-equal compare |
| `expect.files` | `array` | No | File artifact assertions |
| `expect.files[].path` | `string` | Yes | Path relative to working directory |
| `expect.files[].sha256` | `string` | No | Expected SHA-256 hex digest |
| `expect.files[].text` | `string` | No | Expected file text content |
| `expect.files[].json` | `any` | No | Expected parsed JSON content |
| `expect.files[].absent` | `true` | No | Assert file does not exist |
| `timeoutMs` | `number` | No | Subprocess timeout in ms (default: 10000) |

## Scenario discovery

Scenarios are discovered from two roots (repo-root takes precedence for deduplication):

1. `<repoRoot>/scenarios/`
2. `<repoRoot>/packages/scenarios/scenarios/`

Folders named `node_modules`, `dist`, or starting with `.` are ignored.

## Notes

- Deterministic `http.get` and `sh.exec` scenarios are supported today (without external network dependency).
- HTTP local-twin infrastructure is still deferred and can be added later when richer failure-mode simulation is needed.
