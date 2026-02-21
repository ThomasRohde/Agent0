---
sidebar_position: 5
---

# Functions

A0 supports user-defined functions with `fn` and higher-order list operations (`map`, `reduce`, `filter`) that accept function names.

## Defining Functions

Define a function with `fn`, specifying its name, parameters, and body:

```a0
fn greet { name } {
  return { greeting: "hello", who: name }
}
```

Functions must be **defined before use** -- A0 has no hoisting.

### Calling Functions

Call a function with record-style arguments:

```a0
let result = greet { name: "world" }
# result == { greeting: "hello", who: "world" }
```

Arguments are always passed as a record. Parameters are destructured from the caller's record keys.

### Multiple Parameters

```a0
fn add { a, b } {
  return { sum: a + b }
}

let result = add { a: 3, b: 4 }
# result == { sum: 7 }
```

### Missing Parameters

Parameters not provided by the caller default to `null`:

```a0
fn greet { name, title } {
  let display = if { cond: title, then: str.concat { parts: [title, " ", name] }, else: name }
  return { greeting: display }
}

let a = greet { name: "Alice", title: "Dr." }
# a == { greeting: "Dr. Alice" }

let b = greet { name: "Bob" }
# b == { greeting: "Bob" } (title is null, which is falsy)
```

### Function Body Rules

- The body is a block `{ ... }` that **must end with `return`**
- The body can contain any statements: `let` bindings, tool calls, other function calls, control flow
- Function bodies use lexical scope (definition-site parent-chained scoping)
- Caller-local bindings do not override captured outer bindings in function bodies

### Closures

Functions are closures -- they capture and can access variables from their defining scope. This means a function can reference any variable that was in scope when it was defined, not just its own parameters:

```a0
let tax_rate = 0.2

fn add_tax { price } {
  let total = price + price * tax_rate
  return { total: total }
}

let result = add_tax { price: 100 }
# result == { total: 120 }
return result
```

Closures work with higher-order functions too. A function passed to `map`, `filter`, or `reduce` can access outer-scope variables:

```a0
let threshold = 50

fn is_above_threshold { val } {
  return { ok: val > threshold }
}

let nums = [10, 60, 30, 80, 45]
let above = filter { in: nums, fn: "is_above_threshold" }
# above == [60, 80]

return { above: above }
```

Nested functions can access variables from any enclosing scope:

```a0
let prefix = "item"
let separator = "-"

fn make_label { id } {
  let label = str.concat { parts: [prefix, separator, id] }
  return { label: label }
}

let labels = map { in: ["001", "002", "003"], fn: "make_label" }
return { labels: labels }
```

### Example: Shell Command Wrapper

```a0
cap { sh.exec: true }
budget { timeMs: 10000, maxToolCalls: 2 }

fn check_cmd { cmd } {
  do sh.exec { cmd: cmd, timeoutMs: 5000 } -> result
  let ok = eq { a: result.exitCode, b: 0 }
  return { cmd: cmd, ok: ok, stdout: result.stdout }
}

let node_check = check_cmd { cmd: "node --version" }
let npm_check = check_cmd { cmd: "npm --version" }

return { node: node_check, npm: npm_check }
```

## Higher-Order List Functions

A0 provides three higher-order list functions that accept user-defined functions by name: `map`, `reduce`, and `filter`. All three share the `maxIterations` budget counter with `for`.

### map -- Transform Each Element

`map` applies a user-defined function to every element of a list, returning a new list of results.

```a0
fn double { x } {
  return { val: x * 2 }
}

let nums = [1, 2, 3, 4, 5]
let doubled = map { in: nums, fn: "double" }
# doubled == [{ val: 2 }, { val: 4 }, { val: 6 }, { val: 8 }, { val: 10 }]
```

- `in` -- the list to map over (must be a list; `E_TYPE` otherwise)
- `fn` -- the name of the function to apply, as a string (must be a defined `fn`; `E_UNKNOWN_FN` otherwise)

#### Multi-Parameter Destructuring

When list elements are records, their keys are destructured into the function's parameters:

```a0
fn formatUser { name, age } {
  let label = str.concat { parts: [name, " (age ", age, ")"] }
  return { label: label, name: name }
}

let users = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 }
]
let formatted = map { in: users, fn: "formatUser" }
# formatted == [
#   { label: "Alice (age 30)", name: "Alice" },
#   { label: "Bob (age 25)", name: "Bob" }
# ]
```

#### Budget Awareness

`map` shares the `maxIterations` budget counter with `for`, `reduce`, and `filter` (with `fn:`). If the combined iterations exceed the limit, execution stops with `E_BUDGET`.

#### Error Propagation

If the function throws an error on any element, `map` stops immediately. There are no partial results.

### filter with fn: -- Predicate-Based Filtering

`filter` with a `fn:` argument calls a user-defined predicate function on each element. If the predicate returns a record, filter checks the truthiness of the **first value** in the record (not the record itself). By convention, predicate functions return `{ ok: expr }`, and items where the `ok` value is truthy are kept. If the predicate returns a non-record value (e.g., a boolean), its truthiness is checked directly. The **original items** are preserved in the result (not the predicate's return value).

For most filtering tasks, the inline [filter block](./control-flow.md#filter----inline-list-filtering) form is preferred over `filter` with `fn:`.

```a0
fn isLong { s } {
  let length = len { in: s }
  return { ok: length > 3 }
}

let words = ["hi", "hello", "hey", "goodbye"]
let long = filter { in: words, fn: "isLong" }
# long == ["hello", "goodbye"]
```

Like `map`, multi-parameter functions receive destructured record fields. See [List Operations -- filter](../stdlib/list-operations.md#filter-by-predicate-function) for full details.

## Recursion

Direct recursion is allowed:

```a0
fn factorial { n } {
  let result = if {
    cond: eq { a: n, b: 0 },
    then: 1,
    else: n * factorial { n: n - 1 }
  }
  return { value: result }
}

let result = factorial { n: 5 }
return { factorial: result }
```

Be mindful of stack depth -- A0 does not have tail-call optimization.

## Restrictions

- **No hoisting**: functions must be defined before they are called
- **No duplicate names**: defining two functions with the same name produces `E_FN_DUP`
- **Record arguments only**: function arguments must be records `{ key: value }`
- **Return required**: the function body must end with `return`
- **No first-class function values**: functions cannot be assigned to variables or passed as values -- they are referenced by name (as a string) when used with `map`, `filter`, and `reduce`
