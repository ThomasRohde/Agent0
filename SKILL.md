# A0 Language Skill

A0 is a structured, line-oriented scripting language for automation. Programs are sequences of statements that produce a JSON result. Every program must end with `return { ... }`.

## Syntax

```
# Comments start with #
let name = expr          # bind a value
expr -> name             # bind result of expression statement
return { key: val }      # required, must be last statement
```

## Types

`int` `float` `bool` `str` `null` — literals: `42` `3.14` `true` `false` `null` `"hello"`

`rec` (record): `{ key: value, nested: { a: 1 } }`

`list`: `[1, 2, "three"]`

Strings are double-quoted with JSON escapes. Record keys may be dotted: `{ fs.read: true }`.

## Capabilities

Declare required capabilities at the top. Execution fails before any side-effect if the host policy denies them.

```
cap { fs.read: true, http.get: true }
```

Valid capabilities: `fs.read` `fs.write` `http.read` `http.get` `sh.exec`

## Tools

Read-only tools use `call?`. Effectful tools use `do`.

```
call? http.get { url: "https://api.example.com/data" } -> resp
do fs.write { path: "out.json", data: resp.body, format: "json" } -> artifact
do sh.exec { cmd: "echo hello", timeoutMs: 5000 } -> result
let content = call? fs.read { path: "file.txt" }
```

### Tool signatures

| Tool | Mode | Args | Returns |
|---|---|---|---|
| `fs.read` | read | `{ path, encoding? }` | `str` |
| `fs.write` | effect | `{ path, data, format? }` | `{ kind, path, bytes, sha256 }` |
| `http.get` | read | `{ url, headers? }` | `{ status, headers, body }` |
| `sh.exec` | effect | `{ cmd, cwd?, env?, timeoutMs? }` | `{ exitCode, stdout, stderr, durationMs }` |

## Stdlib

Call like functions: `name { args }`.

```
let parsed = parse.json { in: raw_string }
let val = get { in: record, path: "nested.key[0]" }
let updated = put { in: record, path: "a.b", value: 42 }
let patched = patch { in: doc, ops: [{ op: "replace", path: "/name", value: "new" }] }
```

## Evidence

`assert` and `check` take `{ that: bool, msg: str }`. Failed assert/check stops execution (exit 5).

```
assert { that: true, msg: "value exists" }
check { that: true, msg: "status ok" }
```

## Property access

Use dot notation on bound variables: `response.body`, `result.exitCode`.

## Rules

1. `return { ... }` is **required** and must be the **last** statement.
2. Variables must be bound with `let` or `->` before use.
3. No duplicate `let` bindings.
4. `call?` only works with read-mode tools; `do` for effect-mode tools.
5. Tool and function args are always records `{ ... }`, never positional.
6. Keywords (`cap`, `let`, `return`, `do`, `assert`, `check`, `true`, `false`, `null`, `import`, `as`, `budget`) cannot be used as variable names.

## Complete example

```
# fetch-transform.a0
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
do fs.write { path: "out.json", data: { title: title }, format: "json" } -> artifact
assert { that: true, msg: "wrote output" }

return { artifact: artifact, title: title }
```

## CLI

```
a0 check file.a0            # validate syntax+semantics
a0 run file.a0               # execute (deny-by-default)
a0 run file.a0 --unsafe-allow-all   # allow all caps (dev only)
a0 run file.a0 --trace t.jsonl      # emit JSONL trace
a0 fmt file.a0               # canonical format to stdout
a0 fmt file.a0 --write       # format in place
```

Exit codes: `0` ok, `2` parse error, `3` capability denied, `4` runtime error, `5` assertion failed.
