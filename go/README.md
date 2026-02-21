# A0 Go Runtime

Native Go implementation of the A0 language runtime, targeting both native binaries and WebAssembly (WASM).

This is a work-in-progress reimplementation of the TypeScript reference runtime found in `../packages/core/`.

## Status

**Phase 0: Project Bootstrap** — scaffold, types, and CI are in place. No runtime logic yet.

See [`../plan-native/`](../plan-native/) for the full implementation roadmap.

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

## WASM Build

```bash
GOOS=js GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasm
```

## Project Structure

```
cmd/
  a0/           Native CLI entry point
  a0-wasm/      WASM entry point
pkg/
  ast/          AST node types
  lexer/        Tokenizer
  parser/       Parser (tokens → AST)
  validator/    Semantic validation
  evaluator/    Runtime evaluator + value types
  formatter/    Source code formatter
  stdlib/       Standard library functions
  tools/        Built-in tools (fs, http, sh)
  runtime/      Top-level orchestrator
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
