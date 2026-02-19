---
sidebar_position: 3
---

# a0 check

Parse and validate an A0 program without executing it. This command catches compile-time errors before you run the program.

## Usage

```bash
a0 check <file> [options]
```

## Flags

| Flag | Description |
|------|-------------|
| `--pretty` | Human-readable error output |
| `--stable-json` | Stable machine-readable success payload (`{"ok":true,"errors":[]}`) |
| `--debug-parse` | Show raw parser-internal diagnostics on parse errors |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Program is valid |
| 2 | Parse or validation errors found |
| 4 | CLI I/O error (for example, source file cannot be read) |

## What It Catches

`a0 check` performs two phases of analysis: parsing and semantic validation. It catches all compile-time errors without executing the program -- no tool calls are made, no side effects occur.

### Parse Errors

| Code | Description |
|------|-------------|
| `E_LEX` | Unrecognized token or character |
| `E_PARSE` | Syntax does not match grammar rules |
| `E_AST` | Malformed AST structure |

### Validation Errors

| Code | Description |
|------|-------------|
| `E_NO_RETURN` | Program or function body missing `return` |
| `E_RETURN_NOT_LAST` | `return` is not the last statement |
| `E_UNKNOWN_CAP` | Unknown capability in `cap { ... }` declaration |
| `E_IMPORT_UNSUPPORTED` | `import ... as ...` is reserved and not yet supported |
| `E_CAP_VALUE` | Capability value is not literal `true` |
| `E_UNDECLARED_CAP` | Tool used without declaring its capability |
| `E_DUP_BUDGET` | Multiple `budget { ... }` headers in one program |
| `E_UNKNOWN_BUDGET` | Unknown field in `budget { ... }` declaration |
| `E_BUDGET_TYPE` | Budget field value is not an integer literal |
| `E_DUP_BINDING` | Variable name already used in scope |
| `E_UNBOUND` | Variable referenced but never defined |
| `E_CALL_EFFECT` | `call?` used with an effectful tool (use `do` instead) |
| `E_FN_DUP` | Duplicate function definition |
| `E_UNKNOWN_FN` | Unknown function name (including `map` callback when provided as a string literal) |
| `E_UNKNOWN_TOOL` | Unknown tool name in `call?` or `do` |

### What It Does NOT Catch

These errors only occur at runtime and will not be detected by `a0 check`:

- `E_CAP_DENIED` -- capability denied by policy (exit 3)
- `E_TOOL_ARGS` -- invalid arguments passed to a tool (exit 4)
- `E_TOOL` -- tool execution failure (exit 4)
- `E_RUNTIME` -- unexpected runtime failure (exit 4)
- `E_FN` -- stdlib function error (exit 4)
- `E_BUDGET` -- budget limit exceeded (exit 4)
- `E_ASSERT` -- fatal assertion failure, halts immediately (exit 5)
- `check` failures -- non-fatal evidence failures that continue execution; exit 5 after run (no dedicated diagnostic code)

## Examples

### Valid Program

```bash
a0 check examples/hello.a0
```

JSON output (default):

```
[]
```

Stable JSON output (`--stable-json`):

```json
{"ok":true,"errors":[]}
```

Pretty output (`--pretty`):

```
No errors found.
```

### Missing Return

Given `no-return.a0`:

```a0
let x = 42
```

```bash
a0 check no-return.a0 --pretty
```

```
error[E_NO_RETURN]: Program must end with a return statement.
  --> no-return.a0:1:1
  hint: Add a 'return { ... }' statement at the end of your program.
```

### Undeclared Capability

Given `missing-cap.a0`:

```a0
call? http.get { url: "https://example.com" } -> response
return { response: response }
```

```bash
a0 check missing-cap.a0 --pretty
```

```
error[E_UNDECLARED_CAP]: Tool 'http.get' is used but its capability is not declared in a 'cap { ... }' header.
  --> missing-cap.a0:1:7
  hint: Add 'http.get: true' to your cap { ... } declaration.
```

### Using call? with an Effectful Tool

Given `wrong-mode.a0`:

```a0
cap { fs.write: true }
call? fs.write { path: "out.txt", data: "hello" } -> result
return { result: result }
```

```bash
a0 check wrong-mode.a0 --pretty
```

```
error[E_CALL_EFFECT]: Cannot use 'call?' with effectful tool 'fs.write'. Use 'do' instead.
  --> wrong-mode.a0:2:1
  hint: Replace 'call? fs.write' with 'do fs.write'.
```

### Raw Parser Internals (Debug)

Use `--debug-parse` when you need Chevrotain parser internals while diagnosing syntax issues:

```bash
a0 check broken.a0 --debug-parse
```

## Recommended Workflow

Run `a0 check` before every `a0 run` to catch errors early:

```bash
a0 check program.a0 && a0 run program.a0 --unsafe-allow-all
```

For a complete debugging workflow, see the [Debugging Guide](../errors/debugging-guide.md).
