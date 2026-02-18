---
sidebar_position: 2
---

# Diagnostic Codes

Every A0 error includes a stable diagnostic code (e.g., `E_PARSE`, `E_UNBOUND`). These codes identify the exact type of error and are consistent across CLI output formats.

Codes are organized by the phase in which they occur and the [exit code](./exit-codes.md) they produce.

## Compile-Time Errors (Exit 2)

These errors are caught by [`a0 check`](../cli/check.md) without executing the program.

### E_LEX

**Lexer error** -- the source contains characters or tokens the lexer does not recognize.

- **Common cause:** Invalid characters, unterminated strings, or unsupported syntax.
- **Fix:** Check for typos, misplaced characters, or unsupported Unicode.

```a0
let x = @invalid
return { x: x }
```

### E_PARSE

**Parser error** -- the token sequence does not match any grammar rule.

- **Common cause:** Missing braces, incorrect statement structure, misplaced keywords.
- **Fix:** Check the statement syntax. Every `let` needs `=`, every `call?`/`do` needs `{ ... } -> target`.

```a0
let x 42
return { x: x }
```

### E_AST

**AST construction error** -- the parser produced tokens but they could not form a valid AST node.

- **Common cause:** Internal parser issue or severely malformed syntax.
- **Fix:** Simplify the expression and rebuild incrementally.

### E_NO_RETURN

**Missing return statement** -- the program (or a function/for/match body) does not end with `return`.

- **Common cause:** Forgot to add `return` at the end.
- **Fix:** Add a `return { ... }` as the last statement.

```a0
# Missing return
let x = 42
```

```
error[E_NO_RETURN]: Program must end with a return statement.
  hint: Add a 'return { ... }' statement at the end of your program.
```

### E_RETURN_NOT_LAST

**Return is not the last statement** -- `return` appears before other statements in the same block.

- **Common cause:** Statements placed after `return`.
- **Fix:** Move `return` to the end, or remove unreachable statements.

```a0
return { x: 1 }
let y = 2
```

### E_UNKNOWN_CAP

**Unknown capability** -- the `cap { ... }` header references a capability that does not exist.

- **Common cause:** Typo in capability name.
- **Fix:** Use one of the valid capabilities: `fs.read`, `fs.write`, `http.get`, `sh.exec`.

```a0
cap { http.post: true }
```

```
error[E_UNKNOWN_CAP]: Unknown capability 'http.post'.
  hint: Valid capabilities: fs.read, fs.write, http.get, sh.exec
```

### E_UNDECLARED_CAP

**Undeclared capability** -- a tool is used in the program but its capability is not declared in a `cap` header.

- **Common cause:** Forgot to add the capability to the `cap { ... }` block.
- **Fix:** Add the missing capability to your `cap` declaration.

```a0
# Missing: cap { http.get: true }
call? http.get { url: "https://example.com" } -> r
return { r: r }
```

```
error[E_UNDECLARED_CAP]: Tool 'http.get' is used but its capability is not declared in a 'cap { ... }' header.
  hint: Add 'http.get: true' to your cap { ... } declaration.
```

### E_UNKNOWN_BUDGET

**Unknown budget field** -- the `budget { ... }` header contains a field name that is not recognized.

- **Common cause:** Typo in budget field name.
- **Fix:** Use valid budget fields: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations`.

```a0
budget { maxTime: 5000 }
```

```
error[E_UNKNOWN_BUDGET]: Unknown budget field 'maxTime'.
  hint: Valid budget fields: timeMs, maxToolCalls, maxBytesWritten, maxIterations
```

### E_DUP_BINDING

**Duplicate binding** -- a `let` variable name is already used in the current scope.

- **Common cause:** Reusing the same variable name.
- **Fix:** Use a different name for the second binding.

```a0
let x = 1
let x = 2
return { x: x }
```

```
error[E_DUP_BINDING]: Duplicate binding 'x'.
  hint: Use a different variable name.
```

### E_UNBOUND

**Unbound variable** -- a variable is referenced but was never defined with `let` or as a function parameter.

- **Common cause:** Typo in variable name, or using a variable before defining it.
- **Fix:** Define the variable with `let` before referencing it, or fix the spelling.

```a0
let name = "hello"
return { greeting: nme }
```

```
error[E_UNBOUND]: Unbound variable 'nme'.
  hint: Make sure the variable is defined with 'let' before use.
```

### E_CALL_EFFECT

**call? with effectful tool** -- `call?` (read-only call) was used with a tool that produces side effects.

- **Common cause:** Using `call?` instead of `do` for `fs.write` or `sh.exec`.
- **Fix:** Replace `call?` with `do`.

```a0
cap { fs.write: true }
call? fs.write { path: "out.txt", data: "hello" } -> r
return { r: r }
```

```
error[E_CALL_EFFECT]: Cannot use 'call?' with effectful tool 'fs.write'. Use 'do' instead.
  hint: Replace 'call? fs.write' with 'do fs.write'.
```

### E_FN_DUP

**Duplicate function definition** -- a function name is already used by another function or variable in the same scope.

- **Common cause:** Defining two functions with the same name.
- **Fix:** Rename one of the functions.

```a0
fn add { a, b } {
  return { result: a + b }
}
fn add { x, y } {
  return { result: x + y }
}
return { result: add { a: 1, b: 2 } }
```

```
error[E_FN_DUP]: Duplicate function definition 'add'.
  hint: Use a different function name.
```

### E_UNKNOWN_FN

**Unknown function** -- a function call references a name that is not a known stdlib function or user-defined function.

- **Common cause:** Typo in function name, or calling a function before defining it.
- **Fix:** Check spelling, or define the function before calling it.

```a0
let result = unkown_fn { x: 1 }
return { result: result }
```

### E_UNKNOWN_TOOL

**Unknown tool** -- a `call?` or `do` statement references a tool that does not exist.

- **Common cause:** Typo in tool name.
- **Fix:** Use a valid tool name: `fs.read`, `fs.write`, `http.get`, `sh.exec`.

```a0
cap { http.post: true }
do http.post { url: "https://example.com", body: "data" } -> r
return { r: r }
```

## Runtime Errors -- Capability (Exit 3)

### E_CAP_DENIED

**Capability denied** -- the program declares a capability that is not allowed by the active [policy file](../capabilities/policy-files.md).

- **Common cause:** Policy file does not include the required capability.
- **Fix:** Add the capability to `.a0policy.json` or `~/.a0/policy.json`, or use `--unsafe-allow-all` for development.

```bash
a0 run program.a0 --pretty
```

```
error[E_CAP_DENIED]: Capability 'sh.exec' is not allowed by the active policy.
```

## Runtime Errors -- Execution (Exit 4)

These errors occur during program execution and cannot be caught by `a0 check`.

### E_TOOL_ARGS

**Invalid tool arguments** -- the arguments passed to a tool do not match its input schema.

- **Common cause:** Missing required fields, wrong types, extra fields.
- **Fix:** Check the tool's expected arguments and correct the call.

```a0
cap { fs.read: true }
call? fs.read { } -> content
return { content: content }
```

### E_TOOL

**Tool execution failure** -- the tool ran but encountered an error (e.g., file not found, HTTP error, command failed).

- **Common cause:** File does not exist, network error, command returned non-zero.
- **Fix:** Verify inputs (file paths, URLs, commands) and use `match` to handle errors.

### E_FN

**Stdlib function error** -- a stdlib function threw an error during execution.

- **Common cause:** Invalid input to `parse.json`, invalid path in `get`/`put`, wrong argument types.
- **Fix:** Validate inputs before calling stdlib functions.

```a0
let data = parse.json { in: "not valid json" }
return { data: data }
```

### E_BUDGET

**Budget exceeded** -- execution hit a limit set in the `budget { ... }` header.

- **Common cause:** Too many tool calls (`maxToolCalls`), execution took too long (`timeMs`), too many iterations (`maxIterations`).
- **Fix:** Increase the budget limit, or optimize the program to use fewer resources.

### E_PATH

**Path operation error** -- a `get` or `put` path operation failed.

- **Common cause:** Path does not exist in the data structure, invalid path syntax.
- **Fix:** Verify the path exists in the input data.

### E_FOR_NOT_LIST

**For loop on non-list** -- a `for` expression received a value that is not a list.

- **Common cause:** Passing a record, string, or number to `for ... in`.
- **Fix:** Ensure the expression after `in` evaluates to a list.

```a0
let data = { a: 1 }
for item in data {
  return { item: item }
}
return { done: true }
```

### E_MATCH_NOT_RECORD

**Match on non-record** -- a `match` expression received a value that is not a record.

- **Common cause:** Matching on a string, number, or list instead of a record with `ok`/`err` keys.
- **Fix:** Ensure the matched value is a record.

### E_MATCH_NO_ARM

**No matching arm** -- a `match` expression found neither an `ok` nor `err` key in the matched record.

- **Common cause:** The record does not contain `ok` or `err`.
- **Fix:** Ensure the value being matched is a result record with an `ok` or `err` key.

### E_TYPE

**Type error** -- an operation received a value of the wrong type at runtime.

- **Common cause:** Using arithmetic on non-numbers, string operations on non-strings.
- **Fix:** Check the types of values flowing through your program.

### E_UNKNOWN_FN (runtime)

**Unknown function at runtime** -- a function call could not be resolved during execution.

- **Common cause:** Rare; usually caught at compile time.
- **Fix:** Define the function before calling it.

### E_UNKNOWN_TOOL (runtime)

**Unknown tool at runtime** -- a tool could not be found in the tool registry.

- **Common cause:** Rare; usually caught at compile time.
- **Fix:** Use a valid tool name.

## Runtime Errors -- Assertion (Exit 5)

### E_ASSERT

**Assertion failed** -- an `assert` statement evaluated `that` to a falsy value. Execution halts immediately.

- **Common cause:** A program invariant was violated.
- **Fix:** Fix the condition or the data that caused the assertion to fail.

```a0
assert { that: false, msg: "something went wrong" }
return { ok: true }
```

```
error[E_ASSERT]: Assertion failed: something went wrong
```

### E_CHECK

**Check failed** -- a `check` statement evaluated `that` to a falsy value. An evidence record is produced.

- **Common cause:** A program property did not hold.
- **Fix:** Investigate the failing condition using trace output and evidence records.

```a0
check { that: false, msg: "expected positive value" }
return { ok: true }
```

## Quick Reference Table

| Code | Phase | Exit | Description |
|------|-------|------|-------------|
| `E_LEX` | Compile | 2 | Lexer error |
| `E_PARSE` | Compile | 2 | Parser error |
| `E_AST` | Compile | 2 | AST construction error |
| `E_NO_RETURN` | Compile | 2 | Missing return statement |
| `E_RETURN_NOT_LAST` | Compile | 2 | Return not last statement |
| `E_UNKNOWN_CAP` | Compile | 2 | Unknown capability |
| `E_UNDECLARED_CAP` | Compile | 2 | Undeclared capability |
| `E_UNKNOWN_BUDGET` | Compile | 2 | Unknown budget field |
| `E_DUP_BINDING` | Compile | 2 | Duplicate variable name |
| `E_UNBOUND` | Compile | 2 | Unbound variable |
| `E_CALL_EFFECT` | Compile | 2 | call? with effectful tool |
| `E_FN_DUP` | Compile | 2 | Duplicate function name |
| `E_UNKNOWN_FN` | Compile | 2 | Unknown function |
| `E_UNKNOWN_TOOL` | Compile | 2 | Unknown tool |
| `E_CAP_DENIED` | Runtime | 3 | Capability denied by policy |
| `E_TOOL_ARGS` | Runtime | 4 | Invalid tool arguments |
| `E_TOOL` | Runtime | 4 | Tool execution failure |
| `E_FN` | Runtime | 4 | Stdlib function error |
| `E_BUDGET` | Runtime | 4 | Budget limit exceeded |
| `E_PATH` | Runtime | 4 | Path operation error |
| `E_FOR_NOT_LIST` | Runtime | 4 | For loop on non-list |
| `E_MATCH_NOT_RECORD` | Runtime | 4 | Match on non-record |
| `E_MATCH_NO_ARM` | Runtime | 4 | No matching arm |
| `E_TYPE` | Runtime | 4 | Type error |
| `E_ASSERT` | Runtime | 5 | Assertion failed |
| `E_CHECK` | Runtime | 5 | Check failed |
