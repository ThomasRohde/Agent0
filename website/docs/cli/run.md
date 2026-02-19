---
sidebar_position: 2
---

# a0 run

Execute an A0 program and print its result as JSON to stdout.

## Usage

```bash
a0 run <file> [options]
```

The `<file>` argument is the path to an A0 source file. Use `-` to read from stdin.

## Flags

| Flag | Description |
|------|-------------|
| `--trace <path>` | Write execution trace events to a JSONL file |
| `--evidence <path>` | Write evidence records to a JSON file |
| `--pretty` | Human-readable error output instead of JSON |
| `--debug-parse` | Show raw parser-internal diagnostics on parse errors |
| `--unsafe-allow-all` | Bypass all capability restrictions (development only) |

## Exit Codes

| Code | Meaning | Example Causes |
|------|---------|----------------|
| 0 | Success | Program completed normally |
| 2 | Parse or validation error | Syntax error, missing return, unbound variable |
| 3 | Capability denied | Tool used without policy approval |
| 4 | Runtime or tool error | Tool failure, budget exceeded, type error |
| 5 | Assertion or check failed | `assert` (fatal -- halts) or `check` (non-fatal -- continues; exit 5 after run) evaluated to false |

## Examples

### Basic Run

```bash
a0 run examples/hello.a0
```

Given this program:

```a0
let greeting = "Hello, A0!"
let data = { name: "world", version: 1 }
return { greeting: greeting, data: data }
```

Output:

```json
{
  "greeting": "Hello, A0!",
  "data": {
    "name": "world",
    "version": 1
  }
}
```

### Run with Trace

Record every execution event to a JSONL file for later analysis:

```bash
a0 run examples/fetch-transform.a0 --trace trace.jsonl --unsafe-allow-all
```

Each line in `trace.jsonl` is a JSON object representing one trace event (tool calls, statement execution, evidence, etc.). Use [`a0 trace`](./trace.md) to summarize the file.

If the trace file path is invalid (e.g., a nonexistent directory), the command exits with code 4 and an `E_IO` error instead of crashing.

### Run with Pretty Errors

When a program fails, `--pretty` produces human-readable diagnostics instead of raw JSON:

```bash
a0 run broken.a0 --pretty
```

JSON output (default):

```json
[
  {
    "code": "E_UNBOUND",
    "message": "Unbound variable 'x'."
  }
]
```

For non-pretty runtime/CLI failures, stderr emits a single JSON diagnostic object:

```json
{ "code": "E_IO", "message": "Error reading file: ..." }
```

Pretty output:

```
error[E_UNBOUND]: Unbound variable 'x'.
  --> broken.a0:3:12
  hint: Make sure the variable is defined with 'let' before use.
```

If parse diagnostics are too terse, add `--debug-parse` to include raw parser internals:

```bash
a0 run broken.a0 --debug-parse
```

### Bypass Capability Checks

During development, you can skip policy enforcement with `--unsafe-allow-all`. This grants every capability without requiring a policy file:

```bash
a0 run program.a0 --unsafe-allow-all
```

:::warning
Never use `--unsafe-allow-all` in production. It disables all capability security checks. See [Capabilities](../capabilities/overview.md) for the proper way to configure permissions.
:::

### Read from Stdin

Pipe an A0 program via stdin:

```bash
echo 'return { x: 42 }' | a0 run -
```

### Collect Evidence

Write evidence records (from `assert` and `check` statements) to a file:

```bash
a0 run assertions.a0 --evidence evidence.json
```

When `--evidence` is provided, the file is written for execution paths (success or runtime failure). If no `assert`/`check` events occur, the file contains `[]`. Parse/validation failures (exit 2) occur before evidence generation and do not create the file.

## How It Works

The `run` command performs these steps in order:

1. **Read** the source file (or stdin)
2. **Parse** the source into an AST -- exits with code 2 on parse errors
3. **Validate** the AST semantically -- exits with code 2 on validation errors
4. **Load policy** from `.a0policy.json` or `~/.a0/policy.json` (or deny-all default)
5. **Execute** the program with registered tools and stdlib
6. **Print** the return value as JSON to stdout
7. **Exit** with the appropriate code

Errors are printed to stderr; the program result is printed to stdout. This makes it safe to pipe `a0 run` output into other tools.
