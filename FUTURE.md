# Future Directions

This document captures the roadmap and longer-term vision for A0 beyond the current v0.3 release. Nothing here is committed — these are design directions under consideration.

---

## v0.36 — Higher-Order `map` for List Transformation

**Theme:** enable declarative list transformation without explicit `for` loops.

Currently, transforming every element in a list requires a `for` loop with an explicit body. A `map` stdlib function would let programs express element-wise transformations more concisely by referencing a user-defined `fn` by name.

### `map` Stdlib Function

| Function | Purpose | Signature |
|----------|---------|-----------|
| `map` | Transform each element via a named function | `{ in: list, fn: str }` → `list` |

```
fn double { n: n } {
  let result = n * 2
  return { out: result }
}

let nums = [1, 2, 3, 4, 5]
let doubled = map { in: nums, fn: "double" }
return { doubled: doubled }
# → { "doubled": [{ "out": 2 }, { "out": 4 }, { "out": 6 }, { "out": 8 }, { "out": 10 }] }
```

### Design Considerations

- **Evaluator integration required.** `map` must resolve `fn` names against the current `userFns` map at runtime — this is unlike other stdlib functions which are pure and stateless. The implementation may need to live in the evaluator itself (similar to `for`) rather than in `@a0/std`.
- **Alternative: stdlib with fn callback.** Pass the evaluator's `userFns` map into the stdlib function, or introduce a `StdlibFnWithContext` interface that receives the execution context.
- **Return shape.** Each `fn` returns a record (as all A0 functions do). `map` collects these records into a list. If the caller wants a flat list of scalars, they can use a `fn` that returns `{ out: value }` and post-process with `for`.
- **Error propagation.** If the mapped function throws (e.g. `E_FN`), `map` should propagate immediately — no partial results.
- **Trace events.** Each function invocation within `map` should emit `fn_call_start` / `fn_call_end` trace events, consistent with direct `fn` calls.
- **Workaround today.** Users can achieve the same result with `for`:
  ```
  let doubled = for { in: nums, as: "n" } {
    let result = n * 2
    return { out: result }
  }
  ```

### Implementation Scope

- **Evaluator:** add `map` handling in `evalExpr` (or as a context-aware stdlib function)
- **Validator:** add `map` to `KNOWN_STDLIB` (already reserved)
- **Stdlib/tests:** test suite for `map` with various fn references, error cases, empty lists
- **Skills/docs:** update write-a0 and debug-a0 skills with `map` usage and patterns

---

## v0.4 — Native Go Compiler with WASM Sandbox

**Theme:** compile A0 to WASM, execute in a sandbox, all in one step.

### The `a0` Binary

Rewrite the entire A0 toolchain — lexer, parser, validator, evaluator, formatter — in Go as a single native binary. No Node.js dependency. No TypeScript runtime. Just `a0`.

### Compile-and-Run in One Flow

`a0 run program.a0` does everything in a single invocation:

1. **Parse** the `.a0` source into an AST
2. **Validate** capabilities, bindings, and semantics
3. **Compile** the AST to a WASM module
4. **Execute** that WASM module in an embedded WASM runtime (e.g., [Wazero](https://wazero.io/) — pure Go, no CGo)
5. **Return** the JSON result to stdout

No intermediate files. No separate compilation step. The user experience is identical to the current TypeScript CLI, but the program runs inside a WASM sandbox.

### How the Sandbox Works

- The compiled WASM module has **no host access by default** — no filesystem, no network, no memory outside its linear memory
- **Tool calls are the only way out.** When the A0 program calls `do fs.write { ... }`, the WASM module invokes a host-imported function. The Go host checks the capability policy, executes the tool natively, and returns the result into the sandbox
- **Budgets enforced at two levels:** A0's own budget system (`timeMs`, `maxToolCalls`, etc.) plus WASM fuel metering for CPU-bound limits
- **Defense in depth:** even if an A0 program exploits a bug in the compiled output, the WASM sandbox prevents host compromise

### Why Go + WASM

- **Single native binary:** `go build` produces one `a0` executable per platform — no runtime dependencies
- **Wazero:** a mature, pure-Go WASM runtime with no CGo requirement, making cross-compilation trivial
- **WASM as the isolation boundary:** battle-tested sandboxing model used by Cloudflare Workers, Fastly Compute, Envoy, etc.
- **Same language semantics:** A0 programs don't change — same syntax, same behavior, same traces, same exit codes
- **Portable compiled output:** the generated `.wasm` modules can also be executed standalone on any WASI-compatible runtime (Wasmtime, browsers, edge runtimes)

### CLI Parity

The Go binary provides the same four commands:

| Command | Behavior |
|---------|----------|
| `a0 run <file>` | Parse → compile → execute in WASM sandbox → JSON to stdout |
| `a0 check <file>` | Parse → validate (no compilation or execution) |
| `a0 fmt <file>` | Canonical formatter (`--write` to overwrite) |
| `a0 trace <file.jsonl>` | Summarize JSONL trace |

Flags, exit codes, diagnostic codes, and trace event schemas remain identical to the TypeScript version

---

## v0.5 — Plugins, Modules, and Composition

**Theme:** extensibility built on the WASM sandbox.

With v0.4's compile-to-WASM foundation in place, plugins and modules get sandboxing for free.

### External Tools as WASM Components

- Third-party tools ship as `.wasm` modules conforming to a tool manifest (JSON schema)
- The host loads tool WASM components into their own isolated instances — a buggy or malicious tool cannot affect the A0 program or other tools
- Manifest maps `tool -> capabilityId -> schema` so third-party tools integrate with the existing capability system
- Tools declare their mode (`read` / `effect`) and required capabilities
- **Capability attenuation:** a tool's WASM instance only receives the host imports its manifest declares, and only if the host policy allows them
- CLI gains `a0 tools list`, `a0 tools validate <manifest>`, and `a0 tools install <package>`

### Module System

- `import` statements resolve to other `.a0` files (today `import` is a header-only shape)
- Each imported module compiles to its own WASM module and executes in an isolated sandbox — an import cannot access the caller's memory or escalate its permissions
- Module-level `cap` declarations compose: the top-level program's policy must cover all transitive capabilities
- Circular imports are a validation error (`E_CIRCULAR_IMPORT`)
- Inter-module communication happens through structured values (records/lists) passed across WASM boundaries — no shared mutable state

### Packaging

- `a0 pack` / `a0 unpack` for distributable program bundles:
  - Bundles contain pre-compiled `.wasm` modules for instant execution (skip parsing/compilation)
  - Packed form must round-trip to an identical canonical AST
  - Traces still reference source spans meaningfully
  - Includes policy and manifest metadata for reproducible execution
- A standard package format: directory with `a0pkg.json` manifest + source files
- Packages can provide tools (as WASM components), stdlib extensions, or reusable A0 modules

---

## Ideas Under Exploration

### Type Annotations (Optional, Gradual)

- Optional type hints on `let` bindings and `fn` parameters: `let count: number = 0`
- Validated at `a0 check` time — no runtime cost
- Record shape types: `type Config = { url: string, retries: number }`
- Gradual: untyped code remains valid, types are purely additive

### Concurrency Primitives

- `par { ... }` block to run independent tool calls concurrently
- Results collected as a record — ordering is explicit, not implicit
- Budget enforcement applies to the aggregate, not per-branch
- No shared mutable state: each parallel branch gets a snapshot of the current environment

### Agent Protocol Integration

- Native support for the [Agent Protocol](https://agentprotocol.ai/) standard
- A0 programs can expose themselves as agents that other systems can invoke
- `a0 serve <file>` starts an Agent Protocol-compatible HTTP endpoint
- Request/response mapping: Agent Protocol tasks map to A0 program executions

### Interactive / REPL Mode

- `a0 repl` for exploratory development
- Statement-at-a-time execution with live environment inspection
- History, tab completion, and inline trace display
- Useful for debugging capability policies and tool configurations

### Structured Diffing for Traces

- `a0 trace diff <a.jsonl> <b.jsonl>` to compare two runs
- Highlights divergence points: which statement produced different results
- Useful for regression detection in agent-generated automation

### Policy Inheritance and Composition

- Policy files that extend other policies: `{ "extends": "../base-policy.json" }`
- Per-directory policy scoping for monorepo use cases
- Policy arithmetic: union, intersection, and deny-override combinators
- Audit log: which policy file granted each capability at runtime

### LSP / Editor Integration

- Language Server Protocol implementation for A0
- Syntax highlighting, diagnostics, go-to-definition, and completion
- Formatter-on-save integration
- Inline trace visualization in the editor gutter

---

## Design Principles for Future Work

These principles guide all future additions:

1. **Structured over stringly-typed.** New features should produce and consume records, not strings.
2. **Explicit effects.** Any feature that touches the outside world must be visible in the capability declaration and trace output.
3. **Deny by default.** New capabilities start denied. Agents must request them, hosts must grant them.
4. **Repair-loop friendly.** Error codes are stable. Formatting is canonical. Traces are machine-readable. Every change must preserve these properties.
5. **Inspectable, not clever.** An agent (or human) reading a trace should understand exactly what happened and why.
