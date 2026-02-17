# A0 Tool Signatures — Full Reference

## fs.read

Read a file from disk.

- **Mode**: read (`call?`)
- **Capability**: `fs.read`
- **Args**: `{ path: str, encoding?: str }`
  - `path` — File path to read (required)
  - `encoding` — Character encoding (optional, default UTF-8)
- **Returns**: `str` — The file contents as a string

```
call? fs.read { path: "config.json" } -> content
let parsed = parse.json { in: content }
```

## fs.write

Write data to a file.

- **Mode**: effect (`do`)
- **Capability**: `fs.write`
- **Args**: `{ path: str, data: any, format?: str }`
  - `path` — Output file path (required)
  - `data` — Data to write (required). If a record/list, serialized per `format`.
  - `format` — `"json"` for JSON serialization (optional)
- **Returns**: `{ kind: str, path: str, bytes: int, sha256: str }`
  - `kind` — Always `"file"`
  - `path` — Absolute path of written file
  - `bytes` — Bytes written
  - `sha256` — SHA-256 hash of contents

```
do fs.write { path: "out.json", data: { key: "value" }, format: "json" } -> artifact
# artifact.path, artifact.bytes, artifact.sha256 available
```

## http.get

Fetch a URL via HTTP GET.

- **Mode**: read (`call?`)
- **Capability**: `http.get`
- **Args**: `{ url: str, headers?: rec }`
  - `url` — URL to fetch (required)
  - `headers` — Optional HTTP headers as record
- **Returns**: `{ status: int, headers: rec, body: str }`
  - `status` — HTTP status code
  - `headers` — Response headers as record
  - `body` — Response body as string (parse with `parse.json` if JSON)

```
call? http.get { url: "https://api.example.com/data" } -> resp
# resp.status, resp.headers, resp.body available
let data = parse.json { in: resp.body }
```

## sh.exec

Execute a shell command.

- **Mode**: effect (`do`)
- **Capability**: `sh.exec`
- **Args**: `{ cmd: str, cwd?: str, env?: rec, timeoutMs?: int }`
  - `cmd` — Shell command string (required)
  - `cwd` — Working directory (optional)
  - `env` — Environment variables as record (optional)
  - `timeoutMs` — Timeout in milliseconds (optional)
- **Returns**: `{ exitCode: int, stdout: str, stderr: str, durationMs: int }`
  - `exitCode` — Process exit code (0 = success)
  - `stdout` — Standard output
  - `stderr` — Standard error
  - `durationMs` — Execution time in milliseconds

```
do sh.exec { cmd: "ls -la", cwd: "/tmp", timeoutMs: 10000 } -> result
# result.exitCode, result.stdout, result.stderr, result.durationMs available
```

**Note**: All tool inputs are validated at runtime against Zod schemas. Invalid arguments produce `E_TOOL_ARGS` with field-level error details.

## Stdlib Functions

These are pure functions (no capability needed). Call with `name { args }`.

### parse.json

Parse a JSON string into a structured value.

- **Args**: `{ in: str }`
- **Returns**: The parsed value (record, list, string, number, bool, or null)
- **Error**: `E_FN` if the string is not valid JSON

```
let data = parse.json { in: "{\"key\": 42}" }
# data is { key: 42 }
```

### get

Read a value at a nested path using dot/bracket notation.

- **Args**: `{ in: rec, path: str }`
  - `path` — Dot-separated path with optional bracket indexing: `"a.b[0].c"`
- **Returns**: The value at the path, or `null` if not found
- **Error**: `E_PATH` for malformed paths

```
let val = get { in: { a: { b: [10, 20] } }, path: "a.b[1]" }
# val is 20
```

### put

Set a value at a nested path, returning a new record.

- **Args**: `{ in: rec, path: str, value: any }`
- **Returns**: A new record with the value set at the path

```
let updated = put { in: { a: 1 }, path: "b.c", value: 42 }
# updated is { a: 1, b: { c: 42 } }
```

### patch

Apply JSON Patch operations (RFC 6902) to a record.

- **Args**: `{ in: rec, ops: list }`
  - `ops` — List of patch operations. Each is `{ op: str, path: str, value?: any, from?: str }`
  - Supported ops: `"add"`, `"remove"`, `"replace"`, `"copy"`, `"move"`, `"test"`
- **Returns**: The patched record

```
let result = patch {
  in: { name: "Alice", age: 30 },
  ops: [
    { op: "replace", path: "/name", value: "Bob" },
    { op: "add", path: "/email", value: "bob@example.com" }
  ]
}
# result is { name: "Bob", age: 30, email: "bob@example.com" }
```

### eq

Deep equality comparison using JSON serialization.

- **Args**: `{ a: any, b: any }`
- **Returns**: `bool` — `true` if `a` and `b` are deeply equal

```
let same = eq { a: 1, b: 1 }
# same is true
let diff = eq { a: { x: 1 }, b: { x: 2 } }
# diff is false
```

### contains

Check for substring, element membership, or key existence.

- **Args**: `{ in: str|list|record, value: any }`
- **Returns**: `bool`
  - **string** `in`: `true` if `value` (coerced to string) is a substring
  - **list** `in`: `true` if any element deeply equals `value`
  - **record** `in`: `true` if `value` (coerced to string) is a key

```
let has = contains { in: "hello world", value: "world" }
# has is true
let found = contains { in: [1, 2, 3], value: 2 }
# found is true
let exists = contains { in: { name: "Alice" }, value: "name" }
# exists is true
```

### not

Boolean negation with A0 truthiness coercion.

- **Args**: `{ in: any }`
- **Returns**: `bool` — negation of the truthy value of `in`
- **Falsy values**: `false`, `null`, `0`, `""`

```
let neg = not { in: false }
# neg is true
let neg2 = not { in: "hello" }
# neg2 is false
```

### and

Logical AND with A0 truthiness coercion.

- **Args**: `{ a: any, b: any }`
- **Returns**: `bool` — `true` if both `a` and `b` are truthy

```
let both = and { a: true, b: 1 }
# both is true
let nope = and { a: true, b: 0 }
# nope is false
```

### or

Logical OR with A0 truthiness coercion.

- **Args**: `{ a: any, b: any }`
- **Returns**: `bool` — `true` if either `a` or `b` is truthy

```
let either = or { a: false, b: 1 }
# either is true
let neither = or { a: false, b: null }
# neither is false
```
