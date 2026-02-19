---
sidebar_position: 3
---

# Debugging Guide

This guide walks through a systematic approach to finding and fixing errors in A0 programs.

## Step 1: Run `a0 check`

Always start by validating the program statically. This catches all compile-time errors without executing anything:

```bash
a0 check program.a0 --pretty
```

If `a0 check` reports errors, fix them before trying to run the program. Compile-time errors are the easiest to fix because the diagnostic tells you exactly what is wrong and where.

```
error[E_UNBOUND]: Unbound variable 'reponse'.
  --> program.a0:5:18
  hint: Make sure the variable is defined with 'let' before use.
```

This tells you:
- **Error code**: `E_UNBOUND` -- a variable was referenced but never defined
- **Location**: `program.a0` line 5, column 18
- **Hint**: how to fix it (in this case, probably a typo -- `reponse` should be `response`)

## Step 2: Read the Diagnostic

Every A0 error follows the same structure:

```
error[CODE]: Message describing what went wrong.
  --> file:line:col
  hint: Suggested fix.
```

The error code tells you the category. See [Diagnostic Codes](./diagnostic-codes.md) for a full reference.

**Key patterns:**
- `E_LEX` or `E_PARSE` -- syntax issue, check token-level structure
- `E_NO_RETURN` or `E_RETURN_NOT_LAST` -- return statement placement
- `E_UNBOUND` or `E_DUP_BINDING` -- variable naming issue
- `E_UNDECLARED_CAP` or `E_CALL_EFFECT` -- capability/tool usage issue
- `E_UNKNOWN_*` -- typo in a name (capability, tool, function, budget field)

## Step 3: Apply Common Fixes

### Missing Return

```
error[E_NO_RETURN]: Program must end with a return statement.
```

**Fix:** Add a `return` statement at the end of the program or function body.

```a0
let data = { status: "ok" }
# Add this:
return { data: data }
```

### Unbound Variable

```
error[E_UNBOUND]: Unbound variable 'reponse'.
```

**Fix:** Check for typos. If the variable should exist, make sure it is defined with `let` or as a tool output target (`-> name`) before use.

### Undeclared Capability

```
error[E_UNDECLARED_CAP]: Tool 'http.get' is used but its capability is not declared.
```

**Fix:** Add a `cap` header at the top of the program:

```a0
cap { http.get: true }
```

### call? with Effectful Tool

```
error[E_CALL_EFFECT]: Cannot use 'call?' with effectful tool 'fs.write'. Use 'do' instead.
```

**Fix:** Change `call?` to `do`:

```a0
# Before:
call? fs.write { path: "out.txt", data: "hello" } -> result

# After:
do fs.write { path: "out.txt", data: "hello" } -> result
```

### Duplicate Binding

```
error[E_DUP_BINDING]: Duplicate binding 'data'.
```

**Fix:** Use a different variable name for the second binding:

```a0
let data = { a: 1 }
let data2 = { b: 2 }
return { data: data, data2: data2 }
```

## Step 4: Use Trace for Runtime Issues

If `a0 check` passes but `a0 run` fails, the problem is a runtime error. Use `--trace` to capture a detailed execution log:

```bash
a0 run program.a0 --trace debug.jsonl --unsafe-allow-all --pretty
```

Then summarize the trace:

```bash
a0 trace debug.jsonl
```

The trace summary shows:
- How many tool calls were made and which tools were used
- Whether any tool calls failed
- Whether any budget limits were exceeded
- The total execution time

For deeper inspection, examine the trace file directly. Each line is a JSON event:

```bash
cat debug.jsonl
```

Look for `tool_end` events with `"outcome": "err"` to find tool failures, or `budget_exceeded` events if limits were hit.

## Step 5: Normalize with `a0 fmt`

Formatting can help you spot structural issues that are hard to see in messy code:

```bash
a0 fmt program.a0 --write
```

This normalizes indentation and spacing so you can see the program structure clearly.

## Common Scenarios

### "Nothing happens" (Capability Denied)

**Symptom:** Program exits with code 3 and no output (or a JSON error on stderr).

**Cause:** The program uses a tool but the active policy does not allow its capability.

**Fix:**

1. Check what capabilities the program declares:
   ```a0
   cap { http.get: true, fs.write: true }
   ```

2. Check your policy file:
   ```bash
   cat .a0policy.json
   ```

3. Add the missing capabilities to the policy, or use `--unsafe-allow-all` for development:
   ```bash
   a0 run program.a0 --unsafe-allow-all
   ```

### Parse Errors on Valid-Looking Code

**Symptom:** `a0 check` reports `E_PARSE` but the code looks correct.

**Common causes:**
- Missing `{ ... }` around tool arguments
- Using `=` instead of `:` in record fields
- Placing `return` inside an expression instead of at statement level
- Malformed optional `-> target` binding after `call?` or `do`

**Fix:** Compare your syntax against a working example. The canonical form is:

```a0
call? tool.name { key: value, key2: value2 }
call? tool.name { key: value, key2: value2 } -> target
```

### Tool Argument Errors

**Symptom:** `E_TOOL_ARGS` at runtime.

**Cause:** The tool received arguments that do not match its schema.

**Fix:** Check the tool's expected arguments:

| Tool | Required Arguments |
|------|--------------------|
| `fs.read` | `path` (string) |
| `fs.write` | `path` (string), `data` (any) |
| `http.get` | `url` (string) |
| `sh.exec` | `cmd` (string) |

### Budget Exceeded

**Symptom:** `E_BUDGET` at runtime.

**Cause:** The program hit a limit set in its `budget { ... }` header.

**Fix:** Either increase the budget limit or optimize the program:

```a0
budget { maxToolCalls: 10, maxIterations: 100 }
```

Use `--trace` to see exactly where the budget was exhausted.

### Stdlib Function Errors

**Symptom:** `E_FN` at runtime.

**Cause:** A stdlib function received invalid input (e.g., invalid JSON string for `parse.json`, non-existent path for `get`).

**Fix:** Validate inputs before calling stdlib functions:

```a0
cap { http.get: true }
# Ensure the string is valid JSON before parsing
call? http.get { url: "https://api.example.com/data" } -> response
let body = parse.json { in: response.body }
return { body: body }
```

## Debugging Checklist

1. Run `a0 check program.a0 --pretty` -- fix all compile-time errors
2. Run `a0 fmt program.a0 --write` -- normalize formatting for clarity
3. Run `a0 run program.a0 --pretty --unsafe-allow-all` -- test without policy restrictions
4. If runtime errors occur, add `--trace debug.jsonl` and inspect with `a0 trace debug.jsonl`
5. Once working, set up a proper [policy file](../capabilities/policy-files.md) and remove `--unsafe-allow-all`
