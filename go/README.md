# A0 Go Runtime

Native Go implementation of the A0 language runtime, producing standalone binaries with zero external dependencies.

## Status

**Feature-complete** — the native runtime passes the full conformance suite (125/125 scenarios) shared with the TypeScript reference implementation.

### What's implemented

- **Lexer** — full tokenizer with all A0 v0.5 tokens
- **Parser** — complete grammar including arithmetic, comparisons, spread syntax, filter blocks, and loops
- **Validator** — semantic checks (scoping, capabilities, budgets, return placement, duplicate bindings)
- **Evaluator** — async execution with parent-chained scoping, closures, try/catch, trace events
- **Formatter** — canonical source code formatting
- **Stdlib** — 36 pure functions (data, predicates, lists, math, strings, records, higher-order)
- **Tools** — 6 built-in tools (fs.read, fs.list, fs.exists, fs.write, http.get, sh.exec)
- **Capabilities** — deny-by-default policy with project/user/override loading
- **Diagnostics** — structured error codes with spans and hints
- **CLI** — `run`, `check`, `fmt`, `trace`, `help`, `policy` commands with progressive-discovery help system

## Prerequisites

- Go 1.22 or later

## Build

```bash
cd go
go build ./cmd/a0
```

## Test

```bash
go test -race ./...
```

## Lint

```bash
go vet ./...
```

## Project Structure

```
cmd/
  a0/           Native CLI entry point
pkg/
  ast/          AST node types
  lexer/        Tokenizer
  parser/       Parser (tokens → AST)
  validator/    Semantic validation
  evaluator/    Runtime evaluator + value types
  formatter/    Source code formatter
  stdlib/       Standard library functions
  tools/        Built-in tools (fs, http, sh)
  runtime/      Top-level orchestrator (Run/Check/Format API)
  help/         Progressive-discovery help system
  capabilities/ Capability policy loading
  diagnostics/  Error codes and formatting
internal/
  testutil/     Shared test helpers
```

## Design

- **Zero external dependencies** — standard library only
- **`context.Context`** for cancellation (replaces TS `AbortSignal`)
- **Ordered records** — `A0Record` preserves insertion order (Go maps don't)
- **Interface-based AST** — `Node` interface with `Kind()` discriminator
- **Conformance testing** — shares scenario data with the TS reference implementation
