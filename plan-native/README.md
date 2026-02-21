# A0 Go/WASM Runtime — Implementation Plan

## Executive Summary

This plan describes a portable A0 language runtime written in Go, compilable to WebAssembly. The Go runtime will be a faithful reimplementation of the existing TypeScript reference runtime (`@a0/core`, `@a0/std`, `@a0/tools`, `a0` CLI), enabling A0 programs to run in browsers, edge functions, and sandboxed environments with a smaller binary footprint and consistent execution semantics across all platforms.

### Why Go?

| Concern | TypeScript (current) | Go (planned) |
|---------|---------------------|--------------|
| **Binary size** | ~50 MB (Node.js + deps) | ~5 MB native, ~1-3 MB WASM (TinyGo) |
| **Startup time** | ~200 ms (Node.js cold start) | ~5 ms native, ~50 ms WASM |
| **Browser execution** | Not supported | WASM module loadable in any browser |
| **Edge functions** | Requires Node.js runtime | WASM runs on Cloudflare Workers, Vercel Edge, Deno Deploy, Fastly Compute |
| **Sandboxing** | Process-level only | WASI capability-based (aligns with A0's capability model) |
| **Cross-compilation** | N/A | linux/darwin/windows (amd64/arm64) + wasm/js + wasip1 |
| **Dependencies** | Chevrotain, Zod, Commander | Zero external dependencies (hand-written lexer/parser) |

### Goals

1. **Run A0 programs in browsers** via WASM with JavaScript bridge for tools
2. **Deploy to edge functions** (Cloudflare Workers, Vercel Edge, etc.) via WASI
3. **Smaller binary footprint** — 10-100x smaller than Node.js distribution
4. **Consistent execution semantics** — bit-identical behavior to the TypeScript runtime for all valid programs
5. **WASI support** for sandboxed file and network access
6. **Embeddable library** — Go API for integrating A0 into Go applications
7. **NPM package** wrapping the WASM binary for drop-in Node.js compatibility

### Non-Goals

- Replacing the TypeScript runtime (both will coexist)
- Adding new language features (the Go runtime implements the same A0 spec)
- JIT compilation or performance beyond "fast enough"
- Supporting Go as a tool implementation language (tools remain defined via `ToolDef` interface)

---

## Architecture Overview

```
Source Text
    |
    v
+----------+     +---------+     +-------+     +-----------+     +-----------+
|  Lexer   | --> | Parser  | --> |  AST  | --> | Validator | --> | Evaluator |
| (tokens) |     | (recur- |     | types |     | (semantic |     | (step-by- |
|          |     |  sive   |     |       |     |  checks)  |     |  step)    |
+----------+     | descent)|     +-------+     +-----------+     +-----------+
                 +---------+                                          |
                                                                      v
                                                                +-----------+
                                                                | ExecResult|
                                                                |  + Trace  |
                                                                |  + Evid.  |
                                                                +-----------+

Formatter: AST --> Canonical Source Text (separate read path)
```

**Go package layout:**

```
github.com/agent0/a0-go/
  cmd/a0/          CLI entry point (Cobra)
  pkg/
    ast/           AST node types (interface sum types)
    lexer/         Hand-written scanner
    parser/        Recursive-descent parser
    validator/     Semantic validation
    evaluator/     Step-by-step executor
    formatter/     Pretty-printer
    stdlib/        Pure stdlib functions (34 functions)
    tools/         Built-in tools (6 tools, platform-specific)
    runtime/       A0Value types, Env scope chain
    capabilities/  Policy loading and enforcement
    diagnostics/   Error codes and reporting
```

**Key design decisions:**
- **Hand-written lexer and recursive-descent parser** (no parser generator) for minimal binary size, WASM compatibility, and full control over error messages
- **Interface-based sum types** for A0Value (Null, Bool, Number, String, List, Record)
- **`context.Context`** for cancellation/timeout (replacing Node.js AbortSignal)
- **Build tags** for platform-specific tool implementations (native vs WASI vs browser)
- **Zero external dependencies** in the core runtime

---

## Plan Documents

| # | Document | Description |
|---|----------|-------------|
| 1 | [01-architecture.md](01-architecture.md) | System architecture, Go package layout, key interfaces (A0Value, ToolDef, StdlibFn, ExecOptions), memory model, async execution, environment/scope chain, plugin architecture, capability policy loading |
| 2 | [02-lexer-parser.md](02-lexer-parser.md) | Hand-written lexer design, token type mapping (22 keywords, operators, literals), token ordering rules, recursive-descent parser, complete AST node types in Go, operator precedence, error recovery |
| 3 | [03-evaluator.md](03-evaluator.md) | Value model, environment scope chain, tool call execution pipeline, stdlib execution, user-defined functions with closures, higher-order functions (map/filter/reduce), all control flow constructs, truthiness rules, budget tracking, trace events, evidence collection, error model |
| 4 | [04-wasm-wasi.md](04-wasm-wasi.md) | TinyGo vs standard Go for WASM, WASI Preview 1/2, capability-to-WASI mapping, browser execution model with JS bridge, async bridging (Asyncify), edge function deployment (Cloudflare/Vercel/Deno/Fastly), performance analysis, host function interface |
| 5 | [05-stdlib-tools.md](05-stdlib-tools.md) | All 34 stdlib functions with Go implementations, all 6 tools with Go implementations, schema validation (replacing Zod), tool registry, platform-specific tool backends (native/WASI/browser) |
| 6 | [06-cli-embedding.md](06-cli-embedding.md) | Cobra-based CLI (run/check/fmt/trace/policy/help), exit code contract, embedding API with Option pattern, WASM embedding with JS interop, NPM package distribution, cross-compilation matrix |
| 7 | [07-testing-conformance.md](07-testing-conformance.md) | Conformance test suite (~125 scenarios), unit tests per module, golden tests, differential testing, fuzz testing, CI pipeline, cross-platform matrix (6 native + 3 WASM targets), coverage requirements |
| 8 | [08-roadmap.md](08-roadmap.md) | 9-phase implementation plan (bootstrap through v1.0), milestone definitions, acceptance criteria, risk register, parallel work opportunities |

---

## Implementation Phases

| Phase | Name | Deliverable | Conformance |
|-------|------|-------------|-------------|
| 0 | **Project Bootstrap** | Go module, CI, tooling | 0 scenarios |
| 1 | **Core MVP** | Lexer + parser + validator + basic evaluator | ~30 scenarios |
| 2 | **Full Evaluator** | All control flow, functions, closures | ~60 scenarios |
| 3 | **Stdlib** | All 34 stdlib functions | ~80 scenarios |
| 4 | **Tools (Native)** | fs.read/write/list/exists, http.get, sh.exec | ~100 scenarios |
| 5 | **CLI + Formatter** | Full CLI parity, formatter, trace output | ~125 scenarios |
| 6 | **WASM + WASI** | js/wasm, wasip1/wasm, TinyGo builds | ~125 (WASM) |
| 7 | **Browser Embedding** | NPM package, JS API, playground | N/A |
| 8 | **Polish + Release** | Docs, benchmarks, packaging | v1.0 |

**Guiding principle:** Conformance before features. Each phase produces a testable artifact that passes a growing subset of the reference test suite.

---

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TinyGo missing Go features | Medium | High | Standard Go fallback; test early with TinyGo |
| WASI immaturity for http/network | Medium | Medium | Host function bridge; JS fetch in browser |
| Go/WASM async bridging complexity | Medium | High | Asyncify; Web Worker alternative |
| Binary size exceeding targets | Low | Medium | TinyGo + wasm-opt; tree shaking |
| Behavioral divergence from TS runtime | Medium | High | Shared conformance suite gates all releases |

---

## Relationship to Existing Runtime

The Go runtime is a **second implementation** of the A0 language specification. It does not replace the TypeScript runtime — both will coexist:

- **TypeScript runtime** (`@a0/core` + CLI): Development reference, Node.js ecosystem integration, rapid prototyping
- **Go runtime** (`a0-go`): Portable deployment (browser, edge, WASI), embedded use, smaller footprint

Language changes are made in the TypeScript runtime first, then ported to Go. The shared conformance test suite ensures both runtimes produce identical results.
