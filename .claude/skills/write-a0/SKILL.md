---
name: write-a0
description: This skill should be used when the user asks to "write an A0 program", "create an A0 script", "generate A0 code", "write a .a0 file", "A0 syntax", "A0 example", "how to write A0", "A0 language", or needs to produce any new A0 source code. Provides the complete syntax, type system, tool signatures, stdlib, and idiomatic patterns needed to author correct A0 programs.
---

# Writing A0 Programs

A0 is a line-oriented scripting language for automation agents. Programs are sequences of statements producing a JSON result. Every program must end with `return <expr>` (any expression: record, literal, variable, arithmetic, list, etc.).

## Core Syntax

```
# Comments start with #
cap { fs.read: true }        # capability declaration (top of file)
let name = expr              # bind a value
expr -> name                 # bind result of expression statement
return expr                  # required, must be last statement (any expression)
```

## Types

Primitives: `int` `float` `bool` `str` `null` — literals: `42` `3.14` `true` `false` `null` `"hello"`

Records: `{ key: value, nested: { a: 1 } }` — keys may be dotted: `{ fs.read: true }`. Spread syntax: `{ ...base, extra: 42 }` merges `base` into the new record; later keys override earlier ones. Spreading a non-record produces `E_TYPE`.

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

**Exception: string concatenation with `+`.** The `+` operator also works on strings: `"hello" + " world"` produces `"hello world"`. Both operands must be the same type (both strings or both numbers). Mixing types (e.g., `"hello" + 1`) produces `E_TYPE`.

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
| `fs.list` | read | `call?` | `fs.read` |
| `fs.exists` | read | `call?` | `fs.read` |
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
| `coalesce` | Return `in` if not null, else `default` | `{ in: any, default: any }` -> `any` |
| `typeof` | Return type name of a value | `{ in: any }` -> `str` |

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
| `sort` | Sort list (natural order, by key, or multi-key) | `{ in: list, by?: str\|list }` -> `list` |
| `filter` | Keep elements by key truthiness or predicate fn (`return { ok: expr }`) | `{ in: list, by?: str, fn?: str }` -> `list` |
| `find` | First element where key matches value | `{ in: list, key: str, value: any }` -> `any\|null` |
| `range` | Generate integer list | `{ from: int, to: int }` -> `list` |
| `join` | Join list of strings | `{ in: list, sep?: str }` -> `str` |
| `map` | Transform list via named function | `{ in: list, fn: str }` -> `list` |
| `reduce` | Reduce list to single value via named function | `{ in: list, fn: str, init: any }` -> `any` |
| `unique` | Remove duplicate values (deep equality) | `{ in: list }` -> `list` |
| `pluck` | Extract a field from each record in a list | `{ in: list, key: str }` -> `list` |
| `flat` | Flatten one level of nested lists | `{ in: list }` -> `list` |

### Math Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `math.max` | Maximum of numeric list | `{ in: list }` -> `number` |
| `math.min` | Minimum of numeric list | `{ in: list }` -> `number` |

### String Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `str.concat` | Concatenate strings from a list | `{ parts: list }` -> `str` |
| `str.split` | Split string by separator | `{ in: str, sep: str }` -> `list` |
| `str.starts` | Starts-with check | `{ in: str, value: str }` -> `bool` |
| `str.ends` | Ends-with check | `{ in: str, value: str }` -> `bool` |
| `str.replace` | Replace substring | `{ in: str, from: str, to: str }` -> `str` |
| `str.template` | Interpolate `{var}` placeholders in a string | `{ in: str, vars: rec }` -> `str` |

### Record Operations

| Function | Purpose | Key Args |
|----------|---------|----------|
| `keys` | List of record keys | `{ in: rec }` -> `list` |
| `values` | List of record values | `{ in: rec }` -> `list` |
| `merge` | Shallow merge two records | `{ a: rec, b: rec }` -> `rec` |
| `entries` | Convert record to list of `{ key, value }` pairs | `{ in: rec }` -> `list` |

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
let safe = coalesce { in: maybe_null, default: "fallback" }
let t = typeof { in: 42 }                        # "number"
let names = pluck { in: users, key: "name" }
let flat_list = flat { in: [[1, 2], [3]] }        # [1, 2, 3]
let pairs = entries { in: { a: 1 } }             # [{ key: "a", value: 1 }]
let path = str.template { in: "pkg/{name}", vars: { name: "core" } }
```

## Evidence — assert & check

Both take `{ that: bool, msg: str }` and produce evidence records in the trace.

- **`assert`** — Fatal. Halts execution immediately on failure (exit 5, `E_ASSERT`). Use for invariants that MUST hold — the program cannot continue meaningfully if these fail.
- **`check`** — Non-fatal. Records evidence (ok/fail) and continues execution. If ANY check fails, the program still completes but the runner returns exit 5 after execution finishes. Use for validations the agent should know about but that should not prevent the program from finishing.

Use predicate functions to produce meaningful boolean values:

```
let same = eq { a: actual, b: expected }
assert { that: same, msg: "values match" }

let has_name = contains { in: record, value: "name" }
check { that: has_name, msg: "record has name field" }
```

You can also use `assert { that: true, msg: "..." }` as an evidence marker to document that a step completed, or `check { that: true, msg: "..." }` to record non-fatal evidence.

## Control Flow (v0.3)

### if — Conditional expression

**Record-style** (simple value expressions) with lazy evaluation (only the taken branch evaluates):

```
let msg = if { cond: ok, then: "yes", else: "no" }
```

**Block-style** (statement bodies with `return`) — parenthesized condition, both branches required:

```
let result = if (ok) {
  let msg = "success"
  return { status: msg }
} else {
  let msg = "failure"
  return { status: msg }
}
```

Block `if/else` bodies work like `fn` or `for` bodies: they can contain `let` bindings, tool calls (`call?`/`do`), stdlib calls, and must end with `return`. Both the `if` and `else` branches are required. The condition uses A0 truthiness.

Uses A0 truthiness: `false`, `null`, `0`, `""` are falsy; everything else truthy.

### for — List iteration

Iterates a list, producing a list of results. Each iteration runs in its own scope.

```
let results = for { in: items, as: "item" } {
  let processed = parse.json { in: item }
  return { data: processed }
}
```

Body must end with `return`. Budget-aware via `maxIterations`. The loop variable (`item`) is scoped to the body. Tool calls (`call?`/`do`) work inside `for` bodies.

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

Budget-aware via `maxIterations` (shared counter with `for`, `filter` (fn:), and `reduce`). Errors propagate immediately — no partial results.

### reduce — Accumulate a list to a single value

Apply a 2-parameter user-defined function to accumulate a list into a single value. The function receives `(accumulator, item)` for each element.

```
fn addScore { acc, item } {
  let newTotal = acc.val + item.score
  return { val: newTotal }
}
let result = reduce { in: items, fn: "addScore", init: { val: 0 } }
# result.val contains the sum
```

The callback must accept exactly 2 parameters. Budget-aware via `maxIterations` (shared counter with `for`, `map`, `filter`, `loop`).

### filter block — Inline predicate filtering (v0.5)

Filter a list with an inline predicate body. More concise than `filter { fn: ... }` when the predicate is simple.

```
let positives = filter { in: nums, as: "x" } {
  return x > 0
}
```

The body runs once per element. If the return value is truthy, the original item is kept. Uses the same truthiness unwrapping as `filter { fn: ... }` — if a record is returned, checks the first value; if a bare value is returned, checks it directly.

Backward compatible: `filter { in: list, by: "key" }` and `filter { in: list, fn: "pred" }` still work (no block = old behavior).

Budget-aware via `maxIterations` (shared counter with `for`, `map`, `reduce`, `loop`).

### loop — Iterative convergence (v0.5)

Run a body a fixed number of times, threading state through each iteration. The body receives the current value and returns the next value.

```
let result = loop { in: 0, times: 5, as: "x" } {
  return x + 1
}
# result == 5
```

Complex state with records:

```
let result = loop { in: { sum: 0, count: 0 }, times: 3, as: "acc" } {
  return { sum: acc.sum + acc.count + 1, count: acc.count + 1 }
}
```

- `in:` — initial value (any type)
- `times:` — number of iterations (must be a non-negative integer, else `E_TYPE`)
- `as:` — binding name for current value in each iteration
- 0 iterations returns the `in:` value unchanged

Budget-aware via `maxIterations` (shared counter with `for`, `map`, `filter`, `reduce`).

### fn — User-defined functions

Define before use. Called with record-style arguments. Direct recursion allowed. Functions can access variables from their defining scope (closure).

```
fn greet { name } {
  return { greeting: "hello", who: name }
}
let result = greet { name: "world" }
```

Parameters are destructured from the caller's record. Missing params default to `null`. Body must end with `return`.

**Closure example** — a function capturing an outer variable:

```
let threshold = 18
fn isAdult { item } {
  return { ok: item.age >= threshold }
}
let adults = filter { in: users, fn: "isAdult" }
```

The function `isAdult` captures `threshold` from the scope where it was defined.

### match — ok/err discrimination

Discriminates records with `ok` or `err` keys. Two forms:

```
# Match on a variable (identPath)
let output = match result {
  ok { val } {
    return { data: val }
  }
  err { e } {
    return { error: e }
  }
}

# Match on an expression (parenthesized)
let output = match ({ ok: 42 }) {
  ok { v } {
    return { value: v }
  }
  err { e } {
    return { error: e }
  }
}
```

Subject must be a record with `ok` or `err` key. When matching on a variable, use `match ident { ... }`. When matching on an expression, wrap it in parentheses: `match ( expr ) { ... }`. Both arms must end with `return`.

### try/catch — Error recovery

Catch runtime errors (tool failures, type errors, stdlib errors, etc.) without halting the program. The catch binding receives a `{ code, message }` record.

```
let result = try {
  call? fs.read { path: "maybe-missing.txt" } -> content
  let parsed = parse.json { in: content }
  return { data: parsed }
} catch { e } {
  return { error: e.code, detail: e.message }
}
```

The `try` body executes normally. If any statement throws, control transfers to the `catch` body. The binding `{ e }` uses the same syntax as `match` arm bindings. Both bodies must end with `return`.

Caught errors include: `E_TOOL`, `E_TOOL_ARGS`, `E_FN`, `E_TYPE`, `E_PATH`, `E_FOR_NOT_LIST`, `E_MATCH_NOT_RECORD`, `E_MATCH_NO_ARM`, and other runtime errors. Note: `E_ASSERT` (fatal assertion) is NOT catchable -- it always halts the program.

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
| `maxIterations` | int | Maximum `for`, `map`, `filter`, `reduce`, and `loop` iterations (cumulative) |

Only declare budget fields the program needs. Unknown fields produce `E_UNKNOWN_BUDGET` at validation time.

## Property Access

Dot notation on bound variables: `response.body`, `result.exitCode`, `data.items`.

## Program Rules

1. `return <expr>` is **required** and must be the **last** statement. Can return any expression (record, literal, variable, arithmetic, list, etc.).
2. Variables must be bound with `let` or `->` before use.
3. No duplicate `let` bindings in the same scope.
4. `call?` for read-mode tools only; `do` for effect-mode tools only.
5. Tool and function args are always records `{ ... }`.
6. Reserved words cannot be variable names: `cap`, `let`, `return`, `do`, `assert`, `check`, `true`, `false`, `null`, `import`, `as`, `budget`, `if`, `else`, `for`, `fn`, `match`, `try`, `catch`, `filter`, `loop`.
7. `fn` bodies, `for` bodies, `match` arms, `filter` block bodies, and `loop` bodies must each end with `return`.
8. `fn` must be defined before use (no hoisting).

## Common Mistakes

Avoid these frequent errors:

- **Forgetting `return`** → `E_NO_RETURN`. Every program must end with `return <expr>`.
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
- **`reduce` with non-2-param function** → `E_TYPE`. The callback must accept exactly 2 parameters (accumulator, item).
- **`reduce` with unknown function** → `E_UNKNOWN_FN`. The named function must be defined with `fn` before the `reduce` call.
- **`filter` with unknown function** → `E_UNKNOWN_FN`. When using `fn:`, the named function must be defined with `fn` before the `filter` call.
- **`filter` with neither `by` nor `fn`** → `E_FN`. Must provide either `by:` (key name) or `fn:` (predicate function name).
- **`filter` with both `by` and `fn`** → `E_FN`. Provide exactly one of `by:` or `fn:`, not both.
- **`filter` block on non-list** → `E_TYPE`. The `in:` value must evaluate to a list.
- **`loop` with non-integer `times`** → `E_TYPE`. The `times:` value must be a non-negative integer (floats like 2.5 also rejected).
- **`loop` with negative `times`** → `E_TYPE`. Use 0 or positive integers.
- **`for` on non-list** → `E_FOR_NOT_LIST`. The `in:` value must evaluate to a list.
- **`match` on non-record** → `E_MATCH_NOT_RECORD`. The subject must be a record with `ok` or `err` key.
- **`match` missing arm** → `E_MATCH_NO_ARM`. Subject record must have `ok` or `err` key.
- **Type error in expression** → `E_TYPE`. Arithmetic on non-numbers, division by zero, comparing incompatible types, mixed types with `+` (e.g., `"hello" + 1`), or spreading a non-record.
- **Missing `else` in block `if`** → Parse error. Block `if/else` requires both branches.
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

Exit codes: `0` ok, `2` parse error, `3` capability denied, `4` runtime error, `5` assert/check failed.
`assert` = fatal (halts immediately), `check` = non-fatal (records evidence, continues; exit 5 after run if any check failed).

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
- **`examples/bare-return-demo.a0`** — Returning bare values (non-record expressions)
- **`examples/filter-block-demo.a0`** — Inline filter block with predicate body
- **`examples/loop-demo.a0`** — Iterative convergence with `loop`
