---
sidebar_position: 1
---

# Exit Codes

A0 CLI commands use a fixed set of exit codes to indicate the result of execution. These codes are consistent across all commands and can be used in scripts to determine what happened.

## Summary

| Exit Code | Meaning | When It Occurs |
|-----------|---------|----------------|
| **0** | Success | Program completed normally |
| **2** | Parse or validation error | Compile-time issues caught by `a0 check` |
| **3** | Capability denied | Program needs a capability not allowed by policy |
| **4** | Runtime or tool error | Tool failure, budget exceeded, type error, etc. |
| **5** | Assertion or check failed | `assert` or `check` evaluated to false |

## Exit Code 0: Success

The program parsed, validated, and executed without error. The return value is printed as JSON to stdout.

```bash
a0 run examples/hello.a0
echo $?  # 0
```

For `a0 check`, exit code 0 means the program has no compile-time errors. For `a0 fmt`, it means formatting succeeded.

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
| `E_UNDECLARED_CAP` | Tool used without cap declaration |
| `E_UNKNOWN_BUDGET` | Unknown budget field name |
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

## Exit Code 4: Runtime or Tool Error

An error occurred during program execution. The program was syntactically and semantically valid, but something failed at runtime.

**Diagnostic codes that produce exit 4:**

| Code | Description |
|------|-------------|
| `E_TOOL` | Tool execution failed |
| `E_TOOL_ARGS` | Invalid arguments passed to a tool |
| `E_FN` | Stdlib function threw an error |
| `E_BUDGET` | Budget limit exceeded |
| `E_UNKNOWN_FN` | Function not found at runtime |
| `E_UNKNOWN_TOOL` | Tool not found at runtime |
| `E_PATH` | Path operation error (invalid path in `get`/`put`) |
| `E_FOR_NOT_LIST` | `for` expression received a non-list value |
| `E_MATCH_NOT_RECORD` | `match` expression received a non-record value |
| `E_MATCH_NO_ARM` | `match` expression has no matching arm |
| `E_TYPE` | Type error at runtime |

**Example:**

```a0
let data = "not a list"
for item in data {
  return { item: item }
}
return { done: true }
```

```
error[E_FOR_NOT_LIST]: for expression expected a list, got string.
```

## Exit Code 5: Assertion or Check Failed

An `assert` or `check` statement evaluated to false. The program ran but its self-checks did not pass.

**Diagnostic codes that produce exit 5:**

| Code | Description |
|------|-------------|
| `E_ASSERT` | `assert` statement failed (halts execution) |
| `E_CHECK` | `check` statement failed (records evidence, may halt) |

**Example:**

```a0
let value = 0
assert { that: false, msg: "value must be positive" }
return { value: value }
```

```
error[E_ASSERT]: Assertion failed: value must be positive
```

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
