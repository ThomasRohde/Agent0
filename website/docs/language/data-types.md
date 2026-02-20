---
sidebar_position: 1
---

# Data Types

A0 has a small set of data types that map directly to JSON. Every value in A0 can be serialized to JSON and back without loss.

## Null

```a0
let nothing = null
```

Represents the absence of a value. `null` is falsy.

## Booleans

```a0
let yes = true
let no = false
```

The two boolean literals. `false` is falsy; `true` is truthy.

## Integers

```a0
let count = 42
let negative = -7
let zero = 0
```

Whole numbers. `0` is falsy; all other integers are truthy.

## Floats

```a0
let pi = 3.14
let tiny = 0.001
```

Decimal numbers. Floats and integers can be mixed in arithmetic -- the result is a float when either operand is a float.

## Strings

```a0
let name = "hello"
let empty = ""
let escaped = "line one\nline two"
```

Strings are double-quoted and support JSON escape sequences:

| Escape | Character |
|--------|-----------|
| `\"` | Double quote |
| `\\` | Backslash |
| `\n` | Newline |
| `\t` | Tab |
| `\/` | Forward slash |
| `\uXXXX` | Unicode code point |

The empty string `""` is falsy; all other strings are truthy.

Strings can be concatenated with the `+` operator:

```a0
let full = "hello" + " " + "world"   # "hello world"
```

Both operands must be strings -- `"hello" + 1` produces `E_TYPE`. For joining mixed types, use `str.concat`.

## Records

```a0
let user = { name: "Alice", age: 30 }
let nested = { data: { items: [1, 2, 3] } }
let caps = { fs.read: true, http.get: true }
```

Records are key-value structures, equivalent to JSON objects. Keys are unquoted identifiers. Values can be any A0 type, including nested records and lists.

**Dotted keys** are supported for capability-style declarations:

```a0
cap { fs.read: true, fs.write: true }
```

Access record fields with dot notation:

```a0
let name = user.name        # "Alice"
let items = nested.data.items  # [1, 2, 3]
```

**Record spread** merges fields from an existing record into a new one. Later keys override earlier:

```a0
let base = { host: "localhost", port: 8080 }
let config = { ...base, port: 9090, debug: true }
# config == { host: "localhost", port: 9090, debug: true }
```

The spread expression must evaluate to a record (`E_TYPE` otherwise). See [Control Flow -- Record Spread](./control-flow.md#record-spread) for more examples.

## Lists

```a0
let numbers = [1, 2, 3]
let mixed = [1, "two", true, null]
let nested_list = [[1, 2], [3, 4]]
let empty_list = []
```

Ordered sequences of values. Lists can contain any mix of types, including other lists and records.

Lists are commonly used with [control flow](./control-flow.md) constructs like `for` and higher-order functions like `map`.

## Truthiness

A0 uses truthiness for conditionals (`if`) and predicate functions. The rules are simple:

| Value | Truthy? |
|-------|---------|
| `false` | No |
| `null` | No |
| `0` | No |
| `""` (empty string) | No |
| Everything else | Yes |

Records, lists (even empty ones), non-zero numbers, and non-empty strings are all truthy.

```a0
# These are all falsy:
let a = if { cond: false, then: "yes", else: "no" }   # "no"
let b = if { cond: null, then: "yes", else: "no" }    # "no"
let c = if { cond: 0, then: "yes", else: "no" }       # "no"
let d = if { cond: "", then: "yes", else: "no" }       # "no"

# These are all truthy:
let e = if { cond: 1, then: "yes", else: "no" }       # "yes"
let f = if { cond: "hello", then: "yes", else: "no" } # "yes"
let g = if { cond: [], then: "yes", else: "no" }      # "yes"
```

## Type Errors

A0 checks types at runtime. Using an operation on the wrong type produces an `E_TYPE` error (exit code 4). For example:

- Mixed-type `+`: `"hello" + 1` produces `E_TYPE` (both operands must be the same type)
- Property access on non-records: `42.field` produces `E_PATH`
- Comparing incompatible types: `"hello" > 42` produces `E_TYPE`

See [Expressions](./expressions.md) for details on which operations work with which types.
