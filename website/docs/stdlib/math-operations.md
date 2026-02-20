---
sidebar_position: 7
---

# Math Operations

Functions for numeric aggregation over lists.

## math.max

Get the maximum value from a list of numbers.

**Signature:** `math.max { in: list }` returns `number`.

```a0
let biggest = math.max { in: [3, 7, 1, 9, 4] }
# -> 9

return { biggest: biggest }
```

Throws `E_FN` if the list is empty or contains non-number values.

## math.min

Get the minimum value from a list of numbers.

**Signature:** `math.min { in: list }` returns `number`.

```a0
let smallest = math.min { in: [3, 7, 1, 9, 4] }
# -> 1

return { smallest: smallest }
```

Throws `E_FN` if the list is empty or contains non-number values.

## Example

Combine both to compute a range:

```a0
let scores = [85, 92, 78, 95, 88]
let highest = math.max { in: scores }
let lowest = math.min { in: scores }
let spread = highest - lowest

return { highest: highest, lowest: lowest, spread: spread }
```

## See Also

- [List Operations](./list-operations.md) -- sort, reduce, and other list functions
