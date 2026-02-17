# Agent0 / A0 — Agent-Optimized CLI Language (v0.3)

A0 is a small, structured, general-purpose scripting language with a CLI runner designed to be generated and repaired reliably by autonomous agents. It favors structured values over strings, explicit effects, capability gating, and machine-readable traces/evidence.

If you’re a coding agent reading this repo: optimize for “valid program on first try” and “minimal reruns”. Prefer small, checkable edits. Don’t be clever—be inspectable.

## Philosophy (the mindset)

A0 is trying to make agent-written automation safer and more repeatable by default:

- Structured by default: records and lists, not ad-hoc text pipelines.
- Explicit effects: read-only vs effectful actions are spelled differently (`call?` vs `do`).
- Capability governed: execution is deny-by-default unless a host policy allows the requested capabilities.
- Repair-loop friendly: stable formatting, stable error codes, and run artifacts (trace/evidence) that make failures cheap to diagnose.

Token efficiency (in A0 terms) is fewer failed generations and fewer reruns—not “shortest possible syntax”.

## What's implemented (this repo)

Language surface:
- Literals: `null`, `bool`, `number`, `string`
- Data: records `{ k: v }`, lists `[a, b, c]`
- Bindings: `let name = expr`
- Access: `ident.path` (record field access)
- Tool calls:
  - `call? tool.name { ... }` (read-only tools)
  - `do tool.name { ... }` (effectful tools)
- Evidence:
  - `assert { that: ..., msg: "...", details: {...}? } -> ev`
  - `check  { that: ..., msg: "...", details: {...}? } -> ev`
  - `that` is coerced to boolean (so non-empty strings become "true", etc.)
- Stdlib function calls (pure):
  - Data: `parse.json`, `get`, `put`, `patch`
  - Predicates (v0.2): `eq`, `contains`, `not`, `and`, `or`
- Capabilities: `cap { ... }` — declare required capabilities; validated against used tools at check time
- Budgets (v0.2): `budget { timeMs, maxToolCalls, maxBytesWritten, maxIterations }` — resource limits enforced at runtime
- Control flow (v0.3):
  - `if { cond: expr, then: expr, else: expr }` — conditional expression (lazy, only taken branch evaluates)
  - `for { in: list, as: "binding" } { body }` — list iteration, produces list of results, budget-aware via `maxIterations`
  - `fn name { params } { body }` — user-defined functions, define-before-use, direct recursion allowed
  - `match subject { ok { val } { body } err { e } { body } }` — ok/err discrimination on records
- Program must end with `return { ... }` (record return is required).

Runtime / CLI:
- `a0 run <file|->` executes and prints JSON to stdout
- `a0 check <file>` parses + validates (no execution)
- `a0 fmt <file>` canonical-ish formatter (prints; `--write` overwrites)
- `a0 trace <trace.jsonl>` summarizes a JSONL trace
- Capability policy loader:
  - `./.a0policy.json` (project) overrides `~/.a0/policy.json` (user)
  - default policy is deny-all

Built-in tools shipped in `@a0/tools`:
- `fs.read` (read)
- `fs.write` (effect)
- `http.get` (read)
- `sh.exec` (effect)

## Quickstart (from source)

Requirements: Node.js >= 18

Clone and build:

```bash
git clone https://github.com/ThomasRohde/Agent0.git
cd Agent0
npm install
npm run build
````

Run the minimal example:

```bash
node packages/cli/dist/main.js run examples/hello.a0
```

Validate:

```bash
node packages/cli/dist/main.js check examples/hello.a0
```

Format:

```bash
node packages/cli/dist/main.js fmt examples/hello.a0
```

Install the CLI globally (optional, for local dev):

```bash
# after build
npm install -g ./packages/cli
a0 run examples/hello.a0
```

## Capabilities and policy (how “safe-by-default” works)

A0 enforces capabilities in two places:

1. At start of execution: if you declared `cap { ... }`, those requested capabilities must be allowed by the host policy.
2. At tool invocation time: the tool’s `capabilityId` must be allowed (even if you forgot to declare `cap { ... }`).

Policy file precedence:

* `./.a0policy.json`
* `~/.a0/policy.json`
* default: deny all

Minimal policy example (project-local):

```json
{
  "version": 1,
  "allow": ["http.get", "fs.write"]
}
```

Minimal script using those capabilities:

```text
cap { http.get: true, fs.write: true }

let resp = call? http.get { url: "https://example.com" }

# evidence is intentionally simple in v0.1 (no operators yet):
check { that: resp.body, msg: "non-empty body" } -> ev.body

let out = do fs.write { path: "./out.txt", data: resp.body }

return { response: resp, out: out, evidence: [ev.body] }
```

Notes:

* `call?` cannot be used with tools marked `mode:"effect"` (it will fail).
* `do` on a read-mode tool is allowed but unconventional — prefer `call?` to signal read-only intent.
* Tool args must be a record `{ ... }` (never positional).
* Tool inputs are validated against Zod schemas at runtime.

## Evidence and trace artifacts

Evidence:

* `assert` and `check` emit an evidence object and write a trace event.
* A failing `assert/check` stops the program with exit code 5.

Trace:

* `a0 run --trace <file.jsonl>` writes JSONL events (one JSON object per line).
* `a0 trace <file.jsonl>` summarizes counts, tools used, failures, and duration.

## Exit codes

* 0: success
* 2: parse/validation failure
* 3: capability denied
* 4: runtime/tool error
* 5: assertion/check failed (or evidence failure)

## Repo layout

Monorepo (npm workspaces):

* `packages/core` — AST, parser, diagnostics, formatter, evaluator, capability policy
* `packages/std` — pure stdlib functions (parse.json, get/put, patch)
* `packages/tools` — built-in tools (fs/http/sh)
* `packages/cli` — the `a0` command (run/check/fmt/trace)
* `examples/` — small A0 programs

## “Language card” (paste into an agent prompt)

A0 is line-oriented and record-first.

Statements:

* `let name = expr`
* `expr -> name` (bind result of an expression statement)
* `fn name { params } { body }` — define a function (v0.3)
* `return { ... }` must be last

Expressions:

* literals: `null`, `true/false`, numbers, `"strings"`
* record: `{ k: expr, ... }`
* list: `[ expr, ... ]`
* path: `name.foo.bar`
* tools:

  * `call? tool.name { k: expr, ... }`   # read-only tool
  * `do tool.name { k: expr, ... }`      # effect tool
* evidence:

  * `assert { that: expr, msg: "..." } -> ev`
  * `check  { that: expr, msg: "..." } -> ev`
* control flow (v0.3):

  * `if { cond: expr, then: expr, else: expr }` — conditional
  * `for { in: list, as: "name" } { body }` — iteration
  * `match subject { ok { val } { body } err { e } { body } }` — ok/err discrimination
* stdlib:

  * `parse.json { in: expr }`
  * `get { in: expr, path: "a.b[0]" }`
  * `put { in: expr, path: "...", value: expr }`
  * `patch { in: expr, ops: [ ... ] }`
  * `eq { a: expr, b: expr }`, `contains { in: expr, value: expr }`
  * `not { in: expr }`, `and { a: expr, b: expr }`, `or { a: expr, b: expr }`

Capabilities:

* Policy allowlist gates tools. Policy file: `./.a0policy.json` then `~/.a0/policy.json`.
* Tools: `fs.read`, `fs.write`, `http.get`, `sh.exec`.
* Capabilities must be declared in `cap { ... }` for each tool used (enforced at `a0 check` time).

Budgets:

* `budget { timeMs: N, maxToolCalls: N, maxBytesWritten: N, maxIterations: N }` — enforced at runtime.

## Roadmap

### v0.2 — Make runs reproducible and failures cheaper ✓

Theme: "tighten invariants + better contracts". **Implemented.**

What shipped in v0.2:

* **Stdlib predicates**: `eq`, `contains`, `not`, `and`, `or` — makes `assert`/`check` genuinely useful
* **Capability enforcement**: `a0 check` rejects programs that use tools without declaring the capability in `cap { ... }` (`E_UNDECLARED_CAP`)
* **Capability naming cleanup**: removed `http.read` remnant; canonical set is `fs.read`, `fs.write`, `http.get`, `sh.exec`
* **Budget enforcement**: `budget { timeMs, maxToolCalls, maxBytesWritten }` enforced at runtime (`E_BUDGET`)
* **Tool contracts**: Zod schemas validate tool inputs at runtime (`E_TOOL_ARGS` with field-level details)
* **Trace schema v1**: stable event names (`run_start`, `run_end`, `stmt_start`, `stmt_end`, `tool_start`, `tool_end`, `evidence`, `budget_exceeded`), enriched with capabilities, budget, mode, and durations
* **CLI polish**: `--pretty` flag for human-readable errors, improved `--unsafe-allow-all` labeling
* **Golden tests**: formatter idempotence, trace event sequences, capability-policy precedence

### v0.3 — Make it a real programming language (composition) ✓

Theme: "control flow + user-defined reuse". **Implemented.**

What shipped in v0.3:

* **`if` expression**: `if { cond: expr, then: expr, else: expr }` — record-style conditional, lazy evaluation (only taken branch evaluates), uses A0 truthiness (false/null/0/"" are falsy)
* **`for` loop**: `for { in: list, as: "binding" } { body }` — list iteration producing a list of results, scoped bindings, budget-aware via `maxIterations`
* **`fn` user-defined functions**: `fn name { params } { body }` — define-before-use, record-style arguments, direct recursion allowed, no closures
* **`match` expression**: `match subject { ok { val } { body } err { e } { body } }` — ok/err discrimination on records, scoped arm bodies
* **Scoped environments**: parent-chained `Env` for `fn`/`for`/`match` block bodies
* **New budget field**: `maxIterations` — enforced in `for` loops
* **New trace events**: `for_start`, `for_end`, `fn_call_start`, `fn_call_end`, `match_start`, `match_end`
* **New diagnostic codes**: `E_FN_DUP`, `E_FOR_NOT_LIST`, `E_MATCH_NOT_RECORD`, `E_MATCH_NO_ARM`

### v0.4 — Extensibility without losing safety

Theme: “plugins + sandbox-shaped boundaries”.

Tools/plugins:

* External tool registry:

  * discover tools via a manifest (JSON)
  * map tool -> capabilityId -> schema
* Optional sandbox strategy for effectful tools:

  * start with process isolation + strict policy
  * explore WASI (Wasm) for untrusted tools (keeps host safe)

Packaging:

* `a0 pack/unpack` (optional) only if it stays reversible and debuggable:

  * packed form must round-trip to identical canonical AST
  * traces still reference source spans meaningfully

## "Fully functional GP runtime" checklist (beyond v0.4)

If you want A0 to stand on its own as a general-purpose agent runtime, these are the big missing chunks:

* ~~A minimal expression system (comparisons, boolean logic) or a disciplined stdlib that covers it.~~ → **v0.2**: stdlib predicates (`eq`, `contains`, `not`, `and`, `or`)
* Modules/imports that actually execute (today "import" is only a header shape).
* A coherent error/value convention (`{ ok: ... }` / `{ err: ... }`) and helpers to work with it.
* ~~A real resource governance model (timeouts, quotas, per-capability constraints, "effects in loops" policies).~~ → **v0.2**: budget enforcement (`timeMs`, `maxToolCalls`, `maxBytesWritten`)
* ~~First-class testing story for A0 scripts (fixture inputs + golden outputs + golden traces).~~ → **v0.2**: golden tests for formatter, traces, and capability-policy precedence

## Recommended tech direction

Current stack (good for fast iteration):

* TypeScript + Node.js
* Commander (CLI), Chevrotain (parser)
* Node’s built-in test runner for tests

If you push toward running agent-generated code in more hostile environments:

* Keep the language semantics stable in TS for v0.2–v0.3
* Consider a hardened runtime in Rust later (capability gate + sandbox), while keeping the language front-end compatible

## Contribution rules (for agents)

* Preserve the philosophy: structured data, explicit effects, capability gating, evidence/trace outputs.
* Never add a language feature without:

  * formatter support
  * trace impact specified
  * tests (golden where possible)
* Prefer small PRs with one invariant change at a time.
* If you add nondeterminism, it must be opt-in and explicitly marked in trace output.

## License

MIT

