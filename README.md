<p align="center">
  <h1 align="center">A0</h1>
  <p align="center">A scripting language designed for autonomous agents</p>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#language-overview">Language</a> &middot;
  <a href="#examples">Examples</a> &middot;
  <a href="#built-in-tools">Tools</a> &middot;
  <a href="#capabilities-and-policy">Capabilities</a> &middot;
</p>

---

A0 is a small, structured scripting language with a CLI interpreter built for code-generating agents. It trades expressiveness for reliability: structured values instead of string pipelines, explicit side effects, deny-by-default capability gating, and machine-readable traces that make failures cheap to diagnose.

**Why another language?** LLM agents that generate shell scripts or Python hit a wall: implicit side effects, no capability boundaries, and opaque failures that require expensive re-generation. A0 is designed so that an agent's first attempt is more likely to be correct — and when it isn't, the trace output tells you exactly where and why.

## Quickstart

**Requirements:** Node.js >= 18

```bash
git clone https://github.com/ThomasRohde/Agent0.git
cd Agent0
npm install
npm run build
```

Run a program:

```bash
npx a0 run examples/hello.a0
```

Or install the CLI globally:

```bash
npm install -g ./packages/cli
a0 run examples/hello.a0
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `a0 run <file>` | Execute a program, print JSON result to stdout |
| `a0 check <file>` | Parse and validate without executing |
| `a0 fmt <file>` | Canonical formatter (`--write` to overwrite) |
| `a0 trace <file.jsonl>` | Summarize a JSONL trace file |
| `a0 help [topic]` | Built-in language/runtime help topics |

Flags: `--trace <file.jsonl>` on `run` to emit execution traces. `--pretty` for human-readable error output. `--unsafe-allow-all` to bypass capability checks during development.

## Language Overview

A0 is line-oriented and record-first. Programs are sequences of statements ending with a `return` that produces a record.

### Data Types

```text
null
true
42
3.14
"hello"
{ name: "world", version: 1 }
[1, 2, 3]
```

### Bindings and Access

```text
let name = "A0"
let config = { host: "localhost", port: 8080 }
let host = config.host
```

### Tool Calls

Tools are external functions with declared side-effect modes. `call?` is for read-only tools; `do` is for effectful tools.

```text
call? http.get { url: "https://api.example.com/data" } -> response
do fs.write { path: "out.json", data: response.body, format: "json" } -> result
```

### Evidence

`assert` and `check` both take `{ that: bool, msg: str }` and produce evidence records in the trace. `assert` is **fatal** — it halts execution immediately on failure (exit 5). `check` is **non-fatal** — it records evidence and continues execution; the runner returns exit 5 after the program finishes if any check failed.

```text
assert { that: response.status, msg: "got response" } -> evStatus
check { that: result.ok, msg: "file written" } -> evWrite
```

### Control Flow

```text
# Conditional (lazy — only the taken branch evaluates)
if { cond: eq { a: x, b: 0 }, then: "zero", else: "nonzero" }

# Iteration (produces a list of results)
for { in: items, as: "item" } {
  let upper = get { in: item, path: "name" }
  return { name: upper }
}

# Pattern matching on ok/err records
match result {
  ok { val } { return { success: val } }
  err { e } { return { failure: e } }
}
```

### User-Defined Functions

```text
fn greet { name } {
  let msg = "hello"
  return { greeting: msg, to: name }
}

let result = greet { name: "world" }
```

### Stdlib (Pure Functions)

| Category | Functions |
|----------|-----------|
| Data | `parse.json`, `get`, `put`, `patch` |
| Predicates | `eq`, `contains`, `not`, `and`, `or` |
| Lists | `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `map` |
| Strings | `str.concat`, `str.split`, `str.starts`, `str.replace` |
| Records | `keys`, `values`, `merge` |

## Examples

**Minimal program:**

```text
let greeting = "Hello, A0!"
let data = { name: "world", version: 1 }
return { greeting: greeting, data: data }
```

**Fetch, transform, and write:**

```text
cap { http.get: true, fs.write: true }

call? http.get { url: "https://jsonplaceholder.typicode.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
let output = { fetched_title: title, status: response.status }
do fs.write { path: "output.json", data: output, format: "json" } -> artifact

return { artifact: artifact, output: output }
```

**Functions with tool calls:**

```text
cap { sh.exec: true }
budget { timeMs: 10000, maxToolCalls: 2 }

fn check_cmd { cmd } {
  do sh.exec { cmd: cmd, timeoutMs: 5000 } -> result
  let ok = eq { a: result.exitCode, b: 0 }
  return { cmd: cmd, ok: ok, stdout: result.stdout }
}

let node_check = check_cmd { cmd: "node --version" }
let npm_check = check_cmd { cmd: "npm --version" }

return { node: node_check, npm: npm_check }
```

More examples in the [`examples/`](examples/) directory.

## Built-in Tools

| Tool | Mode | Capability | Description |
|------|------|------------|-------------|
| `fs.read` | read | `fs.read` | Read a file's contents |
| `fs.write` | effect | `fs.write` | Write data to a file |
| `http.get` | read | `http.get` | HTTP GET request |
| `sh.exec` | effect | `sh.exec` | Execute a shell command |

Tool arguments are always records (never positional) and validated against Zod schemas at runtime.

## Capabilities and Policy

A0 is **deny-by-default**. Every tool call requires a capability grant from the host policy.

Programs declare what they need:

```text
cap { http.get: true, fs.write: true }
```

Capability values must be literal `true`.

The host decides what to allow via policy files:

```json
{
  "version": 1,
  "allow": ["http.get", "fs.write"]
}
```

**Policy resolution order:**
1. `./.a0policy.json` (project-local)
2. `~/.a0/policy.json` (user-level)
3. Deny all (default)

Enforcement happens at two points: `a0 check` validates that declared capabilities cover all tools used, and the runtime verifies each tool call against the active policy.

## Budgets

Resource limits enforced at runtime:

```text
budget { timeMs: 30000, maxToolCalls: 10, maxBytesWritten: 1048576, maxIterations: 100 }
```

| Field | Enforced at |
|-------|-------------|
| `timeMs` | Wall-clock timeout for the entire run |
| `maxToolCalls` | Total tool invocations |
| `maxBytesWritten` | Cumulative bytes written via `fs.write` |
| `maxIterations` | Cumulative iterations across all `for` loops and `map` calls |

## Traces

Every `a0 run --trace <file.jsonl>` produces a structured event log:

```bash
a0 run program.a0 --trace run.jsonl
a0 trace run.jsonl   # summarize: events, tools used, failures, duration
```

Trace events: `run_start`, `run_end`, `stmt_start`, `stmt_end`, `tool_start`, `tool_end`, `evidence`, `budget_exceeded`, `for_start`, `for_end`, `fn_call_start`, `fn_call_end`, `match_start`, `match_end`, `map_start`, `map_end`.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | CLI usage/help error (unknown command/topic/option) |
| 2 | Parse or validation error |
| 3 | Capability denied |
| 4 | Runtime, tool, or CLI I/O error |
| 5 | Assertion or check failed (`assert` = fatal/halts, `check` = non-fatal/continues) |

## Project Structure

npm workspaces monorepo:

```
packages/
  core/    — Lexer, parser, AST, validator, evaluator, formatter, capabilities
  std/     — Pure stdlib functions (parse.json, get/put, patch, predicates)
  tools/   — Built-in tools (fs, http, sh) with Zod schema validation
  cli/     — The a0 CLI (run, check, fmt, trace)
examples/  — Sample A0 programs
```

## Contributing

A0 is designed for agents, but contributions from humans are welcome too.

**Rules:**
- Every language feature must include: formatter support, trace impact, and tests (golden where possible)
- Preserve the core invariants: structured data, explicit effects, capability gating, evidence/trace
- Prefer small PRs with one logical change at a time
- Nondeterminism must be opt-in and visible in trace output

## License

MIT
