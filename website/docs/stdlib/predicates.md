---
sidebar_position: 3
---

# Predicates

Boolean and comparison functions for conditional logic.

## Truthiness Rules

A0 uses the following truthiness rules across all predicate functions:

| Value | Truthy? |
|-------|---------|
| `false` | No |
| `null` | No |
| `0` | No |
| `""` (empty string) | No |
| Everything else | Yes |

## eq

Deep equality comparison using JSON serialization.

**Signature:** `eq { a: any, b: any }` returns `bool`.

```a0
let same = eq { a: 1, b: 1 }
# -> true

let diff = eq { a: "hello", b: "world" }
# -> false

let deep = eq {
  a: { x: 1, y: [2, 3] },
  b: { x: 1, y: [2, 3] }
}
# -> true

return { same: same }
```

## contains

Check for membership. Works on strings, lists, and records.

**Signature:** `contains { in: any, value: any }` returns `bool`.

Behavior by type:
- **String:** checks if `value` is a substring of `in` (both must be strings)
- **List:** checks if `value` is an element of `in` (deep equality)
- **Record:** checks if `value` is a key of `in` (value must be a string)

```a0
# String: substring check
let sub = contains { in: "hello world", value: "world" }
# -> true

# List: element membership
let elem = contains { in: [1, 2, 3], value: 2 }
# -> true

# Record: key existence
let hasKey = contains { in: { name: "alice" }, value: "name" }
# -> true

let missing = contains { in: { name: "alice" }, value: "email" }
# -> false

return { sub: sub }
```

## not

Boolean negation with truthiness coercion.

**Signature:** `not { in: any }` returns `bool`.

```a0
let a = not { in: false }
# -> true

let b = not { in: "hello" }
# -> false

let c = not { in: 0 }
# -> true

let d = not { in: null }
# -> true

return { a: a }
```

## and

Logical AND with truthiness coercion. Returns `true` only if both values are truthy.

**Signature:** `and { a: any, b: any }` returns `bool`.

```a0
let both = and { a: true, b: true }
# -> true

let mixed = and { a: true, b: false }
# -> false

let values = and { a: "hello", b: 42 }
# -> true

return { both: both }
```

## or

Logical OR with truthiness coercion. Returns `true` if either value is truthy.

**Signature:** `or { a: any, b: any }` returns `bool`.

```a0
let either = or { a: false, b: true }
# -> true

let neither = or { a: false, b: null }
# -> false

let first = or { a: "hello", b: false }
# -> true

return { either: either }
```

## coalesce

Null-coalescing: returns `in` if it is not `null`, otherwise returns `default`.

**Signature:** `coalesce { in: any, default: any }` returns `any`.

This uses **strict null-checking**, not truthiness. Values like `0`, `false`, and `""` are preserved -- only `null` triggers the fallback.

```a0
let a = coalesce { in: "hello", default: "fallback" }
# -> "hello"

let b = coalesce { in: null, default: "fallback" }
# -> "fallback"

let c = coalesce { in: 0, default: 42 }
# -> 0 (0 is NOT null, so it is preserved)

let d = coalesce { in: false, default: true }
# -> false (false is NOT null, so it is preserved)

let e = coalesce { in: "", default: "default" }
# -> "" (empty string is NOT null, so it is preserved)

return { a: a, b: b, c: c }
```

:::tip
Use `coalesce` when you want to provide defaults for missing values without accidentally discarding `0`, `false`, or `""`. This is different from `if` with truthiness, which would treat those values as falsy.
:::

## typeof

Returns the A0 type name of a value as a string.

**Signature:** `typeof { in: any }` returns `str`.

Possible return values: `"null"`, `"boolean"`, `"number"`, `"string"`, `"list"`, `"record"`.

```a0
let a = typeof { in: null }
# -> "null"

let b = typeof { in: true }
# -> "boolean"

let c = typeof { in: 42 }
# -> "number"

let d = typeof { in: 3.14 }
# -> "number"

let e = typeof { in: "hello" }
# -> "string"

let f = typeof { in: [1, 2, 3] }
# -> "list"

let g = typeof { in: { name: "alice" } }
# -> "record"

return { a: a, b: b, c: c, d: d, e: e, f: f, g: g }
```

Both integers and floats return `"number"`.

## See Also

- [List Operations](./list-operations.md) -- filter, find (use predicates internally)
- [Data Functions](./data-functions.md) -- eq is useful for testing patch results
