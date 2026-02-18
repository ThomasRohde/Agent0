---
sidebar_position: 5
---

# sh.exec

Execute a shell command.

- **Mode:** effect (`do`)
- **Capability:** `sh.exec`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `cmd` | `str` | Yes | The shell command to execute |
| `cwd` | `str` | No | Working directory. Default: current process working directory. |
| `env` | `rec` | No | Additional environment variables as string key-value pairs. Merged with the current process environment. |
| `timeoutMs` | `int` | No | Command timeout in milliseconds. Default: 30000 (30 seconds). |

## Returns

A record with the command result:

| Field | Type | Description |
|-------|------|-------------|
| `exitCode` | `int` | Process exit code (0 = success) |
| `stdout` | `str` | Standard output |
| `stderr` | `str` | Standard error |
| `durationMs` | `int` | Wall-clock execution time in milliseconds |

The tool does **not** throw on non-zero exit codes. Instead, check `exitCode` in your program logic.

## Example

Run a command and check the result:

```a0
cap { sh.exec: true }

do sh.exec { cmd: "echo hello world" } -> result
let ok = eq { a: result.exitCode, b: 0 }
assert { that: ok, msg: "command succeeded" }

return { stdout: result.stdout }
```

Run with a custom working directory and timeout:

```a0
cap { sh.exec: true }

do sh.exec {
  cmd: "ls -la",
  cwd: "/tmp",
  timeoutMs: 5000
} -> result

return { result: result }
```

Run with custom environment variables:

```a0
cap { sh.exec: true }

do sh.exec {
  cmd: "printenv MY_VAR",
  env: { MY_VAR: "hello" }
} -> result

return { stdout: result.stdout }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments (e.g. no `cmd`).
- **`E_TOOL`** (exit 4) -- Command execution failed (e.g. timeout exceeded, command not found).
- **`E_CAP_DENIED`** (exit 3) -- The `sh.exec` capability was not declared.
- **`E_CALL_EFFECT`** (exit 2) -- Used `call?` instead of `do`.

## See Also

- [Tools Overview](./overview.md) -- All built-in tools
- [Budgets](../capabilities/budgets.md) -- Budget constraints for tool calls
