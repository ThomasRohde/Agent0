---
sidebar_position: 4
---

# File Transform

This example reads `package.json`, extracts fields, builds a structured report, and writes it to disk. It demonstrates file reading, JSON parsing, nested path access, `put` for adding fields, and `patch` for JSON Patch operations.

## Source: package-report.a0

```a0
# package-report.a0 - Build a small project report from package.json
cap { fs.read: true, fs.write: true }

call? fs.read { path: "package.json" } -> raw
let pkg = parse.json { in: raw }

let name = get { in: pkg, path: "name" }
let version = get { in: pkg, path: "version" }
let description = get { in: pkg, path: "description" }
let workspaces = get { in: pkg, path: "workspaces" }
let build_cmd = get { in: pkg, path: "scripts.build" }
let test_cmd = get { in: pkg, path: "scripts.test" }

let report0 = {
  project: name,
  version: version,
  description: description,
  workspaces: workspaces,
  scripts: { build: build_cmd, test: test_cmd }
}

let report1 = put { in: report0, path: "meta.generatedBy", value: "examples/package-report.a0" }
let report = patch {
  in: report1,
  ops: [
    { op: "add", path: "/meta/sourceFile", value: "package.json" },
    { op: "add", path: "/meta/purpose", value: "Emit a structured report for automation" }
  ]
}

do fs.write { path: "examples/package-report.json", data: report, format: "json" } -> artifact
assert { that: true, msg: "project report generated" }

return { artifact: artifact, report: report }
```

## Line-by-line walkthrough

### Lines 2-5: Reading and parsing a file

```a0
cap { fs.read: true, fs.write: true }

call? fs.read { path: "package.json" } -> raw
let pkg = parse.json { in: raw }
```

`fs.read` is a read-mode tool (used with `call?`) that returns the file contents as a string. `parse.json` then converts that string into a structured A0 value.

### Lines 7-12: Extracting fields with `get`

```a0
let name = get { in: pkg, path: "name" }
let build_cmd = get { in: pkg, path: "scripts.build" }
```

`get` navigates into nested structures using dot-separated paths. `"scripts.build"` reaches into the `scripts` object and extracts the `build` field.

### Lines 14-20: Building a record

```a0
let report0 = {
  project: name,
  version: version,
  description: description,
  workspaces: workspaces,
  scripts: { build: build_cmd, test: test_cmd }
}
```

Records can be nested. Here the `scripts` field contains another record with `build` and `test` fields.

### Line 22: Adding a field with `put`

```a0
let report1 = put { in: report0, path: "meta.generatedBy", value: "examples/package-report.a0" }
```

`put` adds or updates a value at a dot-separated path. If intermediate objects do not exist, they are created. Here it creates a `meta` object and sets `generatedBy` inside it. `put` returns a new record -- the original is not modified.

### Lines 23-29: JSON Patch with `patch`

```a0
let report = patch {
  in: report1,
  ops: [
    { op: "add", path: "/meta/sourceFile", value: "package.json" },
    { op: "add", path: "/meta/purpose", value: "Emit a structured report for automation" }
  ]
}
```

`patch` applies [RFC 6902 JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) operations. Each operation in the `ops` list has an `op` (e.g., `"add"`, `"remove"`, `"replace"`), a `path` (JSON Pointer), and a `value`. Note that JSON Patch paths use `/` separators, not dots.

### Lines 31-32: Writing and asserting

```a0
do fs.write { path: "examples/package-report.json", data: report, format: "json" } -> artifact
assert { that: true, msg: "project report generated" }
```

`fs.write` is an effect-mode tool (used with `do`). The `assert` statement records evidence that the report was generated. Since `assert` is fatal, if the condition were false, execution would halt immediately.

### Line 34: Return

```a0
return { artifact: artifact, report: report }
```

Returns both the file artifact and the structured report.

## Running it

```bash
a0 run --unsafe-allow-all examples/package-report.a0
```

## Key takeaways

- `fs.read` is read-mode (`call?`), `fs.write` is effect-mode (`do`)
- `get` uses dot paths (`"scripts.build"`) to navigate nested data
- `put` adds or updates fields at a dot path, creating intermediate objects as needed
- `patch` applies JSON Patch operations using JSON Pointer paths (`/meta/sourceFile`)
- All data transformations produce new values -- originals are never mutated
