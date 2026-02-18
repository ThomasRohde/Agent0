---
sidebar_position: 4
---

# Control Flow

A0 provides three control flow constructs: `if` for conditionals, `for` for iteration, and `match` for ok/err discrimination.

## if -- Conditional Expression

`if` is an expression that returns a value based on a condition. It uses record-style syntax with three fields:

```a0
let msg = if { cond: ok, then: "success", else: "failure" }
```

- `cond` -- the condition to evaluate (uses [truthiness](./data-types.md))
- `then` -- the value to return if the condition is truthy
- `else` -- the value to return if the condition is falsy

**Lazy evaluation**: only the taken branch is evaluated. The other branch is never executed.

### Examples

Simple conditional:

```a0
do sh.exec { cmd: "echo hello", timeoutMs: 5000 } -> x
let ok = eq { a: x.exitCode, b: 0 }
let msg = if { cond: ok, then: "command succeeded", else: "command failed" }
return { msg: msg, exitCode: x.exitCode }
```

Using inline expressions:

```a0
let status = if { cond: eq { a: result.exitCode, b: 0 }, then: { ok: result.stdout }, else: { err: "command failed" } }
```

Truthiness rules apply -- `0`, `""`, `null`, and `false` are falsy:

```a0
let has_items = len { in: items }
let msg = if { cond: has_items, then: "found items", else: "no items" }
```

## for -- List Iteration

`for` iterates over a list and produces a new list of results. Each iteration runs in its own scope.

```a0
let results = for { in: items, as: "item" } {
  # body -- each iteration gets 'item' bound to the current element
  return { processed: item }
}
```

- `in` -- the list to iterate over (must be a list; `E_FOR_NOT_LIST` otherwise)
- `as` -- the name to bind each element to (a string)
- The body is a block `{ ... }` that **must end with `return`**
- The result is a list of all the return values

### Iteration Example

```a0
cap { sh.exec: true }
budget { timeMs: 15000, maxToolCalls: 3, maxIterations: 10 }

let cmds = ["echo one", "echo two", "echo three"]
let results = for { in: cmds, as: "cmd" } {
  do sh.exec { cmd: cmd, timeoutMs: 5000 } -> out
  return { cmd: cmd, stdout: out.stdout, exitCode: out.exitCode }
}

return { results: results }
```

### Budget Control

The `maxIterations` budget field limits the total number of iterations across all `for` loops and `map` calls in a program. If the limit is exceeded, execution stops with `E_BUDGET`:

```a0
budget { maxIterations: 100 }

let results = for { in: large_list, as: "item" } {
  return { value: item }
}
```

### Scoping

The loop variable (specified by `as`) and any `let` bindings inside the body are scoped to each iteration. They do not leak into the outer scope. The body can read variables from the parent scope:

```a0
let multiplier = 10

let results = for { in: [1, 2, 3], as: "n" } {
  let product = n * multiplier   # 'multiplier' from parent scope
  return { value: product }
}
# 'n' and 'product' are NOT accessible here

return { results: results }
```

## match -- Ok/Err Discrimination

`match` discriminates records that contain an `ok` or `err` key, enabling error-handling patterns.

```a0
# Match on a variable (identPath)
let output = match result {
  ok { val } {
    return { data: val }
  }
  err { e } {
    return { error: e }
  }
}

# Match on an expression (parenthesized)
let output = match ({ ok: 42 }) {
  ok { v } {
    return { value: v }
  }
  err { e } {
    return { error: e }
  }
}
```

- The subject must be a record with an `ok` or `err` key (`E_MATCH_NOT_RECORD` otherwise)
- When matching on a variable, use `match ident { ... }`
- When matching on an expression, wrap it in parentheses: `match ( expr ) { ... }`
- If the record has an `ok` key, the `ok` arm runs with the value bound to the specified name (`val`)
- If the record has an `err` key, the `err` arm runs with the value bound to the specified name (`e`)
- Both arms must end with `return`
- If neither key exists, execution fails with `E_MATCH_NO_ARM`

### Match Example

```a0
cap { sh.exec: true }
budget { timeMs: 10000, maxToolCalls: 1 }

do sh.exec { cmd: "node --version", timeoutMs: 5000 } -> result
let status = if {
  cond: eq { a: result.exitCode, b: 0 },
  then: { ok: result.stdout },
  else: { err: "node failed" }
}

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

### Creating Ok/Err Values

A0 doesn't have built-in `ok`/`err` constructors. You create these values as plain records:

```a0
let success = { ok: "some value" }
let failure = { err: "something went wrong" }
```

The `if` expression is often used to produce ok/err values based on conditions, as shown in the example above.
