---
sidebar_position: 6
---

# Record Operations

Functions for inspecting and combining records.

## keys

Get the keys of a record as a list of strings.

**Signature:** `keys { in: rec }` returns `list`.

```a0
let k = keys { in: { name: "alice", age: 30 } }
# -> ["name", "age"]

return { k: k }
```

Throws `E_FN` if `in` is not a record.

## values

Get the values of a record as a list.

**Signature:** `values { in: rec }` returns `list`.

```a0
let v = values { in: { name: "alice", age: 30 } }
# -> ["alice", 30]

return { v: v }
```

Throws `E_FN` if `in` is not a record.

## merge

Shallow-merge two records. Keys in `b` override keys in `a`.

**Signature:** `merge { a: rec, b: rec }` returns `rec`.

```a0
let base = { name: "alice", role: "user" }
let overrides = { role: "admin", active: true }

let merged = merge { a: base, b: overrides }
# -> { name: "alice", role: "admin", active: true }

return { merged: merged }
```

Build up a record incrementally:

```a0
let step1 = { status: "ok" }
let step2 = merge { a: step1, b: { count: 5 } }
let step3 = merge { a: step2, b: { timestamp: "2025-01-01" } }
# -> { status: "ok", count: 5, timestamp: "2025-01-01" }

return { config: step3 }
```

The merge is shallow -- nested records are not recursively merged. Use [`put`](./data-functions.md) or [`patch`](./data-functions.md) for deep updates.

## entries

Convert a record into a list of `{ key, value }` pairs.

**Signature:** `entries { in: rec }` returns `list`.

Each key-value pair in the record becomes a record with `key` (string) and `value` fields.

```a0
let pairs = entries { in: { name: "alice", age: 30 } }
# -> [{ key: "name", value: "alice" }, { key: "age", value: 30 }]

return { pairs: pairs }
```

This is useful for iterating over record fields with `for` or `map`:

```a0
let config = { host: "localhost", port: 8080, debug: true }
let pairs = entries { in: config }

let labels = for { in: pairs, as: "p" } {
  let label = str.concat { parts: [p.key, "=", p.value] }
  return { label: label }
}

let summary = join { in: labels, sep: ", " }
# -> "host=localhost, port=8080, debug=true"

return { summary: summary }
```

Throws `E_FN` if `in` is not a record.

## See Also

- [Data Functions](./data-functions.md) -- get, put, patch for deep record access
- [List Operations](./list-operations.md) -- len works on records (counts keys)
