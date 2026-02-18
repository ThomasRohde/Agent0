---
sidebar_position: 2
---

# Data Functions

Functions for parsing, accessing, and transforming structured data.

## parse.json

Parse a JSON string into an A0 value.

**Signature:** `parse.json { in: str }` returns the parsed value.

```a0
let raw = "{\"name\": \"alice\", \"age\": 30}"
let data = parse.json { in: raw }

return { data: data }
# -> { name: "alice", age: 30 }
```

Throws `E_FN` if the input is not valid JSON.

## get

Retrieve a value at a dot/bracket path within a record or list.

**Signature:** `get { in: rec, path: str }` returns the value at the path, or `null` if not found.

Path syntax supports dot-separated keys and bracket notation for array indices:
- `"name"` -- top-level key
- `"user.name"` -- nested key
- `"items[0]"` -- array index
- `"users[0].name"` -- combined

```a0
let data = {
  user: { name: "alice", roles: ["admin", "editor"] }
}

let name = get { in: data, path: "user.name" }
# -> "alice"

let role = get { in: data, path: "user.roles[0]" }
# -> "admin"

let missing = get { in: data, path: "user.email" }
# -> null

return { name: name }
```

## put

Set a value at a path, returning a new record. Creates intermediate keys and arrays as needed.

**Signature:** `put { in: rec, path: str, value: any }` returns a new record with the value set.

```a0
let data = { user: { name: "alice" } }

let updated = put { in: data, path: "user.email", value: "alice@example.com" }
# -> { user: { name: "alice", email: "alice@example.com" } }

let withList = put { in: {}, path: "items[0]", value: "first" }
# -> { items: ["first"] }

return { updated: updated }
```

## patch

Apply a list of JSON Patch operations (RFC 6902) to a record, returning the patched result.

**Signature:** `patch { in: rec, ops: list }` returns the patched record.

Supported operations: `add`, `remove`, `replace`, `move`, `copy`, `test`.

Each operation is a record with:
- `op` -- Operation name (required)
- `path` -- JSON Pointer target path (required)
- `value` -- Value for add/replace/test
- `from` -- Source path for move/copy

Invalid pointers, missing required source paths, and out-of-bounds array indices are treated as errors (surface as `E_FN` at runtime).

```a0
let data = { name: "alice", age: 30 }

let patched = patch {
  in: data,
  ops: [
    { op: "replace", path: "/name", value: "bob" },
    { op: "add", path: "/email", value: "bob@example.com" },
    { op: "remove", path: "/age" }
  ]
}

return { patched: patched }
# -> { patched: { name: "bob", email: "bob@example.com" } }
```

Using `test` to assert a value before modifying:

```a0
let data = { version: 1, name: "draft" }

let result = patch {
  in: data,
  ops: [
    { op: "test", path: "/version", value: 1 },
    { op: "replace", path: "/version", value: 2 }
  ]
}

return { result: result }
# -> { result: { version: 2, name: "draft" } }
```

The `test` operation throws `E_FN` if the value at the path does not match.

Using `move` and `copy`:

```a0
let data = { first: "alice", last: "smith" }

let moved = patch {
  in: data,
  ops: [
    { op: "copy", path: "/fullName", from: "/first" },
    { op: "move", path: "/surname", from: "/last" }
  ]
}

return { moved: moved }
# -> { moved: { first: "alice", fullName: "alice", surname: "smith" } }
```

## See Also

- [Record Operations](./record-operations.md) -- keys, values, merge
- [Predicates](./predicates.md) -- eq, contains
