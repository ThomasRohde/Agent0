# 08 - Implementation Roadmap and Milestones

## Overview

This document defines the phased implementation plan for the Go/WASM port of the A0 language runtime. The roadmap is structured into 8 phases, each with concrete deliverables, acceptance criteria, and estimated effort. Phases are sequential by default, but some work can overlap where noted.

The guiding principle: **conformance before features**. Each phase produces a testable, releasable artifact that passes a growing subset of the ~125 conformance scenarios from the TypeScript reference implementation.

---

## Phase Summary

| Phase | Name | Deliverable | Scenarios Passing | Milestone |
|-------|------|-------------|-------------------|-----------|
| 0 | Project Bootstrap | Go module, CI, tooling | 0 | Repository ready |
| 1 | Core MVP | Lexer + parser + validator + basic evaluator | ~30 | `a0-go check` and simple `run` work |
| 2 | Full Evaluator | All control flow, user functions, closures | ~60 | `a0-go run` handles all language constructs |
| 3 | Stdlib | All stdlib functions ported | ~80 | Stdlib conformance complete |
| 4 | Tools (Native) | `fs.read`, `fs.write`, `fs.list`, `fs.exists`, `sh.exec`, `http.get` | ~100 | Tool integration complete |
| 5 | CLI + Formatter | CLI commands (`run`, `check`, `fmt`, `trace`), formatter, trace output | ~125 | Full native conformance |
| 6 | WASM + WASI | `js/wasm`, `wasip1/wasm`, TinyGo builds | ~125 (WASM) | WASM targets pass conformance |
| 7 | Browser Embedding | NPM package, JS API, playground | N/A | Browser-ready distribution |
| 8 | Polish + Release | Documentation, benchmarks, packaging | N/A | v1.0 release |

---

## Phase 0: Project Bootstrap

**Goal:** Establish the Go project structure, CI pipeline, and development tooling before writing any A0-specific code.

### Deliverables

1. **Go module initialization**
   - `go mod init github.com/<org>/a0-go`
   - Directory structure:
     ```
     a0-go/
       cmd/
         a0/          # Native CLI entry point
         a0-wasm/     # WASM entry point
       pkg/
         lexer/
         parser/
         ast/
         validator/
         evaluator/
         formatter/
         diagnostics/
         stdlib/
         tools/
         capabilities/
         trace/
       internal/
         testutil/    # Shared test helpers
       testdata/
         scenarios/   # Synced from TS packages/scenarios
         fixtures/    # Golden test fixtures
       .github/
         workflows/
           ci.yml
       go.mod
       go.sum
       Makefile
       README.md
     ```

2. **CI pipeline** (GitHub Actions)
   - Go 1.22 + 1.23 matrix
   - Linux, macOS, Windows runners
   - `go vet`, `golangci-lint`, `go test -race`
   - WASM build verification (build succeeds, no test run yet)

3. **Makefile targets**
   ```makefile
   build:        go build ./cmd/a0
   test:         go test -race ./...
   lint:         golangci-lint run
   wasm:         GOOS=js GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasm
   wasip1:       GOOS=wasip1 GOARCH=wasm go build -o a0-wasi.wasm ./cmd/a0
   bench:        go test -bench=. -benchmem ./...
   conformance:  go test -run TestConformance ./...
   ```

4. **Scenario sync script**
   - Copy `packages/scenarios/scenarios/` to `testdata/scenarios/`
   - Copy formatter fixtures to `testdata/fixtures/`

5. **Shared types**
   - `pkg/ast/ast.go` -- AST node type definitions (empty implementations)
   - `pkg/diagnostics/diagnostics.go` -- Diagnostic type, codes, formatting
   - `pkg/evaluator/types.go` -- `A0Value`, `A0Record`, `ToolDef`, `StdlibFn` interfaces

### Acceptance Criteria
- `go build ./...` succeeds
- `go test ./...` runs (all tests skip or pass trivially)
- CI pipeline is green
- Scenario files are synced and accessible via `testdata/`

### Estimated Effort
2-3 days

---

## Phase 1: Core MVP

**Goal:** Implement the lexer, parser, validator, and a minimal evaluator that handles simple programs (literals, `let`, `return`, records, lists).

### Deliverables

1. **Lexer** (`pkg/lexer/`)
   - Tokenize all A0 tokens: keywords (`cap`, `budget`, `import`, `as`, `let`, `return`, `call?`, `do`, `assert`, `check`, `true`, `false`, `null`, `if`, `else`, `for`, `fn`, `match`, `try`, `catch`, `filter`, `loop`), identifiers, integer/float literals, string literals (with escapes), punctuation (`{}[]():,.->=+-*/%!`), `...` spread, comments (`#`)
   - Error recovery: skip invalid characters, report `E_LEX`
   - Port all lexer unit tests from `core/src/lexer.test.ts`

2. **Parser** (`pkg/parser/`)
   - Recursive descent parser (not Chevrotain -- Go has no equivalent; hand-written parser is idiomatic)
   - Parse all statement types: `CapDecl`, `BudgetDecl`, `ImportDecl`, `LetStmt`, `ReturnStmt`, `ExprStmt` (including `->` target)
   - Parse all expression types: literals, records, lists, identifiers, dotted paths, `call?`/`do`, `assert`/`check`, `FnCallExpr`, `for`, `fn`, `match`, `if`/`else`, `try`/`catch`, `filter`, `loop`, arithmetic, comparisons, unary, spread, parenthesized grouping
   - Produce typed AST nodes matching TS AST definitions
   - Error recovery: report `E_PARSE` with source spans
   - Port all parser unit tests

3. **Validator** (`pkg/validator/`)
   - All semantic checks from TS validator:
     - `E_NO_RETURN`, `E_RETURN_NOT_LAST`
     - `E_UNKNOWN_CAP`, `E_CAP_VALUE`
     - `E_DUP_BINDING`, `E_UNBOUND`
     - `E_CALL_EFFECT`, `E_UNDECLARED_CAP`
     - `E_UNKNOWN_BUDGET`, `E_FN_DUP`
     - `E_IMPORT_UNSUPPORTED`
   - Scoped binding validation for `fn`/`for`/`match`/`if-block`/`try-catch`/`filter-block`/`loop`
   - Port all validator unit tests

4. **Minimal Evaluator** (`pkg/evaluator/`)
   - Execute: `let` bindings, `return` statements, record/list/string/int/float/bool/null literals
   - Nested records, list indexing
   - Expression targets (`->` with simple and dotted paths)
   - Arithmetic operators (`+`, `-`, `*`, `/`, `%`), string concatenation
   - Comparison operators (`>`, `<`, `>=`, `<=`, `==`, `!=`)
   - Unary negation
   - Parenthesized grouping
   - `assert`/`check` with evidence collection
   - Capability enforcement (`E_CAP_DENIED`)
   - Budget skeleton (time, iterations counters)

### Scenarios Passing (~30)
- `hello`, `arithmetic`, `assert-pass`, `assert-fail`, `assert-halts`
- `check-pass`, `evidence-pass`, `evidence-fail`, `mixed-checks`
- `cap-denied`, `unsafe-allow-all`
- `check-no-return`, `check-return-not-last`, `check-unbound`, `check-dup-binding`
- `check-call-effect`, `check-undeclared-cap`
- `parse-error`, `pretty-error`
- `budget-time` (basic budget enforcement)

### Acceptance Criteria
- `a0-go check <file>` produces correct diagnostics for all validator scenarios
- `a0-go run <file>` executes simple programs with correct output
- All lexer, parser, validator unit tests pass
- Evaluator unit tests for basic expressions pass

### Estimated Effort
2-3 weeks

---

## Phase 2: Full Evaluator

**Goal:** Complete the evaluator with all control flow constructs, user-defined functions, closures, and tool call infrastructure.

### Deliverables

1. **Control flow**
   - `if`/`else` block expressions (with statement bodies)
   - `for` loops (iterate over lists, produce list results)
   - `match` expressions (arm selection by record key, `_` default)
   - `try`/`catch` expressions (error binding as `{ code, message }`)
   - `filter` block expressions (inline filter with predicate body)
   - `loop` expressions (iterative convergence with `times` limit)

2. **User-defined functions**
   - `fn` definitions with parameter records
   - Closures (capture variables from defining scope)
   - Recursive function calls
   - `userFns` map in evaluator

3. **Tool call infrastructure**
   - `call?` (read tools) and `do` (effect tools) dispatch
   - Tool argument passing and result binding
   - `ExecOptions.tools` map integration
   - `E_UNKNOWN_TOOL`, `E_TOOL_ARGS`, `E_TOOL` error handling

4. **Stdlib call infrastructure**
   - `ExecOptions.stdlib` map integration
   - `FnCallExpr` dispatch to stdlib
   - `E_UNKNOWN_FN`, `E_FN` error handling

5. **Budget enforcement**
   - `maxIterations` (for loops, filter blocks, loop blocks, map)
   - `maxToolCalls`
   - `maxBytesWritten`
   - `timeMs` (wall-clock timeout via context cancellation)
   - `E_BUDGET` on limit exceeded

6. **Trace events**
   - All trace event types: `run_start`, `run_end`, `stmt_start`, `stmt_end`, `tool_start`, `tool_end`, `evidence`, `budget_exceeded`, `for_start`, `for_end`, `fn_call_start`, `fn_call_end`, `match_start`, `match_end`, `map_start`, `map_end`, `reduce_start`, `reduce_end`, `try_start`, `try_end`, `filter_start`, `filter_end`, `loop_start`, `loop_end`
   - Trace callback via `ExecOptions.trace`

### Scenarios Passing (~60)
- All Phase 1 scenarios plus:
- `for-loop`, `fn-basic`, `fn-recursive`, `map-fn`
- `if-then-else`, `match-ok`, `match-err`
- `runtime-for-not-list`, `runtime-type-error`, `runtime-match-no-arm`
- `budget-max-iterations`, `budget-max-tool-calls`, `budget-max-bytes`
- `trace-basic`
- (Tool/stdlib scenarios still pending -- tools not wired yet)

### Acceptance Criteria
- All control flow evaluator tests pass
- Function definition, closure, and recursion tests pass
- Budget enforcement tests pass
- Trace event sequence tests pass (golden tests)
- Tool call dispatch works with mock tools

### Estimated Effort
2-3 weeks

---

## Phase 3: Stdlib

**Goal:** Port all stdlib functions from `@a0/std` to Go.

### Deliverables

All stdlib functions implemented in `pkg/stdlib/`:

| Function | Category | Notes |
|----------|----------|-------|
| `parse.json` | Parse | JSON string -> A0 value |
| `get` | Path ops | Dot-path and bracket access |
| `put` | Path ops | Immutable set at path |
| `patch` | Path ops | JSON Patch (RFC 6902 subset) |
| `len` | List ops | |
| `append` | List ops | |
| `concat` | List ops | |
| `sort` | List ops | Multi-key sorting support |
| `filter` | List ops | `by:` key-truthiness and `fn:` predicate overloads |
| `find` | List ops | |
| `range` | List ops | |
| `join` | List ops | |
| `unique` | List ops | |
| `pluck` | List ops | |
| `flat` | List ops | |
| `keys` | Record ops | |
| `values` | Record ops | |
| `merge` | Record ops | |
| `entries` | Record ops | |
| `str.concat` | String ops | |
| `str.split` | String ops | |
| `str.starts` | String ops | |
| `str.ends` | String ops | |
| `str.replace` | String ops | |
| `str.template` | String ops | Template string interpolation |
| `math.max` | Math ops | |
| `math.min` | Math ops | |
| `eq` | Predicates | Deep equality |
| `contains` | Predicates | String/list containment |
| `not` | Predicates | |
| `and` | Predicates | |
| `or` | Predicates | |
| `coalesce` | Predicates | First non-null |
| `typeof` | Predicates | Type name string |

### Scenarios Passing (~80)
- All Phase 2 scenarios plus:
- `stdlib-lists`, `stdlib-strings`, `stdlib-records`, `stdlib-predicates`
- `stdlib-parse-json`, `stdlib-filter-find-sort`, `stdlib-put-patch`
- `stdlib-nested-get`, `stdlib-error-parse`

### Acceptance Criteria
- All stdlib unit tests pass (ported from `std/src/stdlib.test.ts` and `std/src/predicates.test.ts`)
- All stdlib scenario tests pass
- Error behavior matches TS: stdlib functions throw (Go: return error), evaluator wraps as `E_FN`

### Estimated Effort
1-2 weeks

---

## Phase 4: Tools (Native)

**Goal:** Implement all built-in tools for native Go targets.

### Deliverables

| Tool | Mode | Capability | Notes |
|------|------|-----------|-------|
| `fs.read` | read | `fs.read` | UTF-8 and base64 encoding |
| `fs.write` | effect | `fs.write` | Text, JSON, YAML formats; SHA-256 in result |
| `fs.list` | read | `fs.read` | Directory listing |
| `fs.exists` | read | `fs.read` | File existence check |
| `sh.exec` | effect | `sh.exec` | Shell command execution |
| `http.get` | read | `http.get` | HTTP GET with JSON parsing |

Additional tool infrastructure:
- **Input validation**: Zod-equivalent schema validation in Go (use struct tags or custom validator)
- **Tool registry**: `RegisterBuiltinTools`, `GetAllTools`
- **BytesWritten tracking**: For `maxBytesWritten` budget
- **Capability policy**: `loadPolicy` from `.a0policy.json` and `~/.a0/policy.json`

### Scenarios Passing (~100)
- All Phase 3 scenarios plus:
- `fs-read`, `file-write-json`, `file-write-text`, `file-write-sha256`, `file-write-multiformat`
- `trace-with-tools`
- `tool-error`
- `stdin-input`

### Acceptance Criteria
- All tool unit tests pass (ported from `tools/src/tools.test.ts`)
- All tool scenario tests pass
- Tool metadata (name, mode, capabilityId) matches TS
- `fs.write` returns `{ kind, path, bytes, sha256 }` record
- `sh.exec` returns `{ stdout, stderr, exitCode }` record
- Budget `maxBytesWritten` correctly tracks `fs.write` output

### Estimated Effort
1-2 weeks

---

## Phase 5: CLI + Formatter

**Goal:** Complete the CLI with all four commands and the code formatter. Achieve full native conformance.

### Deliverables

1. **CLI commands** (`cmd/a0/`)
   - `a0 run <file>` -- Execute program, output JSON result to stdout
     - `--evidence <file>` -- Write evidence array to file
     - `--trace <file>` -- Write JSONL trace to file
     - `--policy <file>` -- Override policy file
     - `--unsafe-allow-all` -- Bypass capability checks
     - `--budget-time-ms <N>` -- Override time budget
     - `--pretty` -- Human-readable error output
   - `a0 check <file>` -- Static validation, output diagnostics
     - `--pretty` -- Human-readable diagnostics
     - `--stable-json` -- Stable JSON output format
     - `--debug-parse` -- Verbose parser diagnostics
   - `a0 fmt <file>` -- Format source code
     - `--write` / `-w` -- Write formatted output back to file
   - `a0 trace <file>` -- Analyze JSONL trace file
     - `--json` -- JSON output

2. **Formatter** (`pkg/formatter/`)
   - AST -> formatted source string
   - Idempotent: `format(format(x)) == format(x)`
   - Handle all AST node types
   - Port golden test fixtures

3. **Trace analyzer**
   - Parse JSONL trace files
   - Compute summary (total events, tool invocations, evidence count, failures, budget exceeded)
   - Text and JSON output modes

4. **Exit codes**
   - 0 = success
   - 2 = parse/validation error
   - 3 = capability denied
   - 4 = runtime/tool error
   - 5 = assertion/check failed

5. **Pretty error output**
   - `error[E_CODE]: message` format
   - Source location: `file.a0:line:col`
   - Hint lines

### Scenarios Passing (~125)
- All remaining scenarios:
- `fmt-idempotence`, `fmt-write`
- `trace-command`, `trace-command-text`, `trace-command-error`
- All CLI behavior tests

### Acceptance Criteria
- Full conformance: all ~125 scenario tests pass
- Formatter golden tests pass (all 7 fixture pairs)
- Trace golden tests pass
- CLI integration tests pass
- Exit codes match TS implementation
- `--pretty` output format matches TS format (same structure, not necessarily identical strings)

### Estimated Effort
2-3 weeks

---

## Phase 6: WASM + WASI

**Goal:** Compile the Go runtime to WebAssembly targets and verify conformance.

### Deliverables

1. **js/wasm target** (Standard Go)
   - Build: `GOOS=js GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasm`
   - JavaScript bridge API:
     ```javascript
     const a0 = await loadA0();
     const result = a0.run(source, policyJson);  // Returns JSON string
     const diags = a0.check(source);              // Returns JSON diagnostics
     const formatted = a0.fmt(source);            // Returns formatted source
     ```
   - `wasm_exec.js` loader (from Go distribution)
   - Exported functions via `js.Global().Set()`

2. **wasip1 target** (Standard Go)
   - Build: `GOOS=wasip1 GOARCH=wasm go build -o a0-wasi.wasm ./cmd/a0`
   - CLI works via WASI stdin/stdout/stderr/args
   - Filesystem access via WASI pre-opened directories
   - Test with Wasmtime and WasmEdge

3. **TinyGo WASM** (optional, stretch goal)
   - Build: `tinygo build -o a0-tiny.wasm -target=wasm ./cmd/a0-wasm`
   - Binary size goal: < 500 KB gzipped
   - May require avoiding: `reflect`, `encoding/json` (use custom JSON), large stdlib imports
   - **Risk**: TinyGo may not support all Go features used. Maintain a `tinygo_compat_test.go` that builds with TinyGo to catch issues early.

4. **Tool adaptations for WASM**
   - `fs.read`/`fs.write`/`fs.list`/`fs.exists`: Work in wasip1 (via WASI FS); stubbed/virtual in js/wasm
   - `sh.exec`: Unavailable in WASM (returns `E_CAP_DENIED` or `E_TOOL`)
   - `http.get`: Use `fetch` API in js/wasm; unavailable in wasip1 (unless WASI HTTP proposal)

### Acceptance Criteria
- js/wasm: all pure scenarios pass (no filesystem-dependent tests)
- wasip1: all scenarios pass via Wasmtime with `--dir` for FS tests
- TinyGo: builds successfully, pure scenarios pass (stretch)
- Binary size thresholds met
- JS bridge API documented and tested

### Estimated Effort
2-3 weeks

---

## Phase 7: Browser Embedding

**Goal:** Package the WASM build for browser consumption with a clean JavaScript API.

### Deliverables

1. **NPM package** (`@a0/wasm` or `a0-wasm`)
   - Contains `.wasm` binary + JS loader
   - ESM and CJS entry points
   - TypeScript type definitions
   - `package.json` with proper exports map

2. **JavaScript API**
   ```typescript
   interface A0Runtime {
     run(source: string, options?: RunOptions): Promise<RunResult>;
     check(source: string): Promise<Diagnostic[]>;
     fmt(source: string): Promise<string>;
   }

   interface RunOptions {
     policy?: { allow: string[] };
     unsafeAllowAll?: boolean;
     budgetTimeMs?: number;
     stdin?: string;
   }

   interface RunResult {
     value: any;
     evidence: Evidence[];
     exitCode: number;
     trace?: TraceEvent[];
   }

   export function createA0Runtime(): Promise<A0Runtime>;
   ```

3. **Playground prototype**
   - Simple HTML page with CodeMirror/Monaco editor
   - Run/Check/Format buttons
   - Output pane for results, diagnostics, trace

4. **Documentation**
   - Browser integration guide
   - API reference
   - Bundle size optimization tips

### Acceptance Criteria
- `npm install a0-wasm` works
- `createA0Runtime()` loads WASM and returns working runtime
- All pure conformance scenarios pass through the JS API
- Bundle size documented
- Playground prototype functional

### Estimated Effort
2-3 weeks

---

## Phase 8: Polish and Release

**Goal:** Production-quality release with documentation, packaging, and distribution.

### Deliverables

1. **Documentation**
   - README with quick start, build instructions, API reference
   - Architecture guide (for contributors)
   - Migration guide from TS to Go (for users embedding A0)
   - Conformance spec document (which scenarios, which version)

2. **Packaging and Distribution**
   - GitHub Releases with pre-built binaries for all native targets
   - Homebrew formula (macOS/Linux)
   - `go install` support
   - NPM package published for WASM

3. **Performance benchmarks**
   - Benchmark suite with published results
   - Comparison against TS implementation
   - WASM vs native comparison

4. **Final conformance audit**
   - All ~125 scenarios pass on all targets
   - Diagnostic message review (clarity, consistency)
   - Edge case audit (empty programs, deeply nested structures, large inputs)

5. **Fuzz campaign**
   - Run fuzz tests for extended period (hours)
   - Fix any crashes found
   - Commit fuzz corpus to repository

### Acceptance Criteria
- CI is green on all platforms
- All conformance tests pass
- Documentation is complete and reviewed
- Binaries are published and downloadable
- NPM package is published
- No known crashes from fuzz testing

### Estimated Effort
1-2 weeks

---

## Timeline Summary

| Phase | Name | Duration | Cumulative |
|-------|------|----------|------------|
| 0 | Project Bootstrap | 2-3 days | ~0.5 weeks |
| 1 | Core MVP | 2-3 weeks | ~3.5 weeks |
| 2 | Full Evaluator | 2-3 weeks | ~6.5 weeks |
| 3 | Stdlib | 1-2 weeks | ~8 weeks |
| 4 | Tools (Native) | 1-2 weeks | ~9.5 weeks |
| 5 | CLI + Formatter | 2-3 weeks | ~12 weeks |
| 6 | WASM + WASI | 2-3 weeks | ~14.5 weeks |
| 7 | Browser Embedding | 2-3 weeks | ~17 weeks |
| 8 | Polish + Release | 1-2 weeks | ~18.5 weeks |

**Total estimated duration: 16-22 weeks** (4-5.5 months) for a single developer. With 2-3 developers working in parallel on independent phases (e.g., stdlib + tools overlap, CLI + formatter overlap), this can compress to **10-14 weeks**.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **TinyGo incompatibility** | Medium | Medium | Test TinyGo build early (Phase 0); maintain compatibility test. Fall back to standard Go WASM if TinyGo cannot compile the runtime. |
| **WASM binary too large** | Medium | High | Profile binary size per phase. Use `ldflags=-s -w` to strip debug info. Consider code splitting: core-only WASM vs full WASM. |
| **Parser complexity** | Low | Medium | Hand-written recursive descent is well-understood in Go. A0's grammar is not ambiguous. Port test-by-test from TS. |
| **Async tool bridging in WASM** | High | High | Go's `js/wasm` uses goroutines that bridge to JS promises. Test early in Phase 6. If problematic, consider synchronous-only mode for WASM. |
| **JSON number precision** | Low | Low | Go's `encoding/json` uses `float64` for numbers. A0 distinguishes int vs float. Use `json.Number` or custom unmarshaling. |
| **WASI Preview 2 not ready** | Medium | Low | Target WASI Preview 1 (stable). Preview 2 support is a future enhancement. `wasip1` target in Go 1.21+ is stable. |
| **Behavioral divergence from TS** | Medium | High | Run conformance suite continuously. Any divergence is a bug. Prioritize exact conformance over Go-idiomatic behavior. |
| **Go module dependency bloat** | Low | Medium | Keep dependencies minimal: no web frameworks, no ORM. Use stdlib wherever possible. Only external deps: CLI flag parsing (stdlib `flag` or `cobra`). |
| **Cross-platform filesystem differences** | Medium | Medium | Use `filepath` package consistently. Test on Windows CI. Normalize paths in tools. |

---

## Parallel Work Opportunities

Some phases have independent deliverables that can be worked on simultaneously:

```
Phase 0  ─────────────────┐
                           v
Phase 1  ─── Lexer ──── Parser ──── Validator ──── Evaluator (basic) ──┐
                                                                        v
Phase 2  ─── Control Flow ──── Functions ──── Tool Dispatch ──── Trace ─┐
                                                                         v
Phase 3  ─── Stdlib (path/list) ─┬─ Stdlib (string/record) ─┬─ Stdlib (pred) ──┐
                                  │                           │                   v
Phase 4  ─── fs tools ───────────┼─ sh/http tools ──────────┼─────────────────── ┐
                                  │                           │                     v
Phase 5  ─── CLI commands ───────┴─ Formatter ───────────────┴── Trace analyzer ──┐
                                                                                    v
Phase 6  ─── js/wasm ──── wasip1 ──── TinyGo (optional) ──────────────────────────┐
                                                                                    v
Phase 7  ─── NPM package ──── JS API ──── Playground ──────────────────────────────┐
                                                                                    v
Phase 8  ─── Docs ──── Packaging ──── Fuzz campaign ──── Release ──────────────────
```

**Key parallelism points:**
- Phase 3 (stdlib) can overlap with Phase 4 (tools) -- different packages, no dependency
- Within Phase 5, CLI commands, formatter, and trace analyzer are independent
- Phase 7 (browser) can start once Phase 6 js/wasm target is working, even if wasip1 isn't done

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Conformance scenarios passing | 125/125 on native; 120+/125 on WASM (FS-dependent tests may be N/A) |
| Test coverage | > 85% overall, > 90% for lexer/validator/stdlib |
| Native binary startup time | < 50ms |
| WASM load + init time | < 200ms (js/wasm), < 100ms (wasip1) |
| Standard Go WASM binary size | < 5 MB (< 1.5 MB gzipped) |
| TinyGo WASM binary size | < 500 KB (< 200 KB gzipped) |
| Parse throughput | > 10 MB/s on modern hardware |
| No data races | `go test -race` clean |
| Zero panics from fuzz testing | 8+ hours of fuzzing without crashes |
