---
sidebar_position: 5
---

# Shell Commands

This example runs shell commands, enforces budget constraints, validates results with predicate assertions, and builds an evidence trail. It demonstrates `sh.exec`, `budget`, and the interplay between `assert` (fatal -- halts on failure) and `check` (non-fatal -- records evidence and continues).

## Source: system-check.a0

```a0
# system-check.a0 — Gather system info and validate expectations
cap { sh.exec: true, fs.write: true }
budget { timeMs: 15000, maxToolCalls: 4, maxBytesWritten: 8192 }

do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> node_ver
let has_output = not { in: eq { a: node_ver.stdout, b: "" } }
assert { that: has_output, msg: "node version returned output" }

do sh.exec { cmd: "npm --version", timeoutMs: 5000 } -> npm_ver
let npm_ok = eq { a: npm_ver.exitCode, b: 0 }
assert { that: npm_ok, msg: "npm exited with code 0" }

let report = {
  node: node_ver.stdout,
  npm: npm_ver.stdout,
  nodeExit: node_ver.exitCode,
  npmExit: npm_ver.exitCode
}

do fs.write { path: "system-check.json", data: report, format: "json" } -> artifact
check { that: true, msg: "report written" }

return { report: report, artifact: artifact }
```

## Line-by-line walkthrough

### Line 2: Capability declaration

```a0
cap { sh.exec: true, fs.write: true }
```

Declares that this program needs `sh.exec` (to run shell commands) and `fs.write` (to write the report file).

### Line 3: Budget constraints

```a0
budget { timeMs: 15000, maxToolCalls: 4, maxBytesWritten: 8192 }
```

`budget` sets resource limits that the evaluator enforces at runtime:

| Field | Meaning |
|-------|---------|
| `timeMs` | Maximum wall-clock time in milliseconds |
| `maxToolCalls` | Maximum number of tool invocations |
| `maxBytesWritten` | Maximum bytes written to files |
| `maxIterations` | Maximum loop iterations (not used here) |

If any limit is exceeded, execution stops with a `budget_exceeded` trace event and diagnostic `E_BUDGET`.

### Lines 5-7: Running a command and asserting

```a0
do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> node_ver
let has_output = not { in: eq { a: node_ver.stdout, b: "" } }
assert { that: has_output, msg: "node version returned output" }
```

`sh.exec` is an effect-mode tool that runs a shell command. It returns a record with `stdout`, `stderr`, and `exitCode` fields. The `timeoutMs` argument limits how long the command can run.

The assertion uses two stdlib predicates composed together:
1. `eq { a: node_ver.stdout, b: "" }` -- checks if stdout is empty (returns a boolean)
2. `not { in: ... }` -- negates the result

If `has_output` is `false`, `assert` is **fatal** -- it stops the program immediately (exit 5, `E_ASSERT`). No further statements execute.

### Lines 9-11: Another command with assertion

```a0
do sh.exec { cmd: "npm --version", timeoutMs: 5000 } -> npm_ver
let npm_ok = eq { a: npm_ver.exitCode, b: 0 }
assert { that: npm_ok, msg: "npm exited with code 0" }
```

Same pattern: run a command, check a condition, assert. Here it verifies that `npm` exited successfully (exit code 0).

### Lines 13-18: Building the report

```a0
let report = {
  node: node_ver.stdout,
  npm: npm_ver.stdout,
  nodeExit: node_ver.exitCode,
  npmExit: npm_ver.exitCode
}
```

Assembles results from both commands into a single record.

### Lines 20-21: Writing with evidence

```a0
do fs.write { path: "system-check.json", data: report, format: "json" } -> artifact
check { that: true, msg: "report written" }
```

Writes the report to a JSON file. The `check` statement records evidence that the write happened. Unlike `assert`, `check` is **non-fatal** -- it records the result and continues execution. If any check fails, the program still completes but the runner returns exit 5 after execution finishes.

### Line 23: Return

```a0
return { report: report, artifact: artifact }
```

## Running it

```bash
a0 run --unsafe-allow-all examples/system-check.a0
```

## Key takeaways

- `budget` sets runtime resource limits (time, tool calls, bytes, iterations)
- `sh.exec` returns `{ stdout, stderr, exitCode }`
- Predicate functions (`eq`, `not`, `and`, `or`, `contains`) compose to build meaningful boolean checks
- `assert` is fatal (halts immediately on failure), `check` is non-fatal (records evidence and continues; exit 5 after run if any failed)
- Both produce evidence records visible in the [trace output](../evidence/traces.md)
