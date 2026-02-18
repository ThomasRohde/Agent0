---
sidebar_position: 8
---

# Arithmetic and Expressions

A0 supports arithmetic operators, comparison operators, and parenthesized grouping with standard mathematical precedence. This example also demonstrates several stdlib utility functions.

## Source: arithmetic-test.a0

```a0
let x = (2 + 3) * 4
let items = range { from: 0, to: 5 }
let total = len { in: items }
let bigger = total > 3
let sorted = sort { in: [3, 1, 2] }
let greeting = str.concat { parts: ["hello", " ", "world"] }
let k = keys { in: { a: 1, b: 2 } }
return { x: x, items: items, total: total, bigger: bigger, sorted: sorted, greeting: greeting, k: k }
```

## Line-by-line walkthrough

### Line 1: Arithmetic with precedence

```a0
let x = (2 + 3) * 4
```

A0 supports the standard arithmetic operators with conventional precedence:

| Operator | Meaning | Precedence |
|----------|---------|------------|
| `*`, `/`, `%` | Multiply, divide, modulo | Higher |
| `+`, `-` | Add, subtract | Lower |
| Unary `-` | Negation | Highest |

Parentheses `( )` override precedence. Without parentheses, `2 + 3 * 4` would evaluate to `14`. With parentheses, `(2 + 3) * 4` evaluates to `20`.

### Line 2: Generating a range

```a0
let items = range { from: 0, to: 5 }
```

`range` generates a list of integers from `from` (inclusive) to `to` (exclusive). Result: `[0, 1, 2, 3, 4]`.

### Line 3: List length

```a0
let total = len { in: items }
```

`len` returns the number of elements in a list. Result: `5`.

### Line 4: Comparison operators

```a0
let bigger = total > 3
```

A0 supports comparison operators that return booleans:

| Operator | Meaning |
|----------|---------|
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `==` | Equal |
| `!=` | Not equal |

Here `total > 3` evaluates to `true` since `5 > 3`.

### Line 5: Sorting a list

```a0
let sorted = sort { in: [3, 1, 2] }
```

`sort` returns a new list with elements in ascending order. Result: `[1, 2, 3]`.

### Line 6: String concatenation

```a0
let greeting = str.concat { parts: ["hello", " ", "world"] }
```

`str.concat` joins a list of values into a single string. Non-string values are converted to their string representation. Result: `"hello world"`.

### Line 7: Record keys

```a0
let k = keys { in: { a: 1, b: 2 } }
```

`keys` returns the keys of a record as a list of strings. Result: `["a", "b"]`.

### Line 8: Return

```a0
return { x: x, items: items, total: total, bigger: bigger, sorted: sorted, greeting: greeting, k: k }
```

## Expected output

```json
{
  "x": 20,
  "items": [0, 1, 2, 3, 4],
  "total": 5,
  "bigger": true,
  "sorted": [1, 2, 3],
  "greeting": "hello world",
  "k": ["a", "b"]
}
```

## Running it

```bash
a0 run examples/arithmetic-test.a0
```

No capabilities or budget are needed -- this program uses only pure computation and stdlib functions.

## Key takeaways

- Arithmetic operators follow standard precedence (`*`/`/`/`%` before `+`/`-`)
- Parentheses `( )` override precedence
- Comparison operators (`>`, `<`, `>=`, `<=`, `==`, `!=`) return booleans
- Stdlib functions like `range`, `len`, `sort`, `str.concat`, and `keys` operate on structured data
- Pure programs (no tool calls) need no `cap` or `budget` declarations
