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

Punctuation: `( )` for grouping expressions (controls operator precedence).

## Arithmetic and Comparison Operators

Binary operators on numeric values, usable anywhere an expression is expected. AST node type: `BinaryExpr`.

### Arithmetic Operators

```
let total = a + b
let diff = a - b
let product = a * b
let ratio = a / b
let remainder = a % b
```

Precedence follows standard math: `*`, `/`, `%` bind tighter than `+`, `-`. Use parentheses to override: `let x = (a + b) * c`.

Operands must be numbers (int or float). Using arithmetic on non-numbers produces `E_TYPE` (exit 4). Division or modulo by zero also produces `E_TYPE`.

### Comparison Operators

```
let bigger = a > b
let ok = a <= threshold
let same = a == b
let diff = a != b
```

Full set: `>`, `<`, `>=`, `<=`, `==`, `!=`. Return `bool`. Work on numbers and strings (lexicographic comparison for strings). Comparing incompatible types produces `E_TYPE`.

Comparison operators have lower precedence than arithmetic, so `a + 1 > b` means `(a + 1) > b`.

### Unary Minus

Negate a numeric value. AST node type: `UnaryExpr`.

```
let neg = -x
let result = -(a + b)
```

Using unary minus on a non-number produces `E_TYPE`.

## Capabilities

Declare required capabilities at the top of the file. Execution fails before any side-effect if the host policy denies them.

```
cap { fs.read: true, http.get: true }
```

Valid capabilities: `fs.read`, `fs.write`, `http.get`, `sh.exec`

Only declare capabilities the program actually uses.

## Tools — Read vs Effect

Read-only tools use `call?`. Effectful tools use `do`. Using `call?` on an effect tool is a validation error (`E_CALL_EFFECT`, exit 2) caught by `a0 check`.

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

### Data Functions

| Function | Purpose | Key Args |
|----------|---------|----------|
| `parse.json` | Parse JSON string | `{ in: str }` |
| `get` | Read nested path | `{ in: record, path: "a.b[0]" }` |
| `put` | Set nested path | `{ in: record, path: "a.b", value: x }` |
| `patch` | JSON Patch (RFC 6902) | `{ in: record, ops: [...] }` |

### Predicate Functions

| Function | Purpose | Key Args |
|----------|---------|----------|
| `eq` | Deep equality | `{ a: val, b: val }` → `bool` |
| `contains` | Substring / element / key check | `{ in: str\|list\|record, value: val }` → `bool` |
| `not` | Boolean negation | `{ in: val }` → `bool` |
| `and` | Logical AND | `{ a: val, b: val }` → `bool` |
| `or` | Logical OR | `{ a: val, b: val }` → `bool` |

Predicates use A0 truthiness: `false`, `null`, `0`, and `""` are falsy; everything else is truthy.

### List Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `len` | Length of list, string, or record (key count) | `{ in: list\|str\|rec }` -> `int` |
| `append` | Append element to list | `{ in: list, value: any }` -> `list` |
| `concat` | Concatenate two lists | `{ a: list, b: list }` -> `list` |
| `sort` | Sort list (natural order or by key) | `{ in: list, by?: str }` -> `list` |
| `filter` | Keep elements where predicate key is truthy | `{ in: list, by: str }` -> `list` |
| `find` | First element where key matches value | `{ in: list, key: str, value: any }` -> `any\|null` |
| `range` | Generate integer list | `{ from: int, to: int }` -> `list` |
| `join` | Join list of strings | `{ in: list, sep?: str }` -> `str` |
| `map` | Transform list via named function | `{ in: list, fn: str }` -> `list` |

### String Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `str.concat` | Concatenate strings from a list | `{ parts: list }` -> `str` |
| `str.split` | Split string by separator | `{ in: str, sep: str }` -> `list` |
| `str.starts` | Starts-with check | `{ in: str, value: str }` -> `bool` |
| `str.replace` | Replace substring | `{ in: str, from: str, to: str }` -> `str` |

### Record Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `keys` | List of record keys | `{ in: rec }` -> `list` |
| `values` | List of record values | `{ in: rec }` -> `list` |
| `merge` | Shallow merge two records | `{ a: rec, b: rec }` -> `rec` |

```
let parsed = parse.json { in: raw_string }
let val = get { in: record, path: "nested.key[0]" }
let same = eq { a: 1, b: 1 }
let has_key = contains { in: record, value: "name" }
let count = len { in: items }
let nums = range { from: 1, to: 5 }
let sorted = sort { in: items, by: "name" }
let k = keys { in: record }
let full = str.concat { parts: ["hello", " ", "world"] }
```

## Evidence — assert & check

Both take `{ that: bool, msg: str }`. A failed assertion stops execution (exit 5).

Use predicate functions to produce meaningful boolean values for assertions:

```
let same = eq { a: actual, b: expected }
assert { that: same, msg: "values match" }

let has_name = contains { in: record, value: "name" }
check { that: has_name, msg: "record has name field" }
```

You can also use `assert { that: true, msg: "..." }` as an evidence marker to document that a step completed.

## Control Flow (v0.3)

### if — Conditional expression

Record-style with lazy evaluation (only the taken branch evaluates):

```
let msg = if { cond: ok, then: "yes", else: "no" }
```

Uses A0 truthiness: `false`, `null`, `0`, `""` are falsy; everything else truthy.

### for — List iteration

Iterates a list, producing a list of results. Each iteration runs in its own scope.

```
let results = for { in: items, as: "item" } {
  let processed = parse.json { in: item }
  return { data: processed }
}
```

Body must end with `return`. Budget-aware via `maxIterations`. The loop variable (`item`) is scoped to the body.

### map — Higher-order list transformation

Apply a user-defined function to every element of a list, collecting results. The function must be defined with `fn` before use and referenced by name as a string.

```
fn double { x } {
  return { val: x * 2 }
}
let doubled = map { in: [1, 2, 3], fn: "double" }
# doubled == [{ val: 2 }, { val: 4 }, { val: 6 }]
```

Multi-param functions work with record items — params are destructured from record keys:

```
fn fullName { first, last } {
  let name = str.concat { parts: [first, " ", last] }
  return { name: name }
}
let names = map { in: users, fn: "fullName" }
```

Budget-aware via `maxIterations` (shared counter with `for`). Errors propagate immediately — no partial results.

### fn — User-defined functions

Define before use. Called with record-style arguments. Direct recursion allowed, no closures.

```
fn greet { name } {
  return { greeting: "hello", who: name }
}
let result = greet { name: "world" }
```

Parameters are destructured from the caller's record. Missing params default to `null`. Body must end with `return`.

### match — ok/err discrimination

Discriminates records with `ok` or `err` keys:

```
let output = match result {
  ok { val } {
    return { data: val }
  }
  err { e } {
    return { error: e }
  }
}
```

Subject must be a record with `ok` or `err` key. The inner value is bound to the named identifier. Both arms must end with `return`.

## Budget

Declare resource limits with `budget { ... }` at the top of the file (before or after `cap`). Exceeding a limit stops execution with `E_BUDGET` (exit 4).

```
budget { timeMs: 30000, maxToolCalls: 10, maxBytesWritten: 1048576, maxIterations: 100 }
```

| Field | Type | Meaning |
|-------|------|---------|
| `timeMs` | int | Maximum wall-clock time in milliseconds |
| `maxToolCalls` | int | Maximum number of tool invocations |
| `maxBytesWritten` | int | Maximum bytes written via `fs.write` |
| `maxIterations` | int | Maximum `for` loop and `map` iterations (cumulative) |

Only declare budget fields the program needs. Unknown fields produce `E_UNKNOWN_BUDGET` at validation time.

## Property Access

Dot notation on bound variables: `response.body`, `result.exitCode`, `data.items`.

## Program Rules

1. `return { ... }` is **required** and must be the **last** statement.
2. Variables must be bound with `let` or `->` before use.
3. No duplicate `let` bindings in the same scope.
4. `call?` for read-mode tools only; `do` for effect-mode tools only.
5. Tool and function args are always records `{ ... }`.
6. Reserved words cannot be variable names: `cap`, `let`, `return`, `do`, `assert`, `check`, `true`, `false`, `null`, `import`, `as`, `budget`, `if`, `for`, `fn`, `match`.
7. `fn` bodies, `for` bodies, and `match` arms must each end with `return`.
8. `fn` must be defined before use (no hoisting).

## Common Mistakes

Avoid these frequent errors:

- **Forgetting `return`** → `E_NO_RETURN`. Every program must end with `return { ... }`.
- **`return` not last** → `E_RETURN_NOT_LAST`. No statements after return.
- **Using `call?` for an effect tool** → `E_CALL_EFFECT`. Use `do` for `fs.write` and `sh.exec`.
- **Using `do` for a read tool** — allowed but unconventional. Prefer `call?` for `fs.read` and `http.get` to signal read-only intent.
- **Undeclared capability** → `E_UNDECLARED_CAP`. Declare the capability in `cap { ... }` for each tool used.
- **Capability denied by policy** → `E_CAP_DENIED`. Update the policy file or use `--unsafe-allow-all`.
- **Budget exceeded** → `E_BUDGET`. Increase the budget limit or reduce resource usage.
- **Unknown budget field** → `E_UNKNOWN_BUDGET`. Valid fields: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations`.
- **Duplicate function name** → `E_FN_DUP`. Each `fn` name must be unique.
- **`map` with non-list `in`** → `E_TYPE`. The `in:` value must be a list.
- **`map` with non-string `fn`** → `E_TYPE`. The `fn:` value must be a function name string.
- **`map` with unknown function** → `E_UNKNOWN_FN`. The named function must be defined with `fn` before the `map` call.
- **`for` on non-list** → `E_FOR_NOT_LIST`. The `in:` value must evaluate to a list.
- **`match` on non-record** → `E_MATCH_NOT_RECORD`. The subject must be a record with `ok` or `err` key.
- **`match` missing arm** → `E_MATCH_NO_ARM`. Subject record must have `ok` or `err` key.
- **Type error in expression** → `E_TYPE`. Arithmetic on non-numbers, division by zero, or comparing incompatible types.
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
a0 run file.a0 --pretty              # human-readable error output
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
- **`examples/if-demo.a0`** — Conditional branching with `if`
- **`examples/for-demo.a0`** — List iteration with `for`
- **`examples/fn-demo.a0`** — User-defined functions with `fn`
- **`examples/match-demo.a0`** — ok/err discrimination with `match`
- **`examples/map-demo.a0`** — Higher-order list transformation with `map`
