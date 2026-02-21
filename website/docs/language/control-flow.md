---
sidebar_position: 4
---

# Control Flow

A0 provides control flow constructs: `if` for conditionals (two forms), `for` for iteration, `filter` for inline list filtering, `loop` for iterative convergence, `match` for ok/err discrimination, and `try/catch` for error handling.

## if -- Conditional Expression

A0 supports two forms of `if`: a record-style expression and a block-style statement.

### Record-Style if

The record-style `if` is an expression that returns a value based on a condition. It uses three fields:

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

### Block-Style if/else

The block-style `if/else` uses a parenthesized condition and block bodies. Both `if` and `else` branches are required, and each must end with `return`:

```a0
let result = if (score >= 60) {
  return "pass"
} else {
  return "fail"
}
```

- The condition must be wrapped in parentheses `( )`
- Both the `if` branch and the `else` branch are required
- Each branch is a block `{ ... }` that **must end with `return`**
- The whole expression evaluates to the value returned by the taken branch
- [Truthiness](./data-types.md) rules apply to the condition

#### Block if/else Examples

Simple branching:

```a0
let x = 10
let label = if (x > 5) {
  return "big"
} else {
  return "small"
}
return { label: label }
```

With tool calls in branches:

```a0
cap { fs.read: true, fs.write: true }
budget { timeMs: 10000, maxToolCalls: 2 }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw.data }

let output = if (eq { a: config.mode, b: "verbose" }) {
  do fs.write { path: "out.txt", data: config, format: "json" } -> written
  return { mode: "verbose", wrote: written }
} else {
  return { mode: "quiet", summary: keys { in: config } }
}

return output
```

Nested block if/else:

```a0
let category = if (score >= 90) {
  return "A"
} else {
  let mid = if (score >= 70) {
    return "B"
  } else {
    return "C"
  }
  return mid
}
return { grade: category }
```

### Choosing Between Record-Style and Block-Style

Use **record-style** `if { cond:, then:, else: }` for simple inline expressions where each branch is a single value. Use **block-style** `if () { } else { }` when branches need multiple statements, tool calls, or complex logic.

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

### Tool Calls in for Loops

`call?` and `do` work inside `for` bodies, allowing you to make tool calls on each iteration. Each tool call counts against the `maxToolCalls` budget:

```a0
cap { http.get: true }
budget { timeMs: 30000, maxToolCalls: 5, maxIterations: 5 }

let urls = [
  "https://api.example.com/users/1",
  "https://api.example.com/users/2",
  "https://api.example.com/users/3"
]

let results = for { in: urls, as: "url" } {
  call? http.get { url: url } -> response
  let body = parse.json { in: response.body }
  return { url: url, name: get { in: body, path: "name" } }
}

return { users: results }
```

This is useful for batch operations -- fetching multiple resources, processing files in a directory, or running a series of commands.

### Budget Control

The `maxIterations` budget field limits the total number of iterations across all `for` loops, `filter` blocks, `loop` iterations, `map`, `reduce`, and `filter` (with `fn:`) calls in a program. If the limit is exceeded, execution stops with `E_BUDGET`:

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

## try/catch -- Error Handling

`try/catch` lets you catch runtime errors instead of halting execution. The catch binding receives a record with `code` and `message` fields describing the error.

```a0
let result = try {
  let parsed = parse.json { in: "not valid json" }
  return { data: parsed }
} catch { e } {
  return { error: e.code, detail: e.message }
}
```

- The `try` block is executed first
- If the `try` block completes without error, its `return` value is used
- If the `try` block throws a runtime error, the `catch` block runs
- The catch binding (e.g., `e`) receives a record: `{ code: "E_...", message: "..." }`
- Both blocks must end with `return`
- The whole expression evaluates to the value returned by whichever block executed

### Catch Binding

The catch binding is always a record with two fields:

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | The diagnostic code (e.g., `"E_FN"`, `"E_TOOL"`, `"E_TYPE"`) |
| `message` | string | A human-readable error description |

### try/catch Examples

Catching a tool error:

```a0
cap { fs.read: true }
budget { timeMs: 5000, maxToolCalls: 1 }

let result = try {
  call? fs.read { path: "missing-file.txt" } -> data
  return { ok: data }
} catch { e } {
  return { err: e.message, code: e.code }
}

return result
```

Using try/catch with match for structured error handling:

```a0
cap { http.get: true }
budget { timeMs: 10000, maxToolCalls: 1 }

let response = try {
  call? http.get { url: "https://api.example.com/data" } -> resp
  let body = parse.json { in: resp.body }
  return { ok: body }
} catch { e } {
  return { err: e.message }
}

let output = match response {
  ok { data } {
    return { status: "success", data: data }
  }
  err { msg } {
    return { status: "failed", reason: msg }
  }
}

return output
```

Catching type errors:

```a0
let result = try {
  let x = "hello" + 42
  return { value: x }
} catch { e } {
  return { caught: true, code: e.code }
}
# result == { caught: true, code: "E_TYPE" }

return result
```

## filter -- Inline List Filtering

`filter` with a block body filters a list inline. The block runs for each element; items where the body returns a truthy value are kept.

```a0
let nums = [1, -2, 3, -4, 5, 0]
let positives = filter { in: nums, as: "x" } {
  return x > 0
}
# positives == [1, 3, 5]
return positives
```

- `in` -- the list to filter (must be a list)
- `as` -- the name to bind each element to (a string)
- The body is a block `{ ... }` that **must end with `return`**
- Items where the return value is truthy are kept; falsy items are discarded
- If the body returns a record, the first value is checked for truthiness (for backward compat with `fn:` predicates)
- Counts against `maxIterations` budget

### Filter Block Examples

Filtering records by field:

```a0
let users = [
  { name: "Alice", active: true },
  { name: "Bob", active: false },
  { name: "Carol", active: true }
]
let active = filter { in: users, as: "u" } {
  return u.active
}
return { active: active }
```

Complex predicate with multiple conditions:

```a0
budget { maxIterations: 100 }

let items = [
  { name: "Widget", price: 25, inStock: true },
  { name: "Gadget", price: 150, inStock: true },
  { name: "Gizmo", price: 10, inStock: false }
]
let affordable_available = filter { in: items, as: "item" } {
  let cheap = item.price < 100
  return and { a: cheap, b: item.inStock }
}
return { results: affordable_available }
```

### Other Filter Forms

A0 also supports two record-style filter forms (without a block):

- `filter { in: list, by: "key" }` -- keep items where field `key` is truthy
- `filter { in: list, fn: "pred" }` -- keep items where predicate function `pred` returns truthy

The inline block form is preferred for most filtering tasks.

## loop -- Iterative Convergence

`loop` runs a body a fixed number of times, threading a value through each iteration. The result of each iteration becomes the input to the next.

```a0
let result = loop { in: 0, times: 5, as: "x" } {
  return x + 1
}
# result == 5
return result
```

- `in` -- the initial value (any type)
- `times` -- the number of iterations (must be a non-negative integer; `E_TYPE` otherwise)
- `as` -- the name to bind the current value to (a string)
- The body is a block `{ ... }` that **must end with `return`**
- The return value of each iteration becomes the binding for the next
- If `times` is 0, the initial value is returned unchanged
- Counts against `maxIterations` budget

### Loop Examples

Simple counter:

```a0
let count = loop { in: 0, times: 10, as: "n" } {
  return n + 1
}
return { count: count }
# count == 10
```

Record accumulator:

```a0
let result = loop { in: { total: 0, count: 0 }, times: 3, as: "state" } {
  return { total: state.total + 10, count: state.count + 1 }
}
return result
# result == { total: 30, count: 3 }
```

Zero iterations returns the initial value:

```a0
let result = loop { in: 42, times: 0, as: "x" } {
  return x + 1
}
return result
# result == 42
```

### When to Use loop vs for

- Use `for` when iterating over a **list of items** to produce a new list
- Use `loop` when iterating a **fixed number of times**, threading state through each iteration
- `loop` is bounded by design (`times:` not `until:`) -- consistent with A0's safety model

## Record Spread

Records support the spread operator `...` to merge fields from an existing record into a new one. Later keys override earlier ones:

```a0
let base = { host: "localhost", port: 8080, debug: false }
let config = { ...base, debug: true, name: "my-app" }
# config == { host: "localhost", port: 8080, debug: true, name: "my-app" }
return config
```

- `...expr` must appear inside a record literal `{ }`
- The spread expression must evaluate to a record (`E_TYPE` otherwise)
- Multiple spreads are allowed; later keys override earlier ones
- Explicit keys in the record also override spread keys

### Spread Examples

Overriding defaults:

```a0
let defaults = { timeout: 5000, retries: 3, verbose: false }
let user_opts = { timeout: 10000, verbose: true }
let final = { ...defaults, ...user_opts }
# final == { timeout: 10000, retries: 3, verbose: true }
return final
```

Adding computed fields:

```a0
let item = { name: "widget", price: 10 }
let with_tax = { ...item, total: item.price * 1.2 }
# with_tax == { name: "widget", price: 10, total: 12 }
return with_tax
```
