---
sidebar_position: 1
---

# Assert and Check

A0 provides two evidence statements for validating program behavior: `assert` and `check`. Both produce evidence records in the trace output, but they differ in how they handle failures.

## assert

`assert` stops execution immediately if the condition is false. It exits with code 5 and diagnostic `E_ASSERT`.

```a0
assert { that: true, msg: "this passes" }
assert { that: false, msg: "this stops the program" }
```

The `that` field must be a boolean. The `msg` field is a string describing what is being asserted.

### Binding the evidence record

Use the `->` binding to capture the evidence record produced by `assert`:

```a0
assert { that: true, msg: "step completed" } -> evidence
```

The bound value is a record with the assertion result.

## check

`check` records evidence but does **not** stop execution when the condition is false. If any `check` fails, the program exits with code 5 and diagnostic `E_CHECK` after completing all statements.

```a0
check { that: true, msg: "data structure valid" }
check { that: false, msg: "this records a failure but continues" }
```

Like `assert`, `check` accepts `that` (boolean) and `msg` (string) fields, and supports `->` binding.

## When to use each

| Statement | On failure | Use when |
|-----------|-----------|----------|
| `assert`  | Stops immediately (exit 5, `E_ASSERT`) | A precondition must hold for later steps to make sense |
| `check`   | Records failure, continues (exit 5, `E_CHECK`) | You want to gather all evidence before reporting |

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
