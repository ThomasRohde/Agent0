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

## Pattern 17: Dynamic Workspace Processing

Use `fs.list` to dynamically discover directories, then read, transform, and aggregate data from each one. This is the preferred approach for monorepo/workspace tasks — never hardcode package paths.

The full pipeline: `fs.list` → filter directories → `for` with `call?`/`parse.json` → `coalesce` for config inheritance → `keys`/`filter`/`pluck` for dependency detection → `spread` for record extension → multi-key `sort` → `fs.write`.

```
# workspace-report.a0
cap { fs.read: true, fs.write: true }
budget { maxIterations: 200, maxToolCalls: 50 }

# 1. Discover workspace directories dynamically
call? fs.list { path: "packages" } -> entries
let tagged = for { in: entries, as: "entry" } {
  let isDir = eq { a: entry.type, b: "directory" }
  return { name: entry.name, isDir: isDir }
}
let dirs = filter { in: tagged, by: "isDir" }

# 2. Read each package's manifest and extract metadata
let pkgs = for { in: dirs, as: "d" } {
  let path = "packages/" + d.name + "/package.json"
  call? fs.read { path: path } -> raw
  let pkg = parse.json { in: raw }

  # coalesce: inherit defaults for optional fields
  let desc = get { in: pkg, path: "description" }
  let safeDesc = coalesce { in: desc, default: "(no description)" }

  # Detect dependency count from the dependencies record
  let deps = get { in: pkg, path: "dependencies" }
  let safeDeps = coalesce { in: deps, default: {} }
  let depKeys = keys { in: safeDeps }
  let depCount = len { in: depKeys }

  # spread: extend the record without repeating every field
  return { ...pkg, dir: d.name, description: safeDesc, depCount: depCount }
}

# 3. Compute aggregate stats
let depCounts = pluck { in: pkgs, key: "depCount" }
let maxDeps = math.max { in: depCounts }

# 4. Multi-key sort: by depCount descending (negate), then name ascending
fn addSortKey { item } {
  return { ...item, negDeps: 0 - item.depCount }
}
let withKey = map { in: pkgs, fn: "addSortKey" }
let sorted = sort { in: withKey, by: ["negDeps", "name"] }

# 5. Write the report
let report = { packageCount: len { in: sorted }, maxDeps: maxDeps, packages: sorted }
do fs.write { path: "workspace-report.json", data: report, format: "json" } -> artifact

return { artifact: artifact, report: report }
```

**Key techniques demonstrated:**
- **`fs.list`** instead of hardcoded paths — adapts to any workspace structure
- **`coalesce`** for null-safe defaults — one line vs. five-line `if`/`else`
- **`keys` + `len`** to count record entries algorithmically
- **`{ ...pkg, extra: val }`** spread to extend records inside loops
- **`pluck` + `math.max`** to compute aggregates without manual loops
- **Multi-key `sort`** with `by: [...]` for compound ordering

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

## Pattern 19: Null-Defaulting with coalesce

Use `coalesce` for safe null-defaulting. Unlike truthiness checks, `coalesce` is strictly null-checking -- `false`, `0`, and `""` are preserved.

```
# safe-defaults.a0
cap { fs.read: true }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw }
let port = get { in: config, path: "port" }
let host = get { in: config, path: "host" }
let debug = get { in: config, path: "debug" }

# coalesce keeps 0 and false — only replaces null
let safe_port = coalesce { in: port, default: 8080 }
let safe_host = coalesce { in: host, default: "localhost" }
let safe_debug = coalesce { in: debug, default: false }

return { port: safe_port, host: safe_host, debug: safe_debug }
```

## Pattern 20: Path Building with str.template

Use `str.template` to construct paths and URLs with named placeholders instead of multiple `str.concat` calls.

```
# build-paths.a0
cap { fs.read: true }

let dirs = ["core", "std", "cli"]
let paths = for { in: dirs, as: "dir" } {
  let pkg = str.template { in: "packages/{name}/package.json", vars: { name: dir } }
  let src = str.template { in: "packages/{name}/src/index.ts", vars: { name: dir } }
  return { pkg: pkg, src: src }
}

let api_url = str.template {
  in: "https://registry.npmjs.org/{scope}/{pkg}",
  vars: { scope: "@a0", pkg: "core" }
}

return { paths: paths, api_url: api_url }
```

## Pattern 21: Record Iteration with entries

Use `entries` to convert a record into a list of `{ key, value }` pairs for iteration and transformation.

```
# iterate-record.a0
let config = { host: "localhost", port: 8080, debug: true }
let pairs = entries { in: config }

# Transform into "key=value" strings
let env_lines = for { in: pairs, as: "pair" } {
  let line = str.template { in: "{k}={v}", vars: { k: pair.key, v: pair.value } }
  return { line: line }
}
let env_vals = pluck { in: env_lines, key: "line" }
let env_file = join { in: env_vals, sep: "\n" }

return { pairs: pairs, env_file: env_file }
```

## Pattern 22: Inline Filter Block

Use `filter` with a block body to filter a list inline. The block body runs for each element; items where the body returns a truthy value are kept.

```
# inline-filter.a0
budget { maxIterations: 100 }

let users = [
  { name: "Alice", age: 30, email: "alice@example.com" },
  { name: "Bob", age: 15, email: null },
  { name: "Carol", age: 25, email: "carol@example.com" }
]

let adults = filter { in: users, as: "u" } {
  return u.age >= 18
}

let with_email = filter { in: users, as: "u" } {
  let t = typeof { in: u.email }
  return eq { a: t, b: "string" }
}

return { adults: adults, with_email: with_email }
```

**Three forms of filter:**
- `filter { in: list, by: "key" }` — keep items where field `key` is truthy
- `filter { in: list, fn: "pred" }` — keep items where predicate fn returns truthy
- `filter { in: list, as: "x" } { body }` — inline block; body returns truthy/falsy value

The inline block form is preferred for most filtering tasks. Use `by:` for simple field-truthiness checks and `fn:` when you need a reusable predicate.

## Pattern 23: Predicate Filtering with filter + fn (Legacy)

Use `filter` with `fn:` to apply a user-defined predicate function. The original items are kept (not the fn return value). Counts against `maxIterations`.

Since filter checks the truthiness of the return value, and records are always truthy, predicate functions with `fn:` should return `{ ok: expr }` (filter checks the first value). With the inline block form, you can simply `return expr` directly.

```
# predicate-filter.a0
budget { maxIterations: 100 }

fn isAdult { item } {
  return { ok: item.age >= 18 }
}

fn hasEmail { item } {
  let t = typeof { in: item.email }
  let is_str = eq { a: t, b: "string" }
  return { ok: is_str }
}

let users = [
  { name: "Alice", age: 30, email: "alice@example.com" },
  { name: "Bob", age: 15, email: null },
  { name: "Carol", age: 25, email: "carol@example.com" }
]

let adults = filter { in: users, fn: "isAdult" }
let with_email = filter { in: users, fn: "hasEmail" }
let contactable = filter { in: adults, fn: "hasEmail" }

return { adults: adults, with_email: with_email, contactable: contactable }
```

**When to use `filter` by: vs fn: vs inline block:**
- Use `by:` when filtering by a single boolean/truthy field already on the record
- Use `fn:` when the filter condition requires a reusable predicate function
- Use inline block `filter { in: list, as: "x" } { ... }` for most filtering (preferred)
- With `fn:`, predicate functions must return `{ ok: expr }` — filter checks the first value
- With inline blocks, just `return expr` — bare values are checked directly

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

## Pattern 24: Loop / Iterative Convergence

Use `loop` for iterative computation where each iteration transforms a value. The body runs `times` iterations, threading the result through each one.

```
# counter.a0
let result = loop { in: 0, times: 5, as: "x" } {
  return x + 1
}
return result
# result == 5
```

```
# accumulator.a0
let items = [10, 20, 30]
let count = len { in: items }
let sum = loop { in: 0, times: count, as: "acc" } {
  let indices = range { from: 0, to: count }
  return acc + 1
}
return sum
```

```
# record-threading.a0
let result = loop { in: { total: 0, count: 0 }, times: 3, as: "state" } {
  return { total: state.total + 10, count: state.count + 1 }
}
return result
# result == { total: 30, count: 3 }
```

**When to use `loop` vs `for`:**
- Use `for` when iterating over a list of items
- Use `loop` when iterating a fixed number of times, threading state through each iteration
- `loop` is bounded by design (uses `times:` not `until:`) — consistent with A0's safety model
- Both count against `maxIterations` budget

## Pattern 26: Closure-Based Filtering

Use closures to capture outer variables in filter predicates, avoiding hardcoded values inside functions.

```
# closure-filter.a0
let allowed_roles = ["admin", "editor"]

fn isAllowed { item } {
  let role_match = contains { in: allowed_roles, value: item.role }
  return { ok: role_match }
}

let users = [
  { name: "Alice", role: "admin" },
  { name: "Bob", role: "viewer" },
  { name: "Carol", role: "editor" }
]

let permitted = filter { in: users, fn: "isAllowed" }

return { permitted: permitted }
```

The function `isAllowed` captures `allowed_roles` from the outer scope. This pattern is useful when the filter criteria come from configuration or earlier computation.

## Pattern 27: Dynamic File Discovery

See also Pattern 17 for a complete workspace processing pipeline.

Use `fs.list` to discover files, then `for` with tool calls to read and process each one.

```
# discover-and-read.a0
cap { fs.read: true }
budget { maxIterations: 50, maxToolCalls: 50 }

call? fs.list { path: "data" } -> entries
let json_files = filter { in: entries, by: "name" }

let results = for { in: entries, as: "entry" } {
  let is_file = eq { a: entry.type, b: "file" }
  let is_json = str.ends { in: entry.name, value: ".json" }
  let should_read = and { a: is_file, b: is_json }
  let path = "data/" + entry.name
  let content = if (should_read) {
    call? fs.read { path: path } -> raw
    let parsed = parse.json { in: raw }
    return { data: parsed, file: entry.name }
  } else {
    return { data: null, file: entry.name }
  }
  return { file: content.file, data: content.data }
}

return { files: results }
```

This pattern combines `fs.list`, `for` with tool calls inside the loop body, string `+` for path building, and block `if/else` for conditional processing.

## Pattern 28: Error Recovery with try/catch

Use `try/catch` to gracefully handle failures from tool calls or stdlib functions.

```
# safe-read.a0
cap { fs.read: true }

let result = try {
  call? fs.read { path: "config.json" } -> raw
  let config = parse.json { in: raw }
  return { ok: true, config: config }
} catch { e } {
  return { ok: false, error: e.code, detail: e.message }
}

let has_config = eq { a: result.ok, b: true }
let port = if (has_config) {
  let p = get { in: result.config, path: "port" }
  let safe = coalesce { in: p, default: 8080 }
  return { val: safe }
} else {
  return { val: 8080 }
}

return { port: port.val, config_loaded: result.ok }
```

The `try` body runs normally. If any statement throws (file not found, invalid JSON, etc.), the `catch` body runs with `e` bound to `{ code: "E_...", message: "..." }`. This avoids fatal errors and lets the program provide defaults or alternative behavior.

## Pattern 29: Record Composition with Spread

Use spread syntax to compose records from a base, applying overrides or extensions.

```
# record-spread.a0
let defaults = { host: "localhost", port: 8080, debug: false, retries: 3 }
let env_overrides = { port: 3000, debug: true }
let config = { ...defaults, ...env_overrides, app: "myservice" }

# Later keys override earlier ones:
# config == { host: "localhost", port: 3000, debug: true, retries: 3, app: "myservice" }

let items = [
  { name: "Alice", score: 85 },
  { name: "Bob", score: 92 }
]

let tagged = for { in: items, as: "item" } {
  let rank = if (item.score >= 90) {
    return { val: "A" }
  } else {
    return { val: "B" }
  }
  return { ...item, rank: rank.val }
}

return { config: config, tagged: tagged }
```

Spread is useful for merging defaults with overrides, extending records inside loops, and building composite records without manually listing every key.

## Pattern 30: String Building with + Operator

Use the `+` operator for simple string concatenation instead of `str.concat` when combining two values.

```
# string-plus.a0
let greeting = "Hello" + ", " + "World!"
let name = "Alice"
let msg = "Welcome, " + name + "!"

let files = ["main.ts", "utils.ts", "types.ts"]
let paths = for { in: files, as: "file" } {
  let full = "src/" + file
  return { path: full }
}

let labels = pluck { in: paths, key: "path" }
let result = join { in: labels, sep: "\n" }

return { greeting: greeting, msg: msg, paths: result }
```

**When to use `+` vs `str.concat`:**
- Use `+` for simple two-operand concatenation: `"prefix" + name`
- Use `str.concat` when combining many parts: `str.concat { parts: [a, b, c, d] }`
- Use `str.template` when building strings with named placeholders: `str.template { in: "Hello {name}", vars: { name: "Alice" } }`
