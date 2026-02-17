---
name: write-a0
description: This skill should be used when the user asks to "write an A0 program", "create an A0 script", "generate A0 code", "write a .a0 file", "A0 syntax", "A0 example", "how to write A0", "A0 language", or needs to produce any new A0 source code. Provides the complete syntax, type system, tool signatures, stdlib, and idiomatic patterns needed to author correct A0 programs.
---

# Writing A0 Programs

A0 is a line-oriented scripting language for automation agents. Programs are sequences of statements producing a JSON result. Every program must end with `return { ... }`.

## Core Syntax

```
# Comments start with #
cap { fs.read: true }        # capability declaration (top of file)
let name = expr              # bind a value
expr -> name                 # bind result of expression statement
return { key: val }          # required, must be last statement
```

## Types

Primitives: `int` `float` `bool` `str` `null` — literals: `42` `3.14` `true` `false` `null` `"hello"`

Records: `{ key: value, nested: { a: 1 } }` — keys may be dotted: `{ fs.read: true }`

Lists: `[1, 2, "three"]`

Strings are double-quoted with JSON escapes (`\"`, `\\`, `\n`, `\t`).

## Capabilities

Declare required capabilities at the top of the file. Execution fails before any side-effect if the host policy denies them.

```
cap { fs.read: true, http.get: true }
```

Valid capabilities: `fs.read`, `fs.write`, `http.read` (reserved, no built-in tool yet), `http.get`, `sh.exec`

Only declare capabilities the program actually uses.

## Tools — Read vs Effect

Read-only tools use `call?`. Effectful tools use `do`. Using `call?` on an effect tool is a runtime error (`E_CALL_EFFECT`).

| Tool | Mode | Keyword | Capability |
|------|------|---------|------------|
| `fs.read` | read | `call?` | `fs.read` |
| `fs.write` | effect | `do` | `fs.write` |
| `http.get` | read | `call?` | `http.get` |
| `sh.exec` | effect | `do` | `sh.exec` |

Tool arguments are always records `{ ... }`, never positional. For full argument/return schemas, consult `references/tool-signatures.md`.

```
call? fs.read { path: "data.json" } -> content
do fs.write { path: "out.json", data: result, format: "json" } -> artifact
```

## Stdlib Functions

Pure functions called like `name { args }`. No capability needed.

| Function | Purpose | Key Args |
|----------|---------|----------|
| `parse.json` | Parse JSON string | `{ in: str }` |
| `get` | Read nested path | `{ in: record, path: "a.b[0]" }` |
| `put` | Set nested path | `{ in: record, path: "a.b", value: x }` |
| `patch` | JSON Patch (RFC 6902) | `{ in: record, ops: [...] }` |

```
let parsed = parse.json { in: raw_string }
let val = get { in: record, path: "nested.key[0]" }
```

## Evidence — assert & check

Both take `{ that: bool, msg: str }`. A failed assertion stops execution (exit 5).

A0 v0.1 lacks comparison operators, so `that:` currently takes a literal boolean. Use `assert { that: true, msg: "..." }` as an evidence marker to document that a step completed.

```
assert { that: true, msg: "file was written" }
check { that: true, msg: "status 200" }
```

## Property Access

Dot notation on bound variables: `response.body`, `result.exitCode`, `data.items`.

## Program Rules

1. `return { ... }` is **required** and must be the **last** statement.
2. Variables must be bound with `let` or `->` before use.
3. No duplicate `let` bindings in the same scope.
4. `call?` for read-mode tools only; `do` for effect-mode tools only.
5. Tool and function args are always records `{ ... }`.
6. Reserved words cannot be variable names: `cap`, `let`, `return`, `do`, `assert`, `check`, `true`, `false`, `null`, `import`, `as`, `budget`.

## Common Mistakes

Avoid these frequent errors:

- **Forgetting `return`** → `E_NO_RETURN`. Every program must end with `return { ... }`.
- **`return` not last** → `E_RETURN_NOT_LAST`. No statements after return.
- **Using `call?` for an effect tool** → `E_CALL_EFFECT`. Use `do` for `fs.write` and `sh.exec`.
- **Using `do` for a read tool** — allowed but unconventional. Prefer `call?` for `fs.read` and `http.get` to signal read-only intent.
- **Undeclared capability** → `E_CAP_DENIED`. Add the capability to `cap { ... }`.
- **Reusing a variable name** → `E_DUP_BINDING`. Each `let` name must be unique.
- **Using a variable before binding** → `E_UNBOUND`. Bind with `let` or `->` first.
- **Positional arguments** → Parse error. Always use record syntax `{ key: value }`.

## Idiomatic Patterns

For complete patterns (HTTP+transform, shell exec, validation, data pipelines), see `references/patterns.md`.

### Minimal program (pure data)

```
let data = { name: "example", version: 1 }
return { result: data }
```

### HTTP fetch + transform

```
cap { http.get: true, fs.write: true }
call? http.get { url: "https://api.example.com/data" } -> resp
let body = parse.json { in: resp.body }
let title = get { in: body, path: "title" }
do fs.write { path: "out.json", data: { title: title }, format: "json" } -> artifact
return { artifact: artifact }
```

### Shell command

```
cap { sh.exec: true }
do sh.exec { cmd: "echo hello", timeoutMs: 5000 } -> result
assert { that: true, msg: "command succeeded" }
return { stdout: result.stdout, exitCode: result.exitCode }
```

## CLI Quick Reference

```
a0 check file.a0                     # validate syntax + semantics
a0 run file.a0                       # execute (deny-by-default)
a0 run file.a0 --unsafe-allow-all    # allow all caps (dev only)
a0 run file.a0 --trace t.jsonl       # emit JSONL trace
a0 fmt file.a0                       # canonical format to stdout
a0 fmt file.a0 --write               # format in place
```

Exit codes: `0` ok, `2` parse error, `3` capability denied, `4` runtime error, `5` assertion failed.

## Additional Resources

### Reference Files

- **`references/tool-signatures.md`** — Full argument and return schemas for all built-in tools
- **`references/patterns.md`** — Idiomatic program patterns with complete working examples

### Example Files

Working `.a0` programs in `examples/`:
- **`examples/hello.a0`** — Minimal pure-data program
- **`examples/fetch-transform.a0`** — HTTP fetch, parse, write pattern
- **`examples/shell-exec.a0`** — Shell command execution
- **`examples/validation.a0`** — Data validation with assert/check
