---
name: debug-a0
description: This skill should be used when the user asks to "debug an A0 program", "fix A0 error", "understand A0 error", "A0 diagnostic", "A0 exit code", "read A0 trace", "why does my A0 program fail", "A0 parse error", "A0 capability denied", "A0 runtime error", or needs to diagnose, understand, or fix issues in existing A0 source code.
---

# Debugging A0 Programs

Guide for diagnosing and fixing errors in A0 programs. A0 uses structured diagnostics with stable error codes, machine-readable trace output, and deterministic exit codes.

## Diagnostic Format

A0 errors follow this format:

```
error[E_CODE]: Human-readable message
  --> file.a0:3:5
  hint: Suggested fix (when available)
```

Each diagnostic has:
- **code** — Stable string identifier (e.g., `E_PARSE`)
- **message** — What went wrong
- **span** — File, line, and column
- **hint** — Optional fix suggestion

In JSON mode (non-pretty), diagnostics are `{ code, message, span?, hint? }`.

## Exit Codes

Map exit codes to error categories:

| Exit | Meaning | Action |
|------|---------|--------|
| `0` | Success | Program ran correctly |
| `2` | Parse/validation error | Fix syntax or semantic issues |
| `3` | Capability denied | Add capability to `cap {}` or update policy |
| `4` | Runtime/tool error | Fix tool arguments or external dependency |
| `5` | Assertion/check failed | `assert` = fatal (halts), `check` = non-fatal (continues; exit 5 after run) |

## Quick Diagnostic Reference

### Compile-Time Errors (exit 2)

| Code | Cause | Fix |
|------|-------|-----|
| `E_LEX` | Invalid token | Check for typos, unclosed strings, invalid characters |
| `E_PARSE` | Syntax error | Verify statement structure matches A0 grammar |
| `E_AST` | AST construction failed | Usually an internal error; simplify the expression |
| `E_NO_RETURN` | Missing `return` | Add `return { ... }` as last statement |
| `E_RETURN_NOT_LAST` | Statements after `return` | Move `return` to end of program |
| `E_UNKNOWN_CAP` | Invalid capability name | Use valid caps: `fs.read`, `fs.write`, `http.get`, `sh.exec` |
| `E_UNDECLARED_CAP` | Tool used without declaring capability | Add the tool's capability to `cap { ... }` |
| `E_UNKNOWN_BUDGET` | Invalid budget field name | Use valid fields: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations` |
| `E_DUP_BINDING` | Duplicate `let` name | Rename one of the bindings |
| `E_UNBOUND` | Undefined variable | Bind with `let` or `->` before use |
| `E_CALL_EFFECT` | Wrong keyword for tool mode | Use `call?` for read tools, `do` for effect tools |
| `E_FN_DUP` | Duplicate function name | Rename one of the `fn` definitions |

### Runtime Errors (exit 3, 4, 5)

| Code | Cause | Fix |
|------|-------|-----|
| `E_CAP_DENIED` | Capability not allowed by policy | Add to `cap {}` or update `.a0policy.json` |
| `E_UNKNOWN_TOOL` | Tool name not recognized | Check spelling: `fs.read`, `fs.write`, `fs.list`, `fs.exists`, `http.get`, `sh.exec` |
| `E_TOOL_ARGS` | Invalid tool arguments | Check required fields in tool signature |
| `E_TOOL` | Tool execution failed | Check tool args, file paths, URLs, permissions |
| `E_BUDGET` | Budget limit exceeded | Increase budget limit or reduce resource usage |
| `E_UNKNOWN_FN` | Stdlib/user function not found | Check spelling: `parse.json`, `get`, `put`, `patch`, `coalesce`, `typeof`, `eq`, `contains`, `not`, `and`, `or`, `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `map`, `reduce`, `unique`, `pluck`, `flat`, `str.concat`, `str.split`, `str.starts`, `str.ends`, `str.replace`, `str.template`, `keys`, `values`, `merge`, `entries`, `math.max`, `math.min`. For `map`/`reduce`, ensure the `fn` name matches a defined `fn`. `filter` supports `by:` (key truthiness) or `fn:` (predicate function) |
| `E_FN` | Stdlib function threw | Check function args (e.g., invalid JSON to `parse.json`) |
| `E_PATH` | Property access on non-record | Verify the variable holds a record before dot access |
| `E_FOR_NOT_LIST` | `for` `in:` value is not a list | Ensure `in:` evaluates to a list `[...]` |
| `E_MATCH_NOT_RECORD` | `match` subject is not a record | Ensure subject evaluates to `{ ok: ... }` or `{ err: ... }` |
| `E_MATCH_NO_ARM` | `match` subject has no `ok`/`err` key | Subject record must contain an `ok` or `err` key |
| `E_TYPE` | Type error in expression | Ensure arithmetic operands are numbers (or both strings for `+`); avoid division/modulo by zero; compare compatible types; ensure spread targets are records |
| `E_ASSERT` | `assert` condition is false (fatal — halts immediately) | Fix the condition or the data producing it |
| `E_CHECK` | `check` condition is false (non-fatal — records evidence, continues) | Fix the condition or upstream data; runner returns exit 5 after execution |

For detailed repair strategies per error code, see `references/diagnostics-guide.md`.

## Debugging Workflow

### Step 1: Run `a0 check`

Start with static validation — catches most errors without executing anything:

```
a0 check file.a0
```

This catches: `E_LEX`, `E_PARSE`, `E_AST`, `E_NO_RETURN`, `E_RETURN_NOT_LAST`, `E_UNKNOWN_CAP`, `E_DUP_BINDING`, `E_UNBOUND`, `E_CALL_EFFECT`, `E_UNDECLARED_CAP`, `E_UNKNOWN_BUDGET`, `E_FN_DUP`.

### Step 2: Read the Diagnostic

Parse the error output:
1. Note the **error code** — look it up in the table above
2. Note the **line:col** — go to exact location
3. Read the **hint** if present — it often gives the fix directly

### Step 3: Apply the Fix

Common fix patterns:

- **Missing return**: Add `return { ... }` at end
- **Wrong tool keyword**: Swap `do` ↔ `call?` based on tool mode
- **Unbound variable**: Ensure the variable is bound with `let x = ...` or `expr -> x` before use
- **Duplicate binding**: Rename one variable (A0 has no reassignment)
- **Capability denied**: Add the capability to the `cap { ... }` block

### Step 3b: Use try/catch for Recoverable Errors

If the error is a runtime failure that should not halt the program (e.g., a missing file, invalid JSON, network error), wrap the failing code in `try/catch` instead of fixing the root cause:

```
let result = try {
  call? fs.read { path: "optional.json" } -> raw
  let data = parse.json { in: raw }
  return { ok: true, data: data }
} catch { e } {
  # e is { code: "E_TOOL", message: "..." } or similar
  return { ok: false, error: e.code }
}
```

The catch binding `{ e }` receives a record with `code` (e.g., `E_TOOL`, `E_FN`, `E_TYPE`) and `message` fields. Use this for graceful degradation when failures are expected and recoverable.

Note: `E_ASSERT` (fatal assertion) is NOT catchable -- it always halts the program. `E_CHECK` is non-fatal and does not throw, so it cannot be caught either.

### Step 4: Use Trace for Runtime Issues

For errors that only appear at runtime, use trace mode:

```
a0 run file.a0 --trace trace.jsonl --unsafe-allow-all
```

The trace JSONL file contains step-by-step execution events. Examine the last events before the error to identify the failing operation.

### Step 5: Use `a0 fmt` to Normalize

After fixing, format for consistency:

```
a0 fmt file.a0 --write
```

## Reading A0 Code

When understanding existing A0 programs:

1. **Start at `cap {}`** — identifies what side effects the program uses
2. **Follow the data flow** — `let` and `->` bindings create the variable chain
3. **Identify tool calls** — `call?` (reads data) vs `do` (has effects)
4. **Check `return`** — the program's output is always the return record
5. **Note assert/check** — `assert` is fatal (halts on failure), `check` is non-fatal (records evidence, continues)

## Capability Policy

A0 uses deny-by-default. Capabilities must be:
1. Declared in the program's `cap { ... }` block
2. Allowed by the host policy

Policy files load in order (first match wins):
1. `.a0policy.json` in the project directory
2. `~/.a0/policy.json` (user-level)
3. Deny-all default

Override for development: `--unsafe-allow-all`

## Common Debugging Scenarios

### "Nothing happens" (exit 3)

Capability denied. Check `cap {}` matches the tools used, then check policy files.

### "Parse error on valid-looking code"

A0 is line-oriented. Check for:
- Multi-line expressions that aren't supported
- Missing commas in records/lists
- Unclosed braces or brackets
- Using a keyword as a variable name

### "Tool returned unexpected data"

Use trace to see the raw tool return value. Common issues:
- `http.get` returns `body` as a string — must `parse.json` before dot access
- `fs.read` returns a string — must `parse.json` if the file is JSON
- `sh.exec` returns `{ exitCode, stdout, stderr }` — check `exitCode`

### "E_TYPE on + operator"

The `+` operator works on numbers and strings, but both operands must be the same type. Common issues:
- `"count: " + 42` -- mixed string + number produces `E_TYPE`. Convert to string first, or use `str.template`.
- `{ ...x, key: 1 }` where `x` is not a record -- spread of non-record produces `E_TYPE`.

### "Unrecoverable error that should be recoverable"

If a tool call or stdlib function throws and you want the program to continue, wrap it in `try/catch`:

```
let result = try {
  call? fs.read { path: "missing.txt" } -> raw
  return { data: raw }
} catch { e } {
  return { data: null, error: e.code }
}
```

The catch binding `e` has `{ code, message }`. Note that `E_ASSERT` cannot be caught -- it always halts.

## Additional Resources

### Reference Files

- **`references/diagnostics-guide.md`** — Detailed repair strategies for every error code with before/after examples
