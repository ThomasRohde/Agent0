---
sidebar_position: 3
---

# fs.list

List the contents of a directory.

- **Mode:** read (`call?`)
- **Capability:** `fs.read`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `str` | Yes | Directory path to list |

## Returns

`list` of records, each with:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | File or directory name |
| `type` | `str` | `"file"`, `"directory"`, or `"other"` |

## Example

Discover package directories dynamically:

```a0
cap { fs.read: true }

call? fs.list { path: "packages" } -> entries

let tagged = for { in: entries, as: "entry" } {
  let isDir = eq { a: entry.type, b: "directory" }
  return { name: entry.name, isDir: isDir }
}
let dirs = filter { in: tagged, by: "isDir" }

return { directories: dirs }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments (e.g. no `path`).
- **`E_TOOL`** (exit 4) -- Directory does not exist or cannot be read.
- **`E_CAP_DENIED`** (exit 3) -- The active policy denied `fs.read`.
- **`E_UNDECLARED_CAP`** (exit 2) -- Program used `fs.list` without declaring `cap { fs.read: true }`.

## See Also

- [fs.read](./fs-read.md) -- Read file contents
- [fs.exists](./fs-exists.md) -- Check if a file or directory exists
