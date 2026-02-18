---
sidebar_position: 1
---

# Standard Library

A0's standard library provides pure functions for data manipulation, predicates, and collection operations. Stdlib functions require no capabilities and never produce side effects.

## Calling Convention

Stdlib functions use record-style arguments, just like tool calls, but without `call?` or `do`:

```a0
let result = parse.json { in: rawString }
let name = get { in: record, path: "user.name" }
let combined = concat { a: list1, b: list2 }
```

## Error Model

Stdlib functions **throw** on errors. The evaluator catches these and wraps them as `E_FN` (exit 4). Programs that need to handle potential failures should validate inputs before calling stdlib functions.

```a0
# This will produce E_FN (exit 4) if rawData is not valid JSON
let parsed = parse.json { in: rawData }
```

## Function Reference

### Data

| Function | Description | Reference |
|----------|-------------|-----------|
| `parse.json` | Parse a JSON string | [Data Functions](./data-functions.md) |
| `get` | Get a value at a path | [Data Functions](./data-functions.md) |
| `put` | Set a value at a path | [Data Functions](./data-functions.md) |
| `patch` | Apply JSON Patch operations | [Data Functions](./data-functions.md) |

### Predicates

| Function | Description | Reference |
|----------|-------------|-----------|
| `eq` | Deep equality | [Predicates](./predicates.md) |
| `contains` | Substring, element, or key check | [Predicates](./predicates.md) |
| `not` | Boolean negation | [Predicates](./predicates.md) |
| `and` | Logical AND | [Predicates](./predicates.md) |
| `or` | Logical OR | [Predicates](./predicates.md) |

### List Operations

| Function | Description | Reference |
|----------|-------------|-----------|
| `len` | Length of list, string, or record | [List Operations](./list-operations.md) |
| `append` | Append an element to a list | [List Operations](./list-operations.md) |
| `concat` | Concatenate two lists | [List Operations](./list-operations.md) |
| `sort` | Sort a list | [List Operations](./list-operations.md) |
| `filter` | Filter list elements by a key | [List Operations](./list-operations.md) |
| `find` | Find an element by key-value match | [List Operations](./list-operations.md) |
| `range` | Generate a range of integers | [List Operations](./list-operations.md) |
| `join` | Join list elements into a string | [List Operations](./list-operations.md) |
| `map` | Apply a function to each element | [List Operations](./list-operations.md) |

### String Operations

| Function | Description | Reference |
|----------|-------------|-----------|
| `str.concat` | Concatenate parts into a string | [String Operations](./string-operations.md) |
| `str.split` | Split a string by separator | [String Operations](./string-operations.md) |
| `str.starts` | Check if string starts with a value | [String Operations](./string-operations.md) |
| `str.replace` | Replace all occurrences | [String Operations](./string-operations.md) |

### Record Operations

| Function | Description | Reference |
|----------|-------------|-----------|
| `keys` | Get record keys | [Record Operations](./record-operations.md) |
| `values` | Get record values | [Record Operations](./record-operations.md) |
| `merge` | Shallow-merge two records | [Record Operations](./record-operations.md) |
