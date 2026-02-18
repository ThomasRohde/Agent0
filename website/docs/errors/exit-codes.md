---
sidebar_position: 1
---

# Exit Codes

A0 CLI commands use a fixed set of exit codes to indicate the result of execution. These codes are consistent across commands and can be used in scripts to determine what happened.

## Summary

| Exit Code | Meaning | When It Occurs |
|-----------|---------|----------------|
| **0** | Success | Program completed normally |
| **1** | CLI usage/help error | Unknown command/topic/option, command usage failure |
| **2** | Parse or validation error | Compile-time issues caught by `a0 check` |
| **3** | Capability denied | Program needs a capability not allowed by policy |
| **4** | Runtime, tool, or CLI I/O error | Tool failure, budget exceeded, type error, file/trace/evidence I/O failure |
| **5** | Assertion or check failed | `assert` (fatal -- halts) or `check` (non-fatal -- continues) evaluated to false |

## Exit Code 0: Success

The program parsed, validated, and executed without error. The return value is printed as JSON to stdout.

```bash
a0 run examples/hello.a0
echo $?  # 0
```

For `a0 check`, exit code 0 means the program has no compile-time errors. For `a0 fmt`, it means formatting succeeded.

## Exit Code 1: CLI Usage/Help Error

The CLI command itself failed before program parsing/execution due to invalid usage.

Common cases:

- Unknown command (for example, `a0 nope`)
- Unknown `a0 help` topic
- Unsupported option for a command

These are command-surface errors, not A0 program diagnostics.

## Exit Code 2: Parse or Validation Error

The source file has structural or semantic problems that prevent execution. These are compile-time errors -- they are caught by `a0 check` and do not require running the program.

**Diagnostic codes that produce exit 2:**

| Code | Description |
|------|-------------|
| `E_LEX` | Unrecognized token |
| `E_PARSE` | Syntax error |
| `E_AST` | Malformed AST |
| `E_NO_RETURN` | Missing return statement |
| `E_RETURN_NOT_LAST` | Return is not the last statement |
| `E_UNKNOWN_CAP` | Unknown capability name |
| `E_IMPORT_UNSUPPORTED` | Import declarations are not yet supported |
| `E_CAP_VALUE` | Capability value is not literal `true` |
| `E_UNDECLARED_CAP` | Tool used without cap declaration |
| `E_UNKNOWN_BUDGET` | Unknown budget field name |
| `E_BUDGET_TYPE` | Budget value is not an integer literal |
| `E_DUP_BINDING` | Duplicate variable name |
| `E_UNBOUND` | Reference to undefined variable |
| `E_CALL_EFFECT` | `call?` used with effectful tool |
| `E_FN_DUP` | Duplicate function definition |
| `E_UNKNOWN_FN` | Unknown function name |
| `E_UNKNOWN_TOOL` | Unknown tool name |

**Example:**

```bash
a0 check broken.a0 --pretty
```

```
error[E_UNBOUND]: Unbound variable 'x'.
  --> broken.a0:2:12
  hint: Make sure the variable is defined with 'let' before use.
```

## Exit Code 3: Capability Denied

The program declares a capability that is not allowed by the active [policy file](../capabilities/policy-files.md). This is a runtime error -- the program parsed and validated successfully, but the policy blocked execution.

**Diagnostic code:** `E_CAP_DENIED`

**Example:**

```a0
cap { sh.exec: true }
do sh.exec { cmd: "ls" } -> result
return { result: result }
```

If the policy does not include `sh.exec`:

```bash
a0 run program.a0 --pretty
echo $?  # 3
```

```
error[E_CAP_DENIED]: Capability 'sh.exec' is not allowed by the active policy.
```

**Fix:** Add the capability to your `.a0policy.json`, or use `--unsafe-allow-all` during development.

## Exit Code 4: Runtime, Tool, or CLI I/O Error

An error occurred during program execution, or the CLI failed to perform a required I/O operation (for example, opening a trace/evidence file).

**Diagnostic codes that produce exit 4:**

| Code | Description |
|------|-------------|
| `E_IO` | CLI file/trace/evidence I/O failure |
| `E_TRACE` | Trace file had no valid JSONL events |
| `E_TOOL` | Tool execution failed |
| `E_TOOL_ARGS` | Invalid arguments passed to a tool |
| `E_FN` | Stdlib function threw an error |
| `E_BUDGET` | Budget limit exceeded |
| `E_UNKNOWN_FN` | Function not found at runtime (rare; usually caught at compile time) |
| `E_UNKNOWN_TOOL` | Tool not found at runtime (rare; usually caught at compile time) |
| `E_PATH` | Dot-access on a non-record value |
| `E_FOR_NOT_LIST` | `for` expression received a non-list value |
| `E_MATCH_NOT_RECORD` | `match` expression received a non-record value |
| `E_MATCH_NO_ARM` | `match` expression has no matching arm |
| `E_TYPE` | Type error at runtime |

**Example:**

```a0
let data = "not a list"
for { in: data, as: "item" } {
  return { item: item }
}
return { done: true }
```

```
error[E_FOR_NOT_LIST]: for expression expected a list, got string.
```

## Exit Code 5: Assertion or Check Failed

An `assert` or `check` statement evaluated to false. The two statements differ in how they handle failure:

- **`assert`** is **fatal** -- it halts execution immediately. No further statements run.
- **`check`** is **non-fatal** -- it records the failure as evidence and continues execution. If any check failed, the runner returns exit 5 after the program finishes.

**Diagnostics and conditions that produce exit 5:**

| Code | Description |
|------|-------------|
| `E_ASSERT` | `assert` statement failed -- **fatal**, halts execution immediately |
| *(none)* | One or more `check` statements failed -- **non-fatal**, records evidence and continues; exit 5 after run |

**Example (fatal assert):**

```a0
let value = 0
assert { that: false, msg: "value must be positive" }
# nothing after this line executes
return { value: value }
```

```
error[E_ASSERT]: Assertion failed: value must be positive
```

**Example (non-fatal check):**

```a0
check { that: false, msg: "expected positive value" }
# execution continues -- this return still runs
return { value: 0 }
```

The program completes and returns `{ value: 0 }`, but the runner exits with code 5 because a check failed.

## Using Exit Codes in Scripts

Exit codes make it easy to chain A0 commands in shell scripts:

```bash
# Only run if check passes
a0 check program.a0 && a0 run program.a0 --unsafe-allow-all

# Handle specific exit codes
a0 run program.a0
case $? in
  0) echo "Success" ;;
  2) echo "Fix your syntax" ;;
  3) echo "Update your policy file" ;;
  4) echo "Runtime error -- check tool args and data" ;;
  5) echo "Assertions failed -- check your logic" ;;
esac
```
