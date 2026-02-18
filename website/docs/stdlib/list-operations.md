---
sidebar_position: 4
---

# List Operations

Functions for creating, transforming, and querying lists.

## len

Get the length of a list, string, or record.

**Signature:** `len { in: list | str | rec }` returns `int`.

```a0
let listLen = len { in: [1, 2, 3] }
# -> 3

let strLen = len { in: "hello" }
# -> 5

let recLen = len { in: { a: 1, b: 2 } }
# -> 2

return { listLen: listLen }
```

Throws `E_FN` if `in` is not a list, string, or record.

## append

Append a value to the end of a list. Returns a new list.

**Signature:** `append { in: list, value: any }` returns `list`.

```a0
let items = [1, 2, 3]
let more = append { in: items, value: 4 }
# -> [1, 2, 3, 4]

return { more: more }
```

## concat

Concatenate two lists. Returns a new list.

**Signature:** `concat { a: list, b: list }` returns `list`.

```a0
let combined = concat { a: [1, 2], b: [3, 4] }
# -> [1, 2, 3, 4]

return { combined: combined }
```

## sort

Sort a list. Returns a new sorted list.

**Signature:** `sort { in: list, by?: str }` returns `list`.

Without `by`, sorts by natural order: numbers numerically, strings lexicographically.

With `by`, sorts a list of records by the specified key.

```a0
let nums = sort { in: [3, 1, 2] }
# -> [1, 2, 3]

let words = sort { in: ["banana", "apple", "cherry"] }
# -> ["apple", "banana", "cherry"]

let people = [
  { name: "charlie", age: 25 },
  { name: "alice", age: 30 },
  { name: "bob", age: 20 }
]
let byAge = sort { in: people, by: "age" }
# -> [{ name: "bob", age: 20 }, { name: "charlie", age: 25 }, { name: "alice", age: 30 }]

return { nums: nums }
```

## filter

Filter a list of records, keeping elements where the specified key is truthy.

**Signature:** `filter { in: list, by: str }` returns `list`.

Each element must be a record. Elements where `element[by]` is truthy (see [truthiness rules](./predicates.md#truthiness-rules)) are kept.

```a0
let items = [
  { name: "alice", active: true },
  { name: "bob", active: false },
  { name: "charlie", active: true }
]

let active = filter { in: items, by: "active" }
# -> [{ name: "alice", active: true }, { name: "charlie", active: true }]

return { active: active }
```

## find

Find the first record in a list where a key matches a value (deep equality).

**Signature:** `find { in: list, key: str, value: any }` returns the matching element or `null`.

```a0
let users = [
  { id: 1, name: "alice" },
  { id: 2, name: "bob" },
  { id: 3, name: "charlie" }
]

let bob = find { in: users, key: "name", value: "bob" }
# -> { id: 2, name: "bob" }

let missing = find { in: users, key: "name", value: "dave" }
# -> null

return { bob: bob }
```

## range

Generate a list of integers from `from` (inclusive) to `to` (exclusive).

**Signature:** `range { from: int, to: int }` returns `list`.

```a0
let nums = range { from: 0, to: 5 }
# -> [0, 1, 2, 3, 4]

let empty = range { from: 5, to: 5 }
# -> []

return { nums: nums }
```

Returns an empty list if `from >= to`.

## join

Join list elements into a string with an optional separator.

**Signature:** `join { in: list, sep?: str }` returns `str`.

All elements are coerced to strings. The default separator is `""` (no separator).

```a0
let words = join { in: ["hello", "world"], sep: " " }
# -> "hello world"

let csv = join { in: [1, 2, 3], sep: "," }
# -> "1,2,3"

let compact = join { in: ["a", "b", "c"] }
# -> "abc"

return { words: words }
```

## map

Apply a user-defined function to each element of a list. Returns a new list of results.

**Signature:** `map { in: list, fn: str }` returns `list`.

The `fn` argument is the name of a user-defined function (as a string). The function is called once per element. If the function takes a single parameter, it receives the element directly. If it takes multiple parameters, the element (which must be a record) is destructured into those parameters.

Map iterations count toward the [`maxIterations`](../capabilities/budgets.md) budget.

```a0
fn double { n } {
  return { value: n * 2 }
}

let nums = [1, 2, 3, 4]
let doubled = map { in: nums, fn: "double" }
# -> [{ value: 2 }, { value: 4 }, { value: 6 }, { value: 8 }]

return { doubled: doubled }
```

Map with record destructuring:

```a0
fn fullName { first, last } {
  return { name: str.concat { parts: [first, " ", last] } }
}

let people = [
  { first: "Alice", last: "Smith" },
  { first: "Bob", last: "Jones" }
]
let names = map { in: people, fn: "fullName" }
# -> [{ name: "Alice Smith" }, { name: "Bob Jones" }]

return { names: names }
```

## See Also

- [Predicates](./predicates.md) -- Truthiness rules used by filter
- [String Operations](./string-operations.md) -- str.concat for building strings
- [Budgets](../capabilities/budgets.md) -- maxIterations budget for map and for loops
