# A0 — Agent-Native CLI Language (v0.1)

A0 is a general-purpose programming language and CLI runner designed for agents first, humans second.

It’s built around a simple idea: an agent can only be reliable if the language makes reliability the default.
So A0 is structured, capability-governed, evidence-producing, and designed to run in repeatable execution loops with minimal retries.

If you’re a coding agent reading this: optimize for “valid program on first try” and “minimal reruns”. Don’t be clever. Be checkable.

---

## Philosophy

A0 programs are meant to be:

1. **Structured by default**
   Values are records/lists/tables/artifacts — not ad-hoc strings. Pipelines pass structured data, not text blobs.

2. **Explicit about effects**
   Side effects are not “just function calls”. They are explicit (`do`) and gated by declared capabilities (`cap { ... }`).
   This makes programs auditable and sandbox-friendly.

3. **Evidence-driven**
   Assertions and checks produce structured evidence objects. Evidence is returned, traced, and can be used for governance and repair.

4. **Deterministic-by-default**
   Pure evaluation is cacheable and replayable. When effects are used, they should be isolated, minimized, and optionally cacheable with explicit policy.

5. **Token-efficient in the only way that matters**
   “Token efficient” means fewer failed generations and fewer reruns, not just shorter syntax. A0’s grammar is intentionally small so it can be learned from a short “language card” and generated under constraints.

---

## Status

- **v0.1 implemented**: core language + capability gating + basic stdlib + CLI commands.
- Roadmap below covers **v0.2 → v0.4**, plus what’s needed to become a fully functional, general-purpose scripting/runtime environment.

---

## Quick start

### Run an example
```bash
a0 run examples/spec_fetch.a0
````

### Validate (parse/type/capability checks + lints)

```bash
a0 check examples/spec_fetch.a0
```

### Canonical formatting

```bash
a0 fmt examples/spec_fetch.a0
```

### Trace execution (DAG + evidence)

```bash
a0 trace examples/spec_fetch.a0 --json
```

---

## A0 in 60 seconds

A0 is line-oriented and record-first. Arguments are key/value records to avoid positional ambiguity.

Effects are explicit:

* `call?` = read-only/tool query (still requires capability)
* `do`    = effectful action

Evidence is explicit:

* `assert` and `check` emit evidence objects
* programs should `return { artifacts:[...], evidence:[...] }`

Example:

```text
cap { http.read, fs.write, sh.exec(test) }
budget { time:"120s" }

let spec_txt = call? http.get { url:"https://example.com/spec" }
let spec     = parse.json { in:spec_txt }

assert { eq:get(spec,"version"), to:"1.2", msg:"spec version" } -> ev.version

do fs.write { path:"./spec.json", data:spec } -> art.spec

do sh.exec { kind:"test", cmd:"pytest -q" } -> log.tests
check { tests.pass:log.tests } -> ev.tests

return { artifacts:[art.spec], evidence:[ev.version, ev.tests] }
```

---

## Language overview (v0.1)

### Core types

* primitives: `int`, `float`, `bool`, `str`, `bytes`
* structural: `list[T]`, `rec{...}`, `table` (list of records), `stream` (lazy)
* special: `artifact`, `evidence`, `result[T] = ok(T) | err(rec)`

### Core forms

* bindings: `let`
* control flow: `if`, `match`
* functions: `fn` (v0.1 exists; see roadmap for “fully usable” function system)
* pipelines: `|` over values
* effects: `call?`, `do`
* verification: `assert`, `check`
* exit: `return`, `fail`

### CLI

* `a0 run <file> [--json]`
* `a0 check <file>`
* `a0 fmt <file>`
* `a0 pack <file>` / `a0 unpack <file>` (if enabled in v0.1; expanded in v0.4)
* `a0 trace <file>`

---

## Capability model

A0 programs must declare capabilities upfront:

```text
cap { fs.read, fs.write, http.read, sh.exec(test) }
```

Interpreter rules:

* Any `call?` or `do` requires an allowed capability.
* Capabilities should be granular (e.g., `fs.write` vs `fs.*`).
* The runtime may enforce a policy file (recommended) that further restricts allowed paths/hosts/commands.

Recommended shape for policy (host-side):

* filesystem allowlist (paths + read/write)
* network allowlist (hosts + methods)
* process allowlist (commands + args patterns)
* time/memory limits (budget enforcement)
* optional “deny by default” mode for CI

This is the backbone of running agent-generated code safely.

---

## Evidence and trace

A0 assumes programs will be inspected and repaired. The runtime should emit:

1. **Structured evidence**

   * assertions/checks produce machine-readable objects
   * evidence includes: id, predicate, inputs, result, message, and optional attachments/log refs

2. **Execution trace**

   * node id, op name, normalized args, input hashes, output hashes
   * start/end timestamps
   * tool invocation metadata
   * caching decisions (hit/miss + reason)

A good trace makes repair cheap: “node 5 failed, here’s the exact inputs and logs”.

---

## Project layout (typical)

Your repo may differ, but keep the intent:

* `examples/` — small, canonical programs that demonstrate features
* `docs/` — language card, capability docs, trace schema
* `tests/` — parser + evaluator + capability + golden traces
* `src/` or `crates/` — interpreter implementation
* `stdlib/` — builtins and tool adapters

---

## Recommended tech stack

If you’re evolving this toward production-grade execution, the safest long-term stack is:

1. **Rust interpreter + capability gate (recommended)**

* CLI: `clap`
* Parsing: `pest` (fast to iterate) or `nom` (more control)
* Data model: `serde` + `serde_json`
* Tracing: `tracing` + OpenTelemetry exporter
* Cache: SQLite keyed by (op, normalized args, content hash)
* Optional sandbox: Wasmtime/WASI for running effect plugins safely

2. **TypeScript/Node prototype (fast iteration)**

* CLI: `commander` or `yargs`
* Parser: `chevrotain`
* Trace/evidence: JSONL + optional OTEL
* Later: port stabilized semantics to Rust

If this repo already has an implementation, treat the above as guidance for where to take it next.

---

## Roadmap

### v0.2 — Make runs reproducible and repairs cheap

Primary theme: **canonicalization + caching + better diagnostics**.

Deliverables:

* `a0 fmt` is fully canonical and stable (idempotent)
* Normalized argument encoding (so semantically identical programs cache identically)
* Automatic caching for pure nodes (safe, on by default)
* Trace schema v1 (JSON) with node ids, inputs/outputs, cache hits, logs
* Improved error messages:

  * “expected record key `url`” instead of “parse error”
  * node-local failure reporting: include node id + snippet + suggested fixes

Capability improvements:

* Host-side policy file (deny-by-default optional)
* Path/host/command constraints:

  * `fs.write` restricted to specific directories
  * `http.read` restricted to host allowlist
  * `sh.exec` restricted to command allowlist

Acceptance checks:

* Golden tests: same program + same inputs => same outputs and trace hashes
* Cache tests: modify one node input => only downstream nodes rerun

---

### v0.3 — Make it a real programming language (not just a workflow DSL)

Primary theme: **composition**.

Language features to make A0 “fully usable”:

* Modules:

  * `import "path" as m`
  * `export { ... }`
* Functions (finish the story):

  * explicit params and return values
  * recursion allowed
  * closures/higher-order functions (at least `map/filter/reduce` friendliness)
  * small standard functional helpers
* Iteration:

  * `for` (over list/table/stream)
  * `while` (guarded; budget-aware)
  * comprehensions OR a disciplined `pipe`-first iteration style
* Table ops expanded and consistent:

  * `select`, `filter`, `sort`, `group`, `join`
* Error handling becomes ergonomic:

  * `result[T]` helpers: `is_ok`, `unwrap`, `unwrap_or`, `map_ok`, `map_err`
  * pattern matching on `ok/err` is idiomatic

Tooling:

* `a0 repl` (optional but very helpful)
* richer lints: “effect in loop without evidence”, “unused binding”, “uncached nondeterministic call”

Acceptance checks:

* Standard library examples cover: parse → transform → join → write → verify
* Module import/export tested with stable formatting and caching

---

### v0.4 — Secure extensibility + packed mode

Primary theme: **plugins + sandbox + density (without fragility)**.

Deliverables:

* Tool/plugin system:

  * registry of tools with schemas (args/returns)
  * versioning and capability mapping
  * “tool contracts” used by checker and trace
* Optional WASI execution for effect plugins (sandboxed tools)

  * capabilities map to host grants
  * consistent log and trace capture
* Packed mode:

  * `a0 pack` / `a0 unpack` becomes first-class
  * dictionary/codebook support for compact transport
  * packed form is reversible and validated against the same AST

Acceptance checks:

* A plugin can be added without changing interpreter core
* Sandbox policy prevents unauthorized fs/net/proc access
* Packed programs unpack to identical canonical AST and identical behavior

---

## What’s still needed for “fully functional” A0 (beyond v0.4)

If you want A0 to be a general-purpose agent scripting environment, plan for these additions (some can land earlier):

1. **Standard library breadth**

* YAML (optional), XML (optional)
* robust path/query: jsonpath-lite, record path utilities
* patch/merge primitives optimized for “minimal edits” workflows

2. **Concurrency (carefully)**

* `spawn` / `await` only if traceability remains strong
* deterministic scheduling modes (or explicitly nondeterministic with clear trace markers)

3. **Resource governance**

* budgets for time, memory, network calls, file writes
* per-capability quotas
* “effect in loop” policies

4. **Developer ergonomics**

* stable error codes
* better source mapping in errors/traces
* optional language server later (only after grammar stabilizes)

---

## Contribution guidelines (for coding agents)

* Preserve the philosophy: structured data, explicit effects, evidence, reproducibility.
* Prefer small, checkable changes over sweeping refactors.
* Never add a feature without:

  * formatter support (canonical output)
  * trace impact defined
  * tests (golden files where possible)
* If you add nondeterminism, mark it explicitly in the trace and require opt-in.

---

## License

(TODO: choose a license and fill this section.)

---

## Appendix: “Mindset” checklist (agents)

Before you commit code or generate A0:

* Did you declare only the capabilities you need?
* Are effects isolated and minimized?
* Did you produce evidence for anything that can fail?
* Can the runtime rerun only the failing node?
* Will formatting be stable and diff-friendly?


