---
sidebar_position: 2
---

# Bindings

A0 has two ways to bind values to names: `let` bindings and arrow bindings (`->`). Once a name is bound, it cannot be reassigned.

## Let Bindings

Bind the result of an expression to a name:

```a0
let name = "Alice"
let count = 42
let data = { key: "value" }
let items = [1, 2, 3]
```

The right-hand side can be any expression: a literal, a record, a list, an arithmetic expression, a function call, or a control flow expression.

```a0
let total = price * quantity
let parsed = parse.json { in: raw_string }
let message = if { cond: ok, then: "success", else: "failure" }
```

## Arrow Bindings

Bind the result of a tool call or other statement to a name:

```a0
call? http.get { url: "https://example.com/api" } -> response
do fs.write { path: "out.json", data: result, format: "json" } -> artifact
do sh.exec { cmd: "echo hello", timeoutMs: 5000 } -> output
```

The `-> name` syntax appears after a statement and captures its result. This is the primary way to capture tool return values.

### Dotted Arrow Targets

Arrow targets can use dotted paths to create nested records:

```a0
{ x: 1 } -> data.info
# data = { info: { x: 1 } }

42 -> a.b.c
# a = { b: { c: 42 } }
```

A single-part target (`-> name`) works as before. Multi-part targets (`-> a.b`) wrap the value in nested records, binding only the first part as a variable name.

## No Reassignment

A0 does not allow reassignment. Binding the same name twice in the same scope produces an `E_DUP_BINDING` error:

```a0
let x = 1
let x = 2   # Error: E_DUP_BINDING
```

This applies to both `let` and `->` bindings. If you need a new value, use a new name:

```a0
call? fs.read { path: "data.json" } -> raw
let parsed = parse.json { in: raw }
let transformed = get { in: parsed, path: "items" }
```

## Scoping

A0 uses **parent-chained scoping**. The top-level program has its own scope. Nested constructs -- `for` bodies, `fn` bodies, and `match` arms -- each create a child scope.

A child scope can read names from its parent scope, but names defined in a child scope are not visible outside it:

```a0
let multiplier = 10

let results = for { in: [1, 2, 3], as: "item" } {
  # 'multiplier' is visible here (from parent scope)
  # 'item' is only visible inside this body
  let product = item * multiplier
  return { value: product }
}

# 'item' and 'product' are NOT visible here
return { results: results }
```

Function parameters and loop variables are scoped to their body:

```a0
fn greet { name } {
  # 'name' is only visible inside this function
  return { message: str.concat { parts: ["Hello, ", name, "!"] } }
}

# 'name' is NOT visible here
let result = greet { name: "world" }
return { result: result }
```

## Property Access

Use dot notation to access fields on records:

```a0
let user = { name: "Alice", age: 30 }
let name = user.name     # "Alice"
let age = user.age       # 30
```

This works on any bound variable that holds a record, including tool return values:

```a0
call? http.get { url: "https://example.com/api" } -> response
let status = response.status
let body = response.body
```

Chained access is supported:

```a0
let data = { user: { name: "Alice" } }
let name = data.user.name   # "Alice"
```

Accessing a property on a non-record value produces an `E_PATH` error.

## Unbound Variables

Using a name that hasn't been bound produces an `E_UNBOUND` error. This is caught at validation time by `a0 check`:

```a0
let result = unknown_name   # Error: E_UNBOUND
```

All variables must be bound with `let` or `->` before use.
