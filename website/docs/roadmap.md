---
sidebar_position: 100
---

# Roadmap

A0 is under active development. Here is the current status and planned direction.

## Current: v0.3.6

The current release includes the full core language:

- Lexer, parser, validator, evaluator, and formatter
- Data types: integers, floats, booleans, strings, null, records, lists
- Arithmetic and comparison expressions with standard precedence
- Control flow: `if`, `for`, `match`
- User-defined functions with `fn` and higher-order `map`
- Four built-in tools: `fs.read`, `fs.write`, `http.get`, `sh.exec`
- Standard library: data manipulation, predicates, list/string/record operations
- Capability-gated execution with deny-by-default policy
- Budget system for resource limits
- Evidence system with `assert` and `check`
- JSONL trace output for auditing and debugging
- CLI with `run`, `check`, `fmt`, and `trace` commands

## v0.4 -- Go/WASM Runtime

Planned: a portable runtime written in Go, compilable to WebAssembly.

- Run A0 programs in browsers, edge functions, and sandboxed environments
- Smaller binary footprint than the Node.js runtime
- Consistent execution semantics across platforms
- WASI support for file and network access

## v0.5 -- Plugin System

Planned: extensibility through custom tool plugins.

- Define custom tools with typed input/output schemas
- Package and distribute tool plugins via npm or standalone
- Plugin isolation and capability enforcement
- Community tool ecosystem

## Future

Ideas under consideration for future releases:

- **Additional stdlib functions** -- more string operations, math functions, date/time utilities
- **Async tool execution** -- parallel tool calls for independent operations
- **Import system** -- reuse code across A0 programs with `import`
- **Richer type checking** -- optional static type annotations
- **Language server** -- IDE support with diagnostics, completion, and hover
