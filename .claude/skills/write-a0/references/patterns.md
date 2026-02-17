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

Validate data and assert expectations.

```
# validate.a0
cap { fs.read: true }

call? fs.read { path: "data.json" } -> raw
let data = parse.json { in: raw }
let count = get { in: data, path: "items" }

assert { that: true, msg: "data has items field" }
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

Use predicate functions with assert/check for meaningful runtime checks.

```
# validate-data.a0
cap { fs.read: true }

call? fs.read { path: "config.json" } -> raw
let config = parse.json { in: raw }

let has_name = contains { in: config, value: "name" }
assert { that: has_name, msg: "config must have name field" }

let name = get { in: config, path: "name" }
let not_empty = not { in: eq { a: name, b: "" } }
assert { that: not_empty, msg: "name must not be empty" }

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
