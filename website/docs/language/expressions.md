---
sidebar_position: 3
---

# Expressions

A0 supports arithmetic and comparison expressions with standard mathematical precedence.

## Arithmetic Operators

Arithmetic operators (`-`, `*`, `/`, `%`) work on numbers (integers and floats). Using them on non-numeric values produces an `E_TYPE` error.

The `+` operator works on both numbers and strings:
- **Numbers**: addition (`3 + 4` produces `7`)
- **Strings**: concatenation (`"hello" + " world"` produces `"hello world"`)
- **Mixed types**: produces `E_TYPE` (`"hello" + 1` is an error)

Both operands must be the same type -- either both numbers or both strings.

```a0
let sum = a + b        # addition (numbers) or concatenation (strings)
let diff = a - b       # subtraction
let product = a * b    # multiplication
let ratio = a / b      # division
let remainder = a % b  # modulo
```

When mixing integers and floats, the result is a float:

```a0
let x = 10 + 3.5   # 13.5 (float)
let y = 10 / 3     # 3.333... (float)
```

String concatenation with `+`:

```a0
let greeting = "hello" + " " + "world"   # "hello world"
let path = dir + "/" + file               # build a path
```

Division or modulo by zero produces an `E_TYPE` error.

## Comparison Operators

Comparisons return a boolean (`true` or `false`).

```a0
let bigger = a > b
let smaller = a < b
let at_least = a >= b
let at_most = a <= b
let same = a == b
let different = a != b
```

**Numbers** are compared by value. **Strings** are compared lexicographically. Comparing incompatible types (e.g., a string and a number) produces an `E_TYPE` error.

```a0
let x = 10 > 5         # true
let y = "abc" < "def"  # true
let z = 3 == 3         # true
```

## Operator Precedence

Precedence follows standard mathematical rules:

| Precedence | Operators | Description |
|------------|-----------|-------------|
| Highest | `-` (unary) | Unary negation |
| High | `*`, `/`, `%` | Multiplication, division, modulo |
| Medium | `+`, `-` | Addition, subtraction |
| Lowest | `>`, `<`, `>=`, `<=`, `==`, `!=` | Comparison |

This means `a + b * c` is evaluated as `a + (b * c)`, and `a + 1 > b` is evaluated as `(a + 1) > b`.

## Parentheses

Use parentheses to override precedence:

```a0
let x = (2 + 3) * 4     # 20, not 14
let y = -(a + b)         # negate the sum
let z = (a + b) > (c + d)  # compare two sums
```

## Unary Minus

Negate a numeric value:

```a0
let neg = -x
let offset = -(a + b)
```

Unary minus has the highest precedence of all operators. Using it on a non-number produces an `E_TYPE` error.

## Expressions in Context

Expressions can appear anywhere a value is expected:

```a0
# In let bindings
let total = price * quantity + tax

# In record values
let result = { sum: a + b, product: a * b }

# In list elements
let coords = [x + 1, y - 1]

# In function arguments
let items = range { from: 0, to: count - 1 }

# In conditionals
let msg = if { cond: score >= 60, then: "pass", else: "fail" }

# In assertions (fatal -- halts on failure)
let valid = len { in: items } > 0
assert { that: valid, msg: "list is not empty" }
```

## Complete Example

```a0
let items = range { from: 0, to: 5 }
let total = len { in: items }
let bigger = total > 3
let x = (2 + 3) * 4
let sorted = sort { in: [3, 1, 2] }
let greeting = str.concat { parts: ["hello", " ", "world"] }
let k = keys { in: { a: 1, b: 2 } }

return {
  x: x,
  items: items,
  total: total,
  bigger: bigger,
  sorted: sorted,
  greeting: greeting,
  k: k
}
```
