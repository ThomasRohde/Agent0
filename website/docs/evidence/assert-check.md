---
sidebar_position: 1
---

# Assert and Check

A0 provides two evidence statements for validating program behavior: `assert` and `check`. Both produce evidence records in the trace output, but they differ critically in how they handle failures.

## assert -- Fatal

`assert` is **fatal**: it stops execution immediately if the condition is false. It exits with code 5 and diagnostic `E_ASSERT`. No further statements execute after a failed assert.

Use `assert` for invariants that MUST hold -- the program cannot continue meaningfully if these fail.

```a0
assert { that: true, msg: "this passes" }
assert { that: false, msg: "this stops the program -- nothing after this runs" }
```

The `that` field accepts any expression and uses A0 truthiness (`false`, `null`, `0`, and `""` are falsy). In practice, pass booleans for clarity. The `msg` field is optional; if omitted, it defaults to an empty string.

### Binding the evidence record

Use the `->` binding to capture the evidence record produced by `assert`:

```a0
assert { that: true, msg: "step completed" } -> evidence
```

The bound value is a record with the assertion result.

## check -- Non-Fatal

`check` is **non-fatal**: it records evidence (ok or fail) and **continues execution** regardless of the result. If ANY `check` fails during the run, the program still completes all remaining statements, but the runner returns exit 5 after execution finishes.

Use `check` for validations the agent should know about but that should not prevent the program from finishing.

```a0
check { that: true, msg: "data structure valid" }
check { that: false, msg: "this records a failure but execution continues" }
```

Like `assert`, `check` accepts `that` (truthiness-based) and optional `msg` fields, and supports `->` binding.

## When to use each

| Statement | On failure | Use when |
|-----------|-----------|----------|
| `assert`  | **Fatal**: stops immediately (exit 5, `E_ASSERT`) | An invariant MUST hold -- the program cannot continue |
| `check`   | **Non-fatal**: records failure, continues (exit 5 after run) | You want to gather all evidence before reporting |

## Using predicates for meaningful conditions

A0 provides stdlib predicate functions that return booleans suitable for `assert` and `check`:

- `eq { a, b }` -- returns `true` if `a` equals `b`
- `contains { in, value }` -- returns `true` if a list or string contains the value
- `not { in }` -- negates a boolean
- `and { a, b }` -- logical AND
- `or { a, b }` -- logical OR

### Example: predicate assertions

```a0
cap { sh.exec: true }

do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> result
let exited_ok = eq { a: result.exitCode, b: 0 }
assert { that: exited_ok, msg: "node exited with code 0" }

let has_output = not { in: eq { a: result.stdout, b: "" } }
check { that: has_output, msg: "node version returned output" }

return { version: result.stdout }
```

## Complete example

```a0
let data = { count: 42, items: [1, 2, 3] }
let count = get { in: data, path: "count" }

assert { that: true, msg: "count is defined" }
check { that: true, msg: "data structure valid" }

return { ok: true, count: count }
```

Both `assert` and `check` produce `evidence` events in the [trace output](./traces.md), making them useful for automated verification and audit trails.
