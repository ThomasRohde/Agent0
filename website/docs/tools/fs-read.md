---
sidebar_position: 2
---

# fs.read

Read the contents of a file.

- **Mode:** read (`call?`)
- **Capability:** `fs.read`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `str` | Yes | File path to read |
| `encoding` | `str` | No | Character encoding. Default: `"utf8"`. Use any other value (e.g. `"base64"`) for binary files. |

## Returns

`str` -- The file contents as a string.

When `encoding` is `"utf8"` (the default), returns UTF-8 text. For other encodings, returns a base64-encoded string of the raw bytes.

## Example

Read a JSON configuration file and parse it:

```a0
cap { fs.read: true }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw }
let name = get { in: config, path: "app.name" }

return { name: name, config: config }
```

Read a file with an explicit encoding:

```a0
cap { fs.read: true }

call? fs.read { path: "notes.txt", encoding: "utf8" } -> content

return { content: content }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments (e.g. no `path`).
- **`E_TOOL`** (exit 4) -- File does not exist or cannot be read.
- **`E_CAP_DENIED`** (exit 3) -- The `fs.read` capability was not declared.

## See Also

- [fs.write](./fs-write.md) -- Write data to a file
- [parse.json](../stdlib/data-functions.md) -- Parse a JSON string
