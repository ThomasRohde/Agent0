---
sidebar_position: 4
---

# fs.exists

Check whether a file or directory exists.

- **Mode:** read (`call?`)
- **Capability:** `fs.read`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `str` | Yes | Path to check |

## Returns

`bool` -- `true` if the path exists, `false` otherwise.

## Example

Check for a config file before reading it:

```a0
cap { fs.read: true }

call? fs.exists { path: "config.json" } -> exists
let status = if {
  cond: exists,
  then: "found",
  else: "missing"
}

return { configExists: exists, status: status }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments (e.g. no `path`).
- **`E_CAP_DENIED`** (exit 3) -- The active policy denied `fs.read`.
- **`E_UNDECLARED_CAP`** (exit 2) -- Program used `fs.exists` without declaring `cap { fs.read: true }`.

## See Also

- [fs.read](./fs-read.md) -- Read file contents
- [fs.list](./fs-list.md) -- List directory contents
