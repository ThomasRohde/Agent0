# A0 Example Scenarios

These examples are purpose-driven workflows for CI, release management, and repository automation.

## Recommended Start Points

| Example | Purpose | Covers |
|---|---|---|
| `workspace-version-report.a0` | Detect monorepo version drift before release | `sh.exec`, `fs.read`, `fs.write`, `for`, `find`, `filter`, `keys`, `values`, `merge`, `check` |
| `trace-quality-gate.a0` | Gate a run based on trace quality signals | `fs.read`, `fs.write`, `str.split`, `parse.json`, `match`, `append`, `concat`, `find`, `check` |
| `release-manifest.a0` | Generate normalized publish manifest | `fs.read`, `fs.write`, `patch` (`test/copy/move/add/remove/replace`), `contains`, `assert` |
| `dependency-audit.a0` | Inspect dependency and script hygiene | `fs.read`, `sh.exec`, `map`, `filter`, predicate composition |
| `deploy-preflight.a0` | Block unsafe deployments | `sh.exec`, `fs.read`, fatal assertions, runtime checks |

## Trace Fixtures

- `sample-trace.jsonl`: passing fixture for `trace-quality-gate.a0`
- `sample-trace.failed.jsonl`: failing fixture for negative-path testing

To test the failing fixture quickly, change the input path in `trace-quality-gate.a0` from:

```a0
call? fs.read { path: "examples/sample-trace.jsonl" } -> trace_raw
```

to:

```a0
call? fs.read { path: "examples/sample-trace.failed.jsonl" } -> trace_raw
```

## Run

```bash
a0 run examples/workspace-version-report.a0
a0 run examples/trace-quality-gate.a0
a0 run examples/release-manifest.a0
```
