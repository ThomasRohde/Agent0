---
sidebar_position: 1
---

# Capabilities Overview

A0 uses a **deny-by-default** capability system. Every tool call requires an explicit capability grant. Programs that attempt to call tools without proper authorization are rejected -- either at compile time or at runtime.

## How It Works

The capability system has two enforcement points:

1. **Compile-time** (`a0 check`) -- verifies that every tool used in the program has a corresponding `cap` declaration in the program header
2. **Runtime** (`a0 run`) -- verifies that declared capabilities are allowed by the active policy file

This two-layer approach ensures that programs are self-documenting (they declare what they need) and that execution is controlled by external policy.

## Declaring Capabilities

Programs declare their required capabilities in a `cap` header at the top of the file:

```a0
cap { http.get: true, fs.read: true }

call? http.get { url: "https://api.example.com/data" } -> response
let body = parse.json { in: response.body }
return { data: body }
```

The `cap` block lists each capability the program needs. The validator checks that every `call?` and `do` statement in the program uses a tool whose capability is declared.
Capability values must be literal `true`.

## Available Capabilities

A0 has four capabilities, each corresponding to a built-in tool:

| Capability | Tool | Mode | Description |
|-----------|------|------|-------------|
| `fs.read` | `fs.read` | read | Read files from the filesystem |
| `fs.write` | `fs.write` | effect | Write files to the filesystem |
| `http.get` | `http.get` | read | Make HTTP GET requests |
| `sh.exec` | `sh.exec` | effect | Execute shell commands |

### Read vs Effect Mode

Tools are classified as either **read** (no side effects) or **effect** (produces side effects):

- **Read tools** (`fs.read`, `http.get`) -- use `call?` to invoke them
- **Effect tools** (`fs.write`, `sh.exec`) -- use `do` to invoke them

Using `call?` with an effect tool is a compile-time error (`E_CALL_EFFECT`):

```a0
cap { fs.write: true }

# Wrong: compile-time error
call? fs.write { path: "out.txt", data: "hello" } -> result
return { result: result }
```

Correct usage:

```a0
cap { fs.write: true }

do fs.write { path: "out.txt", data: "hello" } -> result

return { result: result }
```

## Enforcement Details

### Compile-Time Checks

The validator (`a0 check`) catches these capability errors:

| Error | Description |
|-------|-------------|
| `E_UNKNOWN_CAP` | Capability name in `cap { ... }` is not recognized |
| `E_CAP_VALUE` | Capability value is not literal `true` |
| `E_UNDECLARED_CAP` | Tool is used but its capability is not declared |
| `E_CALL_EFFECT` | `call?` used with an effectful tool |
| `E_UNKNOWN_TOOL` | Tool name in `call?` or `do` is not recognized |

### Runtime Checks

At execution time, the evaluator checks declared capabilities against the active [policy file](./policy-files.md):

| Error | Description |
|-------|-------------|
| `E_CAP_DENIED` | Capability is declared but not allowed by policy |

## Example: Full Capability Flow

1. Write a program that declares what it needs:

```a0
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/todos/1" } -> response
let body = parse.json { in: response.body }
do fs.write { path: "todo.json", data: body, format: "json" } -> artifact
return { artifact: artifact }
```

2. Validate at compile time:

```bash
a0 check program.a0
```

3. Set up a policy file to allow those capabilities:

```bash
echo '{"version": 1, "allow": ["http.get", "fs.write"]}' > .a0policy.json
```

4. Run the program:

```bash
a0 run program.a0
```

If the policy does not include a required capability, the program fails at runtime with `E_CAP_DENIED` (exit code 3).

## Development Override

For development and testing, `--unsafe-allow-all` bypasses all capability checks:

```bash
a0 run program.a0 --unsafe-allow-all
```

This grants every known capability without requiring a policy file. See [Policy Files](./policy-files.md) for production configuration.

:::warning
Never use `--unsafe-allow-all` in production or automated pipelines. It completely disables the security model.
:::
