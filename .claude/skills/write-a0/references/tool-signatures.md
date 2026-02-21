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

## fs.list

List the contents of a directory.

- **Mode**: read (`call?`)
- **Capability**: `fs.read`
- **Args**: `{ path: str }`
  - `path` — Directory path to list (required)
- **Returns**: `list` of `{ name: str, type: str }` — each entry has `name` (filename) and `type` (`"file"`, `"directory"`, or `"other"`)

```
call? fs.list { path: "packages" } -> entries
# entries is [{ name: "core", type: "directory" }, { name: "README.md", type: "file" }, ...]
```

## fs.exists

Check if a file or directory exists.

- **Mode**: read (`call?`)
- **Capability**: `fs.read`
- **Args**: `{ path: str }`
  - `path` — Path to check (required)
- **Returns**: `bool` — `true` if the path exists, `false` otherwise

```
call? fs.exists { path: "config.json" } -> exists
# exists is true or false
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

Valid stdlib functions: `parse.json`, `get`, `put`, `patch`, `coalesce`, `typeof`, `eq`, `contains`, `not`, `and`, `or`, `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `map`, `reduce`, `unique`, `pluck`, `flat`, `str.concat`, `str.split`, `str.starts`, `str.ends`, `str.replace`, `str.template`, `keys`, `values`, `merge`, `entries`, `math.max`, `math.min`.

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

### coalesce

Return the input value if it is not null, otherwise return the default. Uses strict null-checking (NOT truthiness — `false`, `0`, and `""` are kept).

- **Args**: `{ in: any, default: any }`
  - `in` — The value to check
  - `default` — The fallback value if `in` is `null`
- **Returns**: `in` if it is not `null`, otherwise `default`

```
let safe = coalesce { in: null, default: "fallback" }
# safe is "fallback"
let kept = coalesce { in: 0, default: 99 }
# kept is 0 (not null, so kept despite being falsy)
```

### typeof

Return the type name of a value as a string.

- **Args**: `{ in: any }`
- **Returns**: `str` — one of `"null"`, `"boolean"`, `"number"`, `"string"`, `"list"`, `"record"`

```
let t1 = typeof { in: 42 }
# t1 is "number"
let t2 = typeof { in: null }
# t2 is "null"
let t3 = typeof { in: [1, 2] }
# t3 is "list"
let t4 = typeof { in: { a: 1 } }
# t4 is "record"
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

Sort a list in natural order, by a key, or by multiple keys within record elements.

- **Args**: `{ in: list, by?: str | list }`
  - `by` — Optional key name (string) or list of key names for multi-key sort
- **Returns**: `list` — the sorted list
- **Error**: `E_FN` if `in` is not a list

```
let ordered = sort { in: [3, 1, 2] }
# ordered is [1, 2, 3]
let byName = sort { in: [{ name: "Bob" }, { name: "Alice" }], by: "name" }
# byName is [{ name: "Alice" }, { name: "Bob" }]
let multiKey = sort { in: items, by: ["group", "name"] }
# sorts by group first, then by name within each group
```

### filter

Keep elements of a list by key truthiness or a user-defined predicate function.

Three forms:

- **By key**: `{ in: list, by: str }` — keep elements where `element[by]` is truthy
- **By function**: `{ in: list, fn: str }` — keep elements where the named predicate function returns a truthy value. By convention, predicate functions should return `{ ok: expr }` — filter unwraps record returns and checks the first value. The original item is kept (not the fn return value).
- **Inline block** (v0.5): `filter { in: list, as: "x" } { body }` — the body runs per element; if the return value is truthy, the item is kept. Return can be any expression (bare value or record).

Filter checks truthiness of the return value. If the return is a record, the first value in the record is checked. If the return is a bare value (e.g., a boolean from a comparison), it is checked directly.

- **Args**: `{ in: list, by?: str, fn?: str }` (exactly one of `by` or `fn` required)
- **Returns**: `list` — filtered elements
- **Error**: `E_FN` if `in` is not a list or neither `by`/`fn` provided; `E_UNKNOWN_FN` if `fn` names an undefined function
- **Budget**: `fn:` and inline block forms count each invocation against `maxIterations`

```
# By key
let active = filter { in: [{ name: "A", ok: true }, { name: "B", ok: false }], by: "ok" }
# active is [{ name: "A", ok: true }]

# By predicate function — return { ok: expr } convention
fn isHigh { item } {
  return { ok: item.score > 80 }
}
let top = filter { in: scores, fn: "isHigh" }
# keeps original items where isHigh returned { ok: true }
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

### str.ends

Check if a string ends with a suffix.

- **Args**: `{ in: str, value: str }`
- **Returns**: `bool` — `true` if `in` ends with `value`
- **Error**: `E_FN` if `in` or `value` is not a string

```
let yes = str.ends { in: "hello world", value: "world" }
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

### str.template

Interpolate `{varName}` placeholders in a string with values from a vars record.

- **Args**: `{ in: str, vars: rec }`
  - `in` — Template string with `{placeholder}` markers
  - `vars` — Record mapping placeholder names to replacement values (coerced to strings)
- **Returns**: `str` — the resolved string
- **Error**: `E_FN` if `in` is not a string or `vars` is not a record

```
let path = str.template { in: "packages/{name}/package.json", vars: { name: "core" } }
# path is "packages/core/package.json"
let msg = str.template { in: "Hello {who}, you have {n} items", vars: { who: "Alice", n: 3 } }
# msg is "Hello Alice, you have 3 items"
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

### entries

Convert a record into a list of `{ key, value }` pairs.

- **Args**: `{ in: rec }`
- **Returns**: `list` — list of `{ key: str, value: any }` records
- **Error**: `E_FN` if `in` is not a record

```
let pairs = entries { in: { name: "Alice", age: 30 } }
# pairs is [{ key: "name", value: "Alice" }, { key: "age", value: 30 }]
```

### unique

Remove duplicates from a list using deep equality.

- **Args**: `{ in: list }`
- **Returns**: `list` — deduplicated list (preserves first occurrence order)
- **Error**: `E_FN` if `in` is not a list

```
let deduped = unique { in: [1, 2, 2, 3, 1] }
# deduped is [1, 2, 3]
```

### pluck

Extract a single field from each record in a list. Non-record elements yield `null`.

- **Args**: `{ in: list, key: str }`
  - `key` — The field name to extract from each element
- **Returns**: `list` — a list of extracted values (null for non-record elements)
- **Error**: `E_FN` if `in` is not a list or `key` is not a string

```
let names = pluck { in: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }], key: "name" }
# names is ["Alice", "Bob"]
let mixed = pluck { in: [{ x: 1 }, 42, { x: 3 }], key: "x" }
# mixed is [1, null, 3]
```

### flat

Flatten one level of nested lists. Non-list elements are kept as-is.

- **Args**: `{ in: list }`
- **Returns**: `list` — the flattened list (one level only)
- **Error**: `E_FN` if `in` is not a list

```
let result = flat { in: [[1, 2], [3, 4], [5]] }
# result is [1, 2, 3, 4, 5]
let mixed = flat { in: [[1, 2], 3, [4]] }
# mixed is [1, 2, 3, 4]
```

### math.max

Return the maximum value in a numeric list.

- **Args**: `{ in: list }`
- **Returns**: `number` — the maximum value
- **Error**: `E_FN` if `in` is empty, not a list, or contains non-numbers

```
let biggest = math.max { in: [3, 7, 1, 5] }
# biggest is 7
```

### math.min

Return the minimum value in a numeric list.

- **Args**: `{ in: list }`
- **Returns**: `number` — the minimum value
- **Error**: `E_FN` if `in` is empty, not a list, or contains non-numbers

```
let smallest = math.min { in: [3, 7, 1, 5] }
# smallest is 1
```

### reduce

Reduce a list to a single value by applying a 2-parameter function with an accumulator.

- **Args**: `{ in: list, fn: str, init: any }`
  - `fn` — Name of a user-defined function with exactly 2 parameters (accumulator, item)
  - `init` — Initial accumulator value
- **Returns**: The final accumulator value
- **Error**: `E_UNKNOWN_FN` if function not defined; `E_TYPE` if function doesn't have exactly 2 params

```
fn addScore { acc, item } {
  let newTotal = acc.val + item.score
  return { val: newTotal }
}
let result = reduce { in: items, fn: "addScore", init: { val: 0 } }
# result.val contains the sum
```
