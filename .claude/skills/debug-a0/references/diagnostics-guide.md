# A0 Diagnostics — Detailed Repair Guide

For each error code: what it means, what causes it, and how to fix it with before/after examples.

## E_LEX — Lexer Error

**Phase**: Lexing (tokenization)
**Exit code**: 2

The lexer could not tokenize the input. The source contains characters or sequences that don't form any valid A0 token.

**Common causes**:
- Unclosed string literal (missing closing `"`)
- Invalid escape sequence in string
- Unexpected special character
- Using single quotes instead of double quotes

**Before** (broken):
```
let name = 'hello'
```

**After** (fixed):
```
let name = "hello"
```

---

## E_PARSE — Parse Error

**Phase**: Parsing (CST construction)
**Exit code**: 2

The parser recognized all tokens but couldn't match them to the A0 grammar.

**Common causes**:
- Missing `=` in let binding
- Missing `->` in pipe binding
- Incorrect statement structure
- Extra or missing braces/brackets
- Using positional arguments instead of record syntax

**Before** (broken):
```
let x 42
```

**After** (fixed):
```
let x = 42
```

**Before** (broken):
```
call? fs.read "file.txt" -> content
```

**After** (fixed):
```
call? fs.read { path: "file.txt" } -> content
```

---

## E_AST — AST Construction Error

**Phase**: AST visitor
**Exit code**: 2

The CST-to-AST conversion failed. This is usually an internal error caused by unusual syntax combinations.

**Fix**: Simplify the expression. If it persists, it may be a parser bug.

---

## E_NO_RETURN — Missing Return

**Phase**: Validation
**Exit code**: 2

Every A0 program must end with a `return { ... }` statement.

**Before** (broken):
```
let x = 42
let y = { value: x }
```

**After** (fixed):
```
let x = 42
let y = { value: x }
return { result: y }
```

---

## E_RETURN_NOT_LAST — Return Not Last Statement

**Phase**: Validation
**Exit code**: 2

The `return` statement exists but is not the last statement in the program.

**Before** (broken):
```
return { value: 1 }
let x = 2
```

**After** (fixed):
```
let x = 2
return { value: 1 }
```

---

## E_UNKNOWN_CAP — Unknown Capability

**Phase**: Validation
**Exit code**: 2

A capability declared in `cap { ... }` is not a recognized capability name.

**Valid capabilities**: `fs.read`, `fs.write`, `http.get`, `sh.exec`

**Before** (broken):
```
cap { fs.read: true, network: true }
```

**After** (fixed):
```
cap { fs.read: true, http.get: true }
```

---

## E_DUP_BINDING — Duplicate Binding

**Phase**: Validation
**Exit code**: 2

A variable name is bound more than once. A0 does not support reassignment.

**Before** (broken):
```
let x = 1
let x = 2
return { x: x }
```

**After** (fixed):
```
let x = 1
let y = 2
return { x: x, y: y }
```

---

## E_UNBOUND — Unbound Variable

**Phase**: Validation (or Runtime)
**Exit code**: 2 (validation) or 4 (runtime)

A variable is used before being bound with `let` or `->`.

**Before** (broken):
```
return { value: x }
```

**After** (fixed):
```
let x = 42
return { value: x }
```

**Before** (broken — using result of tool without binding):
```
cap { fs.read: true }
call? fs.read { path: "file.txt" }
return { content: content }
```

**After** (fixed):
```
cap { fs.read: true }
call? fs.read { path: "file.txt" } -> content
return { content: content }
```

---

## E_TOOL_ARGS — Invalid Tool Arguments

**Phase**: Runtime
**Exit code**: 4

Tool arguments don't match the expected schema.

**Fix**: Check that tool arguments use the correct record fields. Expected signatures:
- `fs.read { path, encoding? }`
- `fs.write { path, data, format? }`
- `http.get { url, headers? }`
- `sh.exec { cmd, cwd?, env?, timeoutMs? }`

---

## E_CAP_DENIED — Capability Denied

**Phase**: Runtime
**Exit code**: 3

A tool requires a capability that the host policy does not allow.

**Two possible fixes**:

1. Add the capability to the program's `cap { ... }` block
2. Update the policy file (`.a0policy.json` or `~/.a0/policy.json`)

**Before** (broken):
```
cap { fs.read: true }
do fs.write { path: "out.json", data: { x: 1 }, format: "json" } -> artifact
return { artifact: artifact }
```

**After** (fixed):
```
cap { fs.read: true, fs.write: true }
do fs.write { path: "out.json", data: { x: 1 }, format: "json" } -> artifact
return { artifact: artifact }
```

For development, use `--unsafe-allow-all` to bypass policy checks.

---

## E_UNKNOWN_TOOL — Unknown Tool

**Phase**: Runtime
**Exit code**: 4

The tool name is not registered. Built-in tools: `fs.read`, `fs.write`, `http.get`, `sh.exec`.

**Before** (broken):
```
call? file.read { path: "data.json" } -> content
```

**After** (fixed):
```
call? fs.read { path: "data.json" } -> content
```

---

## E_CALL_EFFECT — Wrong Tool Invocation Mode

**Phase**: Validation
**Exit code**: 2

`call?` was used on an effect-mode tool. Note: using `do` on a read-mode tool is allowed but unconventional — prefer `call?` for read tools to signal read-only intent.

**Read tools** (use `call?`): `fs.read`, `http.get`
**Effect tools** (use `do`): `fs.write`, `sh.exec`

**Before** (broken):
```
do fs.read { path: "file.txt" } -> content
call? fs.write { path: "out.json", data: { x: 1 }, format: "json" } -> artifact
```

**After** (fixed):
```
call? fs.read { path: "file.txt" } -> content
do fs.write { path: "out.json", data: { x: 1 }, format: "json" } -> artifact
```

---

## E_TOOL — Tool Execution Error

**Phase**: Runtime
**Exit code**: 4

The tool ran but threw an error.

**Common causes**:
- `fs.read`: File does not exist or permission denied
- `fs.write`: Directory does not exist or permission denied
- `http.get`: Network error, DNS failure, timeout
- `sh.exec`: Command not found, timeout exceeded

**Diagnosis**: Use `--trace` to see the tool's error message.

---

## E_UNKNOWN_FN — Unknown Stdlib Function

**Phase**: Runtime
**Exit code**: 4

The function name is not a recognized stdlib function.

**Valid functions**: `parse.json`, `get`, `put`, `patch`, `eq`, `contains`, `not`, `and`, `or`, `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `str.concat`, `str.split`, `str.starts`, `str.replace`, `keys`, `values`, `merge`

**Before** (broken):
```
let data = json.parse { in: raw }
```

**After** (fixed):
```
let data = parse.json { in: raw }
```

---

## E_FN — Stdlib Function Error

**Phase**: Runtime
**Exit code**: 4

A stdlib function threw during execution.

**Common causes**:
- `parse.json` received invalid JSON
- `get` received a malformed path expression
- `patch` received invalid patch operations

**Diagnosis**: Check the function arguments match the expected format.

---

## E_PATH — Property Access Error

**Phase**: Runtime
**Exit code**: 4

Attempted dot-access on a non-record value (e.g., accessing `.body` on a string or null).

**Before** (broken):
```
cap { http.get: true }
call? http.get { url: "https://example.com" } -> resp
let data = resp.body.title
return { data: data }
```

**After** (fixed — parse JSON first):
```
cap { http.get: true }
call? http.get { url: "https://example.com" } -> resp
let body = parse.json { in: resp.body }
let data = get { in: body, path: "title" }
return { data: data }
```

---

## E_ASSERT — Assertion Failed

**Phase**: Runtime
**Exit code**: 5

An `assert { that: <expr>, msg: "..." }` evaluated to false.

**Fix**: Either the assertion condition is wrong, or the data producing the condition is wrong. Trace the data flow backward from the assertion to find the root cause.

---

## E_CHECK — Check Failed

**Phase**: Runtime
**Exit code**: 5

A `check { that: <expr>, msg: "..." }` evaluated to false.

Same debugging approach as `E_ASSERT`.

---

## E_UNDECLARED_CAP — Undeclared Capability

**Phase**: Validation
**Exit code**: 2

A tool is used in the program but its corresponding capability is not declared in the `cap { ... }` block. Since v0.2, `a0 check` enforces that every tool call has a matching capability declaration.

**Before** (broken):
```
call? fs.read { path: "data.json" } -> content
return { content: content }
```

**After** (fixed):
```
cap { fs.read: true }
call? fs.read { path: "data.json" } -> content
return { content: content }
```

---

## E_BUDGET — Budget Exceeded

**Phase**: Runtime
**Exit code**: 4

A budget limit declared in `budget { ... }` was exceeded during execution.

**Budget fields**:
- `timeMs` — wall-clock time limit
- `maxToolCalls` — maximum number of tool invocations
- `maxBytesWritten` — maximum bytes written via `fs.write`

**Before** (broken — too many tool calls):
```
cap { fs.read: true }
budget { maxToolCalls: 1 }
call? fs.read { path: "a.json" } -> a
call? fs.read { path: "b.json" } -> b
return { a: a, b: b }
```

**After** (fixed):
```
cap { fs.read: true }
budget { maxToolCalls: 2 }
call? fs.read { path: "a.json" } -> a
call? fs.read { path: "b.json" } -> b
return { a: a, b: b }
```

---

## E_TYPE — Type Error in Expression

**Phase**: Runtime
**Exit code**: 4

An expression used an operator with incompatible types. Arithmetic operators (`+`, `-`, `*`, `/`, `%`) require numeric operands. Comparison operators (`>`, `<`, `>=`, `<=`) require numbers or strings. Division and modulo by zero are also type errors. Unary minus requires a number.

**Common causes**:
- Arithmetic on non-numbers (e.g., string + number)
- Division or modulo by zero
- Comparing incompatible types (e.g., number > boolean)
- Unary minus on a non-number

**Before** (broken — arithmetic on non-number):
```
let x = "hello" + 1
return { x: x }
```

**Error**: `E_TYPE: Operator '+' requires numbers`

**After** (fixed):
```
let x = 5 + 1
return { x: x }
```

**Before** (broken — division by zero):
```
let x = 1 / 0
return { x: x }
```

**Error**: `E_TYPE: Division by zero`

**After** (fixed):
```
let divisor = 2
let x = 1 / divisor
return { x: x }
```

**Before** (broken — comparing incompatible types):
```
let x = true > false
return { x: x }
```

**Error**: `E_TYPE: Operator '>' requires numbers or strings`

**After** (fixed):
```
let x = 10 > 5
return { x: x }
```

**Before** (broken — unary minus on non-number):
```
let x = -"hello"
return { x: x }
```

**Error**: `E_TYPE: Unary '-' requires a number`

**After** (fixed):
```
let x = -42
return { x: x }
```

---

## E_UNKNOWN_BUDGET — Unknown Budget Field

**Phase**: Validation
**Exit code**: 2

A field in the `budget { ... }` block is not a recognized budget field name.

**Valid fields**: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations`

**Before** (broken):
```
budget { timeout: 5000 }
```

**After** (fixed):
```
budget { timeMs: 5000 }
```
