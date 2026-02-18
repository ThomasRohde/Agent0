---
sidebar_position: 3
---

# fs.write

Write data to a file. Creates parent directories automatically if they do not exist.

- **Mode:** effect (`do`)
- **Capability:** `fs.write`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `str` | Yes | Output file path |
| `data` | `any` | Yes | Data to write |
| `format` | `str` | No | Set to `"json"` for pretty-printed JSON serialization. Default: raw. |

When `format` is `"json"`, the data is serialized with `JSON.stringify` using 2-space indentation. When `format` is omitted (raw mode), strings are written as-is; non-string values are serialized as compact JSON.

## Returns

A record with write evidence:

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `str` | Always `"file"` |
| `path` | `str` | Resolved absolute path of the written file |
| `bytes` | `int` | Number of bytes written |
| `sha256` | `str` | SHA-256 hex digest of the written content |

## Budget

Each write counts toward the `maxBytesWritten` [budget](../capabilities/budgets.md). The cumulative byte count across all `fs.write` calls is tracked. Exceeding the limit produces `E_BUDGET` (exit 4).

## Example

Write a JSON report:

```a0
cap { fs.write: true }

let report = { status: "ok", items: [1, 2, 3] }
do fs.write { path: "report.json", data: report, format: "json" } -> evidence

return { evidence: evidence }
```

Write plain text:

```a0
cap { fs.write: true }

do fs.write { path: "output.txt", data: "Hello, world!" } -> result

return { result: result }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments.
- **`E_TOOL`** (exit 4) -- Cannot write to the path (permissions, disk full, etc.).
- **`E_BUDGET`** (exit 4) -- `maxBytesWritten` budget exceeded.
- **`E_CAP_DENIED`** (exit 3) -- The `fs.write` capability was not declared.
- **`E_CALL_EFFECT`** (exit 2) -- Used `call?` instead of `do`.

## See Also

- [fs.read](./fs-read.md) -- Read file contents
- [Budgets](../capabilities/budgets.md) -- Budget constraints
