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

**Note**: All tool inputs are validated at runtime against Zod schemas. Invalid arguments produce `E_TOOL_ARGS` (exit 4) with field-level error details.

## Stdlib Functions

These are pure functions (no capability needed). Call with `name { args }`.

Valid stdlib functions: `parse.json`, `get`, `put`, `patch`, `eq`, `contains`, `not`, `and`, `or`, `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `str.concat`, `str.split`, `str.starts`, `str.replace`, `keys`, `values`, `merge`.

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
- **Error**: `E_FN` if `path` is not a string

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

### len

Return the length of a list, string, or record (key count).

- **Args**: `{ in: list|str|rec }`
- **Returns**: `int` — the length
- **Error**: `E_FN` if `in` is not a list, string, or record

```
let n = len { in: [1, 2, 3] }
# n is 3
let s = len { in: "hello" }
# s is 5
let k = len { in: { a: 1, b: 2 } }
# k is 2
```

### append

Append an element to a list, returning a new list.

- **Args**: `{ in: list, value: any }`
- **Returns**: `list` — the list with the value appended
- **Error**: `E_FN` if `in` is not a list

```
let items = append { in: [1, 2], value: 3 }
# items is [1, 2, 3]
```

### concat

Concatenate two lists into a new list.

- **Args**: `{ a: list, b: list }`
- **Returns**: `list` — the concatenated list
- **Error**: `E_FN` if `a` or `b` is not a list

```
let all = concat { a: [1, 2], b: [3, 4] }
# all is [1, 2, 3, 4]
```

### sort

Sort a list in natural order, or by a key within record elements.

- **Args**: `{ in: list, by?: str }`
  - `by` — Optional key name to sort records by
- **Returns**: `list` — the sorted list
- **Error**: `E_FN` if `in` is not a list

```
let ordered = sort { in: [3, 1, 2] }
# ordered is [1, 2, 3]
let byName = sort { in: [{ name: "Bob" }, { name: "Alice" }], by: "name" }
# byName is [{ name: "Alice" }, { name: "Bob" }]
```

### filter

Keep elements of a list where the given key is truthy.

- **Args**: `{ in: list, by: str }`
  - `by` — Key name to check for truthiness on each element
- **Returns**: `list` — elements where `element[by]` is truthy
- **Error**: `E_FN` if `in` is not a list

```
let active = filter { in: [{ name: "A", ok: true }, { name: "B", ok: false }], by: "ok" }
# active is [{ name: "A", ok: true }]
```

### find

Find the first element in a list where a key matches a value.

- **Args**: `{ in: list, key: str, value: any }`
- **Returns**: The matching element, or `null` if not found
- **Error**: `E_FN` if `in` is not a list

```
let user = find { in: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }], key: "id", value: 2 }
# user is { id: 2, name: "Bob" }
```

### range

Generate a list of integers from `from` (inclusive) to `to` (exclusive).

- **Args**: `{ from: int, to: int }`
- **Returns**: `list` — list of integers
- **Error**: `E_FN` if `from` or `to` is not an integer

```
let nums = range { from: 0, to: 5 }
# nums is [0, 1, 2, 3, 4]
```

### join

Join a list of strings with a separator.

- **Args**: `{ in: list, sep?: str }`
  - `sep` — Separator string (optional, defaults to `""`)
- **Returns**: `str` — the joined string
- **Error**: `E_FN` if `in` is not a list

```
let csv = join { in: ["a", "b", "c"], sep: "," }
# csv is "a,b,c"
```

### str.concat

Concatenate a list of values into a single string.

- **Args**: `{ parts: list }`
- **Returns**: `str` — all parts coerced to strings and concatenated
- **Error**: `E_FN` if `parts` is not a list

```
let msg = str.concat { parts: ["Hello", " ", "World"] }
# msg is "Hello World"
```

### str.split

Split a string by a separator.

- **Args**: `{ in: str, sep: str }`
- **Returns**: `list` — list of substrings
- **Error**: `E_FN` if `in` or `sep` is not a string

```
let parts = str.split { in: "a,b,c", sep: "," }
# parts is ["a", "b", "c"]
```

### str.starts

Check if a string starts with a prefix.

- **Args**: `{ in: str, value: str }`
- **Returns**: `bool` — `true` if `in` starts with `value`
- **Error**: `E_FN` if `in` or `value` is not a string

```
let yes = str.starts { in: "hello world", value: "hello" }
# yes is true
```

### str.replace

Replace all occurrences of a substring.

- **Args**: `{ in: str, from: str, to: str }`
- **Returns**: `str` — the string with replacements applied
- **Error**: `E_FN` if arguments are not strings

```
let fixed = str.replace { in: "foo-bar-baz", from: "-", to: "_" }
# fixed is "foo_bar_baz"
```

### keys

Get the list of keys from a record.

- **Args**: `{ in: rec }`
- **Returns**: `list` — list of key strings
- **Error**: `E_FN` if `in` is not a record

```
let k = keys { in: { name: "Alice", age: 30 } }
# k is ["name", "age"]
```

### values

Get the list of values from a record.

- **Args**: `{ in: rec }`
- **Returns**: `list` — list of values
- **Error**: `E_FN` if `in` is not a record

```
let v = values { in: { name: "Alice", age: 30 } }
# v is ["Alice", 30]
```

### merge

Shallow merge two records. Keys in `b` override keys in `a`.

- **Args**: `{ a: rec, b: rec }`
- **Returns**: `rec` — merged record
- **Error**: `E_FN` if `a` or `b` is not a record

```
let combined = merge { a: { x: 1, y: 2 }, b: { y: 3, z: 4 } }
# combined is { x: 1, y: 3, z: 4 }
```
