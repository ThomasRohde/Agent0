---
sidebar_position: 7
---

# Pattern Matching

A0 uses `if` expressions for conditional logic and `match` for discriminated dispatch on record keys. This example combines both to handle success/error cases.

## Source: match-demo.a0

```a0
# match-demo.a0 — ok/err discrimination with match
cap { sh.exec: true }
budget { timeMs: 10000, maxToolCalls: 1 }

do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> result
let status = if { cond: eq { a: result.exitCode, b: 0 }, then: { ok: result.stdout }, else: { err: "node failed" } }

let output = match status {
  ok { val } {
    return { message: "node version found", version: val }
  }
  err { e } {
    return { message: "error occurred", error: e }
  }
}

return { output: output }
```

## Line-by-line walkthrough

### Line 5: Running the command

```a0
do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> result
```

Runs `node --version` and binds the result. The `result` record has `stdout`, `stderr`, and `exitCode` fields.

### Line 6: Building an ok/err record with `if`

```a0
let status = if { cond: eq { a: result.exitCode, b: 0 }, then: { ok: result.stdout }, else: { err: "node failed" } }
```

`if` is a stdlib-style expression with three fields:

| Field | Purpose |
|-------|---------|
| `cond` | Boolean condition to evaluate |
| `then` | Value returned if `cond` is truthy |
| `else` | Value returned if `cond` is falsy |

Here it produces either `{ ok: "v20.x.x\n" }` or `{ err: "node failed" }` depending on the exit code. Note that `ok`, `err`, `cond`, `then`, and `else` are **not keywords** -- they are plain identifiers used as record keys.

### Lines 8-15: Matching on record keys

```a0
let output = match status {
  ok { val } {
    return { message: "node version found", version: val }
  }
  err { e } {
    return { message: "error occurred", error: e }
  }
}
```

`match` inspects a record and dispatches based on which key is present:

- `ok { val }` -- matches if the record has an `ok` key; binds the value to `val`
- `err { e }` -- matches if the record has an `err` key; binds the value to `e`

Each arm has a block body that must end with `return`. The matched arm's return value becomes the value of the entire `match` expression.

If no arm matches, the program fails with `E_MATCH_NO_ARM`. If the input is not a record, it fails with `E_MATCH_NOT_RECORD`.

### Line 17: Return

```a0
return { output: output }
```

Returns the matched output.

## Expected output (success case)

```json
{
  "output": {
    "message": "node version found",
    "version": "v20.11.0\n"
  }
}
```

## Running it

```bash
a0 run --unsafe-allow-all examples/match-demo.a0
```

## The ok/err pattern

A0 does not have built-in error types or exceptions for user code. Instead, the idiomatic pattern is:

1. Use `if` to create a record with either an `ok` or `err` key
2. Use `match` to handle each case

```a0
# Create the discriminated record
let result = if { cond: some_condition, then: { ok: success_value }, else: { err: "failure reason" } }

# Dispatch on the key
let handled = match result {
  ok { value } {
    return value
  }
  err { reason } {
    return { error: reason }
  }
}
```

This pattern provides explicit, structured error handling without hidden control flow.

## Key takeaways

- `if` is an expression with `cond`, `then`, and `else` fields
- `match` dispatches on which key is present in a record
- Each `match` arm binds the key's value and executes a block
- `ok`/`err` are not keywords -- they are plain record keys
- The ok/err pattern is A0's idiomatic approach to error handling
