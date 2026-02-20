# A0 Idiomatic Patterns

Common program patterns with complete working examples.

## Pattern 1: Pure Data Transformation

No capabilities needed. Construct and transform records/lists.

```
# transform-data.a0
let input = { users: [{ name: "Alice", role: "admin" }, { name: "Bob", role: "user" }] }
let first = get { in: input, path: "users[0].name" }
let updated = put { in: input, path: "meta.count", value: 2 }

return { first_user: first, data: updated }
```

## Pattern 2: HTTP Fetch → Parse → Write

Fetch remote JSON, extract fields, write results.

```
# fetch-and-save.a0
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
let output = { fetched_title: title, status: response.status }
do fs.write { path: "output.json", data: output, format: "json" } -> artifact

return { artifact: artifact, output: output }
```

## Pattern 3: Read File → Transform → Write File

Read a config, modify it, write it back.

```
# update-config.a0
cap { fs.read: true, fs.write: true }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw }
let updated = put { in: config, path: "version", value: 2 }
let updated2 = put { in: updated, path: "updated", value: true }
do fs.write { path: "config.json", data: updated2, format: "json" } -> artifact

return { artifact: artifact }
```

## Pattern 4: Shell Command Execution

Run a shell command and capture output.

```
# run-command.a0
cap { sh.exec: true }

do sh.exec { cmd: "git log --oneline -5", timeoutMs: 10000 } -> result
assert { that: true, msg: "git log succeeded" }

return { log: result.stdout, exitCode: result.exitCode }
```

## Pattern 5: Multi-Step Pipeline

Chain multiple operations. Each step binds a new variable.

```
# pipeline.a0
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/users" } -> resp
let users = parse.json { in: resp.body }
let first = get { in: users, path: "[0]" }
let name = get { in: first, path: "name" }
let report = { user: name, fetched: true }
do fs.write { path: "report.json", data: report, format: "json" } -> artifact
check { that: true, msg: "report written" }

return { report: report, artifact: artifact }
```

## Pattern 6: Data Validation with Evidence

Validate data using `assert` (fatal — halts on failure) and `check` (non-fatal — records evidence, continues).

```
# validate.a0
cap { fs.read: true }

call? fs.read { path: "data.json" } -> raw
let data = parse.json { in: raw }
let has_items = contains { in: data, value: "items" }

# Fatal: program cannot continue without items
assert { that: has_items, msg: "data has items field" }

# Non-fatal: record evidence but let program finish
check { that: true, msg: "data structure valid" }

return { valid: true, data: data }
```

## Pattern 7: JSON Patch Operations

Apply structured modifications to records.

```
# patch-record.a0
let doc = { name: "Alice", age: 30, tags: ["dev"] }

let patched = patch {
  in: doc,
  ops: [
    { op: "replace", path: "/name", value: "Bob" },
    { op: "add", path: "/email", value: "bob@example.com" },
    { op: "replace", path: "/age", value: 31 }
  ]
}

return { original: doc, patched: patched }
```

## Pattern 8: HTTP with Custom Headers

Pass custom headers to an HTTP request.

```
# api-call.a0
cap { http.get: true }

call? http.get {
  url: "https://api.example.com/data",
  headers: { Authorization: "Bearer token123", Accept: "application/json" }
} -> resp
let data = parse.json { in: resp.body }

return { status: resp.status, data: data }
```

## Pattern 9: Predicate-Based Validation

Use predicate functions with `assert` (fatal) and `check` (non-fatal) for meaningful runtime checks.

```
# validate-data.a0
cap { fs.read: true }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw }

# Fatal — can't continue without a name field
let has_name = contains { in: config, value: "name" }
assert { that: has_name, msg: "config must have name field" }

# Non-fatal — record evidence that name is non-empty, but continue either way
let name = get { in: config, path: "name" }
let not_empty = not { in: eq { a: name, b: "" } }
check { that: not_empty, msg: "name should not be empty" }

return { valid: true, name: name }
```

## Pattern 10: Budget-Constrained Execution

Limit resource usage with budget declarations.

```
# bounded-fetch.a0
cap { http.get: true, fs.write: true }
budget { timeMs: 10000, maxToolCalls: 3, maxBytesWritten: 65536 }

call? http.get { url: "https://api.example.com/data" } -> resp
let body = parse.json { in: resp.body }
let ok = eq { a: resp.status, b: 200 }
assert { that: ok, msg: "HTTP request succeeded" }

do fs.write { path: "result.json", data: body, format: "json" } -> artifact

return { artifact: artifact }
```

## Pattern 11: Arithmetic and Computed Values

Use arithmetic operators for inline computation. Parentheses control precedence.

```
# compute-stats.a0
let items = [10, 20, 30, 40, 50]
let count = len { in: items }
let total = 10 + 20 + 30 + 40 + 50
let average = total / count
let adjusted = (average - 5) * 2
let is_large = average > 25

return { count: count, total: total, average: average, adjusted: adjusted, is_large: is_large }
```

## Pattern 12: List Processing with range + for

Use `range` to generate index lists, then `for` to process them. Use `sort`, `filter`, and `len` for data manipulation.

```
# process-list.a0
let users = [
  { name: "Alice", active: true, score: 85 },
  { name: "Bob", active: false, score: 92 },
  { name: "Carol", active: true, score: 78 }
]

let active = filter { in: users, by: "active" }
let sorted = sort { in: active, by: "score" }
let count = len { in: sorted }
let found = find { in: users, key: "name", value: "Bob" }

let indices = range { from: 0, to: count }
let names = for { in: sorted, as: "user" } {
  return { name: user.name, score: user.score }
}

return { active_count: count, sorted: names, bob: found }
```

## Pattern 13: String Building and Manipulation

Use `str.concat` for multi-part strings, `str.split` and `join` for transformations.

```
# string-ops.a0
let parts = ["Hello", " ", "World", "!"]
let greeting = str.concat { parts: parts }

let csv = "alice,bob,carol"
let names = str.split { in: csv, sep: "," }
let count = len { in: names }
let rejoined = join { in: names, sep: " | " }

let url = "http://example.com/old-path"
let fixed = str.replace { in: url, from: "old-path", to: "new-path" }
let is_http = str.starts { in: url, value: "http" }

return { greeting: greeting, names: names, count: count, rejoined: rejoined, fixed: fixed, is_http: is_http }
```

## Pattern 14: Record Introspection and Merging

Use `keys`, `values`, and `merge` to work with records dynamically.

```
# record-ops.a0
let defaults = { color: "blue", size: 10, verbose: false }
let overrides = { size: 20, debug: true }
let config = merge { a: defaults, b: overrides }

let k = keys { in: config }
let v = values { in: config }
let field_count = len { in: config }

return { config: config, keys: k, values: v, field_count: field_count }
```

## Pattern 15: Data Pipeline with Arithmetic

Combine list operations and arithmetic for data processing without shelling out.

```
# pipeline-arithmetic.a0
cap { fs.read: true, fs.write: true }

call? fs.read { path: "scores.json" } -> raw
let scores = parse.json { in: raw }
let count = len { in: scores }
let passing = filter { in: scores, by: "passed" }
let pass_count = len { in: passing }
let sorted = sort { in: passing, by: "score" }

let summary = {
  total: count,
  passing: pass_count,
  fail_count: count - pass_count,
  pass_rate_pct: (pass_count * 100) / count
}

do fs.write { path: "summary.json", data: summary, format: "json" } -> artifact

return { summary: summary, artifact: artifact }
```

## Pattern 16: Higher-Order Map

Use `map` to apply a user-defined function to every element of a list, replacing explicit `for` loops for simple element-wise transforms.

```
# map-transform.a0
fn double { x } {
  return { val: x * 2 }
}

let nums = [1, 2, 3, 4, 5]
let doubled = map { in: nums, fn: "double" }

# Multi-param: destructure record fields into fn params
fn formatEntry { name, score } {
  let label = str.concat { parts: [name, ": ", score] }
  return { label: label }
}

let entries = [
  { name: "Alice", score: 95 },
  { name: "Bob", score: 87 }
]
let labels = map { in: entries, fn: "formatEntry" }

return { doubled: doubled, labels: labels }
```

**When to use `map` vs `for`**:
- Use `map` when each element transforms independently via a reusable function
- Use `for` when the body needs `let` bindings, tool calls, or multi-step logic

## Pattern 17: Dynamic Directory Discovery

Use `fs.list` to dynamically discover files and directories instead of hardcoding paths.

```
# list-packages.a0
cap { fs.read: true }

call? fs.list { path: "packages" } -> entries
let tagged = for { in: entries, as: "entry" } {
  let isDir = eq { a: entry.type, b: "directory" }
  return { name: entry.name, isDir: isDir }
}
let dirs = filter { in: tagged, by: "isDir" }
return { packages: dirs }
```

## Pattern 18: Reduce for Aggregation

Use `reduce` to compute aggregate values from lists.

```
# sum-scores.a0
fn addScore { acc, item } {
  let newTotal = acc.val + item.score
  return { val: newTotal }
}
let items = [{ name: "A", score: 10 }, { name: "B", score: 20 }, { name: "C", score: 30 }]
let result = reduce { in: items, fn: "addScore", init: { val: 0 } }
let maxScore = math.max { in: [10, 20, 30] }
let minScore = math.min { in: [10, 20, 30] }
return { total: result.val, max: maxScore, min: minScore }
```

## Anti-Patterns to Avoid

### Missing return
```
# WRONG — no return statement
let x = 42
```

### Return not last
```
# WRONG — return must be last
return { x: 1 }
let y = 2
```

### Wrong tool keyword
```
# WRONG — fs.read is read-mode, needs call?
do fs.read { path: "file.txt" } -> content
```

### Positional arguments
```
# WRONG — must use record syntax
call? fs.read "file.txt" -> content
```

### Duplicate binding
```
# WRONG — name already bound
let x = 1
let x = 2
```

### Unbound variable
```
# WRONG — y not declared
return { result: y }
```
