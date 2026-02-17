---
title: "A0 Language: Agent-Optimized General-Purpose CLI Interpreter (Option B: TypeScript/Node)"
status: "draft"
---

# Overview {#overview}

A0 is a small, structured, general-purpose programming language and CLI interpreter designed to be easy for autonomous agents to generate and repair reliably, while remaining practical for humans to read. The runtime emphasizes structured data over strings, explicit side-effects with capability gating, deterministic defaults, and machine-readable evidence and traces.

This PRD defines the v0.1 scope: a working `a0` CLI that can parse, validate, and run A0 programs; enforce declared capabilities; execute a built-in tool set (filesystem, HTTP read, process exec); and emit structured trace + evidence artifacts.

# Goals {#goals}

1. Provide a minimal-but-complete language surface that supports real automation tasks: data fetch/transform, file IO, process execution, checks/assertions, and structured return values.
2. Make programs highly reliable to generate: small grammar, record-based arguments, canonical formatting, and strict validation errors with stable locations.
3. Support safe execution-by-policy: explicit `cap { ... }` declarations plus host enforcement (deny by default).
4. Produce machine-consumable outputs: JSON result, JSONL trace, and evidence objects suitable for governance and automated repair loops.
5. Ship as a cross-platform Node.js CLI with a clean package structure and a reference standard library.

# Non-Goals {#non-goals}

1. Full sandbox security against malicious programs in v0.1 (capability gating is required; stronger isolation is future work).
2. High-performance JIT compilation or advanced optimization.
3. A large standard library or package ecosystem in v0.1.
4. Concurrency, async/await syntax, or distributed execution in v0.1.
5. IDE integration beyond formatter + diagnostics output (LSP is future work).

# Users and Use Cases {#users-use-cases}

Primary users:
- Autonomous coding/automation agents producing deterministic task scripts.
- Engineers running and inspecting scripts locally or in CI.

Core use cases:
1. âFetch/transform/writeâ: read JSON from HTTP, transform it, write to file.
2. âGenerate artifacts with gatesâ: run a tool (e.g., tests/lint), check pass/fail, output evidence.
3. âRepair loop friendlyâ: failures point to a node/statement with machine-readable context and stable formatting.

# Assumptions and Open Questions {#assumptions-open-questions}

Assumptions:
- Target runtime is Node.js (LTS) with TypeScript, distributed as an npm package and runnable via `npx a0 ...` or installed globally.
- Execution is âtrusted local / CIâ with explicit capability allowlists; stronger sandboxing is deferred.
- Built-in tools cover the common baseline: fs read/write, http get, and process exec.

Open questions (tracked, not blocking v0.1):
- Do we require a static type checker in v0.1, or only runtime type validation?
- Should `call?` and `do` both require host allowlists, or should `call?` be implicitly allowed when `cap` includes it?
- Should the language allow user-defined functions in v0.1, or defer to v0.2?

# Success Metrics {#success-metrics}

- Reliability: â¥95% of invalid programs fail at `a0 check` with a single primary diagnostic pointing at the correct span.
- Determinism: repeated runs of pure expressions are identical and cacheable (when cache is enabled).
- Traceability: every effectful operation produces trace events and optional evidence objects.
- Usability: `a0 fmt` yields stable formatting; repeated formatting produces identical output (idempotent).

# Constraints {#constraints}

## Performance {#constraints-performance}
- v0.1 must parse and validate typical scripts (<500 LOC) quickly enough for interactive use.

## Security and Privacy {#constraints-security}
- Deny-by-default capabilities at runtime.
- No silent network or filesystem writes without granted capabilities.
- Clear warnings in docs and CLI output that v0.1 is not a hardened sandbox.

## Portability {#constraints-portability}
- Must run on Windows, macOS, and Linux.

# Language Specification (v0.1) {#language-spec}

## Core principles {#language-spec-principles}
- Structured data everywhere (records/lists/tables), minimal stringly-typed APIs.
- No operator precedence. Prefer function-style calls and record arguments.
- Effects are explicit: `call?` (read-only) vs `do` (effectful).
- Evidence is first-class: `assert` and `check` return evidence objects.

## Core types {#language-spec-types}
- `int`, `float`, `bool`, `str`, `bytes`
- `list`, `rec` (record/map)
- `table` (list of records) as a convention (no special syntax needed v0.1)
- `artifact` (a record with content-address or file reference)
- `evidence` (a record with verdict + metadata)
- `result` convention: `{ ok: <value> }` or `{ err: <record> }`

## Program structure {#language-spec-structure}
- Optional headers at top: `cap { ... }`, `budget { ... }`, `import "..." as name`
- Statements are line-oriented.
- `return { ... }` is required for well-formed scripts in v0.1.

## Effects and capabilities {#language-spec-effects}
- Program declares desired capabilities: `cap { fs.read, fs.write, http.read, sh.exec, ... }`
- Host enforces an allowlist policy; if requested capability is not allowed, `a0 run` fails before executing.
- `call? tool.name { ... }` is a read-only tool call.
- `do tool.name { ... }` is an effectful tool call.

## Evidence {#language-spec-evidence}
- `assert { ... } -> ev.name` emits `{ kind:"assert", ok:true|false, msg, details, span }`
- `check { ... } -> ev.name` emits `{ kind:"check", ok:true|false, msg, details, span }`
- Failed `assert/check` must:
  - Set `ok:false`
  - Still emit evidence
  - Cause program failure unless wrapped by an explicit âsoftâ mode (out of scope v0.1)

## Error model {#language-spec-errors}
- Parsing/validation errors are diagnostics with:
  - `code` (stable string)
  - `message`
  - `span` (file, start/end)
  - `hint` (optional)
- Runtime errors return a structured `err` record and exit non-zero.

## Minimal grammar {#language-spec-grammar}
Lexical notes:
- Identifiers: `[A-Za-z_][A-Za-z0-9_]*`
- Strings: double-quoted with JSON-style escapes
- Comments: `#` to end of line

EBNF sketch:
```
program   := header* stmt* ;
header    := capDecl | budgetDecl | importDecl ;
capDecl   := "cap" record ;
budgetDecl:= "budget" record ;
importDecl:= "import" string "as" ident ;

stmt      := letStmt | exprStmt | returnStmt ;
letStmt   := "let" ident "=" expr ;
returnStmt:= "return" record ;

exprStmt  := expr ("->" identPath)? ;

expr      := literal
           | identPath
           | record
           | list
           | callExpr
           | doExpr
           | assertExpr
           | checkExpr
           | fnCall ;

callExpr  := "call?" identPath record ;
doExpr    := "do" identPath record ;
assertExpr:= "assert" record ;
checkExpr := "check" record ;
fnCall    := identPath record ;

record    := "{" (pair ("," pair)*)? "}" ;
pair      := ident ":" expr ;
list      := "[" (expr ("," expr)*)? "]" ;
identPath := ident ("." ident)* ;
```

# CLI Product Requirements {#cli}

## CLI commands {#cli-commands}

### `a0 run` {#cli-run}
Runs an A0 program.

Requirements {#cli-run-requirements}
- Accept input file path or `-` for stdin.
- Enforce capability allowlist before execution.
- Emit JSON result by default to stdout.
- Support `--trace <path>` to write JSONL trace.
- Support `--evidence <path>` to write evidence JSON.
- Exit codes:
  - 0 success
  - 2 parse/validation failure
  - 3 capability denied
  - 4 runtime error
  - 5 assertion/check failed

Acceptance Criteria {#cli-run-criteria}
- Running a valid sample script produces a JSON object containing `artifacts` and `evidence`.
- A script requesting disallowed capabilities fails before any effectful tool runs.
- A failed `assert` exits with code 5 and emits evidence with `ok:false`.
- `--trace` produces JSONL with at least start/end events and tool events.

Implementation Notes {#cli-run-notes}
- Use Commander.js for command parsing and help output.

### `a0 check` {#cli-check}
Static validation without execution.

Requirements {#cli-check-requirements}
- Parse + validate syntax and semantic rules (headers, `return`, basic expression shapes).
- Validate capability identifiers against a known registry.
- Output diagnostics in JSON (default) and a human format (`--pretty`).

Acceptance Criteria {#cli-check-criteria}
- Invalid syntax returns exit code 2 with a primary diagnostic including a span.
- Unknown capability names return exit code 2 with a diagnostic listing valid options.
- Valid scripts return exit code 0 and no diagnostics.

Implementation Notes {#cli-check-notes}
- v0.1 âsemanticâ validation: required headers format, `return` present, tool args are records, bindings exist.

### `a0 fmt` {#cli-fmt}
Canonical formatter.

Requirements {#cli-fmt-requirements}
- Format to a single canonical layout (stable whitespace, commas, indentation).
- Idempotent: formatting formatted output yields identical bytes.
- Support `--write` to overwrite file; default prints to stdout.

Acceptance Criteria {#cli-fmt-criteria}
- `a0 fmt` output parses identically to the original program.
- `a0 fmt --write` followed by `a0 fmt` produces no diff.
- Formatter preserves string contents exactly.

Implementation Notes {#cli-fmt-notes}
- Implement as AST pretty-printer; avoid token-preserving formatting in v0.1.

### `a0 trace` {#cli-trace}
Replays or displays trace summaries.

Requirements {#cli-trace-requirements}
- Read JSONL trace and output:
  - a summary (counts per tool, failures, durations)
  - optionally output as JSON (`--json`)

Acceptance Criteria {#cli-trace-criteria}
- Given a trace file from `a0 run --trace`, `a0 trace` outputs a non-empty summary.
- Summary includes total duration and count of tool invocations.

Implementation Notes {#cli-trace-notes}
- Keep simple in v0.1: parse JSONL line-by-line.

# Interpreter Architecture {#architecture}

## Modules and packages {#architecture-packages}
Deliver as a small monorepo:
- `packages/core` (AST, parser, diagnostics, formatter, evaluator interfaces)
- `packages/std` (pure stdlib functions: parse.json, get/put, patch)
- `packages/tools` (host tools: fs, http, sh)
- `packages/cli` (Commander CLI wrapper around core + tools)

## Parser and diagnostics {#architecture-parser}
Requirements {#architecture-parser-requirements}
- Deterministic parse with clear error messages and spans.
- Grammar must be constrained and free of precedence ambiguity.
- Provide an AST with node spans for formatter and diagnostics.

Acceptance Criteria {#architecture-parser-criteria}
- A malformed record (missing `}`) yields one primary diagnostic with correct span.
- Unknown tokens produce diagnostics without crashing.
- Parser supports at least: headers, let, call?/do, assert/check, return.

Implementation Notes {#architecture-parser-notes}
- Use Chevrotain for lexer + parser in TypeScript.

## AST and evaluation model {#architecture-eval}
Execution is step-by-step evaluation of statements in order:
- `let` binds values.
- expression statements optionally assign to an identifier path via `->`.
- `return` terminates evaluation with a record value.

Requirements {#architecture-eval-requirements}
- Deterministic evaluation order.
- Separate pure evaluation from tool execution.
- Tool execution receives `AbortSignal` for budgets/timeouts.

Acceptance Criteria {#architecture-eval-criteria}
- A script with two `let` bindings can reference earlier bindings reliably.
- A failed tool call returns a structured runtime error with tool name and args.
- Execution stops at `return` and does not run subsequent statements.

Implementation Notes {#architecture-eval-notes}
- v0.1 can implement a simple environment map + evaluator; DAG/caching is optional but recommended as an internal structure.

## Capabilities and policy {#architecture-capabilities}
Requirements {#architecture-capabilities-requirements}
- Support program-level `cap { ... }` declaration.
- Support host policy file that defines allowed capabilities and limits:
  - default location: `./.a0policy.json` then `~/.a0/policy.json`
- Deny by default if policy missing (configurable via `--unsafe-allow-all` for local dev only).

Acceptance Criteria {#architecture-capabilities-criteria}
- If policy denies `fs.write`, any `do fs.write ...` fails before execution.
- Policy precedence respects local policy over user policy.
- CLI prints which capability was denied and where it was requested (span).

Implementation Notes {#architecture-capabilities-notes}
- Policy JSON schema is versioned and validated at startup.

## Tool registry {#architecture-tools}
Requirements {#architecture-tools-requirements}
- Tools are invoked by name, e.g. `fs.read`, `http.get`, `sh.exec`.
- Each tool declares:
  - `name`
  - `mode`: `read` or `effect`
  - `capabilityId` (must match `cap { ... }`)
  - `inputSchema` and `outputSchema` for runtime validation
- Tools return structured values; no tool returns raw stdout-only strings without metadata.

Acceptance Criteria {#architecture-tools-criteria}
- Tool invocations validate input shape and fail with diagnostic-like errors if wrong.
- `call?` refuses tools whose `mode` is `effect`.
- `do` refuses tools whose `mode` is `read` only if configured (optional).

Implementation Notes {#architecture-tools-notes}
- Use Zod (or equivalent) for schemas and runtime validation.

# Standard Library (v0.1) {#stdlib}

## JSON parsing {#stdlib-json}
Requirements {#stdlib-json-requirements}
- `parse.json { in:<str> } -> <rec|list>`
- errors are structured `err` with location if available.

Acceptance Criteria {#stdlib-json-criteria}
- Valid JSON parses to a structured value.
- Invalid JSON yields `err` containing message and approximate position.

## Record path ops {#stdlib-pathops}
Requirements {#stdlib-pathops-requirements}
- `get { in:<rec|list>, path:<str> }`
- `put { in:<rec|list>, path:<str>, value:<any> }`
- Path syntax: dot + bracket (minimal JSONPath-lite).

Acceptance Criteria {#stdlib-pathops-criteria}
- `get` returns `null` for missing path (or `err` if strict mode; choose one and document).
- `put` creates intermediate objects as needed.

## Patch {#stdlib-patch}
Requirements {#stdlib-patch-requirements}
- Support JSON Patch semantics for list-of-ops patches:
  - `patch { in:<rec|list>, ops:<list> }`
- Ops follow RFC6902-like structure: `op`, `path`, optional `value`.

Acceptance Criteria {#stdlib-patch-criteria}
- Applying a `replace` operation updates the document.
- Invalid ops return structured `err` with index of failing op.

Implementation Notes {#stdlib-patch-notes}
- Align operation shape with JSON Patch conventions.

# Trace and Evidence {#trace}

## Trace format (JSONL) {#trace-format}
Each trace line is one JSON object with at least:
- `ts` ISO string
- `runId`
- `event` string
- `span` optional `{ file, start, end }`
- `data` event-specific object

Required events:
- `run_start`, `run_end`
- `stmt_start`, `stmt_end`
- `tool_start`, `tool_end`
- `evidence` (when assert/check emits)

Acceptance Criteria {#trace-format-criteria}
- `a0 run --trace` produces valid JSON per line.
- Tool events include tool name, duration, and outcome (ok/err).

## OpenTelemetry integration {#trace-otel}
Requirements {#trace-otel-requirements}
- Provide `--otel` flag to emit traces using OpenTelemetry SDK when configured by environment.
- Map:
  - run = root span
  - each stmt = child span
  - each tool call = child span with attributes

Acceptance Criteria {#trace-otel-criteria}
- With `--otel`, the runtime creates spans for run and tool invocations.
- Without `--otel`, no OTEL packages are required at runtime (optional dependency or dynamic import).

# Packaging and Distribution {#packaging}

Requirements {#packaging-requirements}
- Publish `a0` CLI as npm package with bin entry.
- Provide a single entry: `a0`.
- Provide versioned internal schemas for policy and trace.

Acceptance Criteria {#packaging-criteria}
- `npx a0 check examples/hello.a0` works on a clean machine.
- Package includes `examples/` and documentation.

Implementation Notes {#packaging-notes}
- Use a workspace tool (pnpm or npm workspaces) and a build step that outputs ESM + types.

# Implementation Order {#implementation-order}

1. Parser + AST + diagnostics (core)
2. `a0 check` command (cli)
3. Minimal evaluator for literals/records/lists/let/return
4. Tool registry + built-in tools (fs.read/fs.write/http.get/sh.exec)
5. Capabilities + policy enforcement
6. `a0 run` command with evidence handling
7. Canonical formatter (`a0 fmt`)
8. Trace JSONL (`--trace`) + `a0 trace`
9. Optional OTEL spans (`--otel`)
10. Standard library: parse.json, get/put, patch

# Task Map {#task-map}

Each task should be implementable in ~15 minutes.

Parser/AST
- [ ] Define token set and lexer rules
- [ ] Implement Chevrotain parser rules for headers, let, expr, return
- [ ] Produce AST nodes with spans
- [ ] Add diagnostic mapping from parser errors to `{code,message,span}`

CLI
- [ ] Scaffold `a0` CLI with Commander commands: check/run/fmt/trace
- [ ] Implement `--pretty`, `--json`, `--trace`, `--evidence` flags
- [ ] Add exit code mapping

Capabilities
- [ ] Define policy JSON schema and loaders (project then user)
- [ ] Enforce deny-by-default unless explicitly allowed
- [ ] Validate program-requested caps vs policy allowlist

Evaluator
- [ ] Implement environment map + evaluator for expressions and statements
- [ ] Implement `assert/check` evaluation and failure behavior
- [ ] Implement structured runtime errors

Tools
- [ ] Define Tool interface + registry + schema validation
- [ ] Implement fs.read/fs.write
- [ ] Implement http.get (read-only)
- [ ] Implement sh.exec with capture of stdout/stderr/exitCode

Formatter
- [ ] Implement AST pretty-printer and idempotence test
- [ ] Add `a0 fmt --write`

Trace
- [ ] Implement JSONL trace emitter (run/stmt/tool/evidence)
- [ ] Implement `a0 trace` summary output

Stdlib
- [ ] Implement parse.json and tests
- [ ] Implement get/put path ops and tests
- [ ] Implement patch ops aligned with JSON Patch shape and tests

# Risks and Mitigations {#risks}

- Sandbox limitations in Node: capability gating reduces accidental damage but does not fully isolate malicious scripts. Mitigation: clear warnings, deny-by-default, recommend CI isolation; plan future hardened sandbox path.
- Grammar drift: keep grammar small, add `a0 fmt` early, and enforce canonical style.
- Tool flakiness: include timeouts and deterministic logging in tool wrappers.

# Appendix: Built-in Tool Specs (v0.1) {#appendix-tools}

## `fs.read` {#appendix-tools-fsread}
Input:
- `{ path: str, encoding?: "utf8"|"bytes" }`
Output:
- `str` when encoding utf8, else `bytes`

## `fs.write` {#appendix-tools-fswrite}
Input:
- `{ path: str, data: str|bytes|rec|list, format?: "raw"|"json" }`
Output:
- `artifact` record `{ kind:"file", path, bytes, sha256 }`

## `http.get` {#appendix-tools-httpget}
Input:
- `{ url: str, headers?: rec }`
Output:
- `{ status:int, headers:rec, body:str }`

## `sh.exec` {#appendix-tools-shexec}
Input:
- `{ cmd: str, cwd?: str, env?: rec, timeoutMs?: int, kind?: str }`
Output:
- `{ exitCode:int, stdout:str, stderr:str, durationMs:int }`