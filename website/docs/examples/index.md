---
sidebar_position: 1
---

# Examples

These annotated walkthroughs cover the key features of A0. Each example is a complete, runnable program with line-by-line explanations.

## Getting started

- **[Minimal program](./minimal.md)** -- Comments, let bindings, records, and return. The simplest possible A0 program.

## Working with data

- **[HTTP fetch and transform](./http-fetch.md)** -- Fetch JSON from an API, extract fields, and write results to a file.
- **[File transform](./file-transform.md)** -- Read a file, parse JSON, build a report using `get`, `put`, and `patch`.
- **[Arithmetic and expressions](./arithmetic.md)** -- Arithmetic operators, comparison operators, and stdlib functions like `range`, `sort`, and `keys`.

## Control flow

- **[Iteration and map](./iteration-and-map.md)** -- `for` loops for side-effectful iteration and `map` for pure transformations.
- **[Pattern matching](./pattern-matching.md)** -- `if` expressions, ok/err records, and `match` for discriminated dispatch.

## System interaction

- **[Shell commands](./shell-commands.md)** -- Run shell commands with `sh.exec`, enforce budgets, and build evidence trails.

## Running examples

All examples live in the `examples/` directory. To run one:

```bash
# Build first (tests and CLI run from compiled JS)
npm run build

# Run with --unsafe-allow-all for development
a0 run --unsafe-allow-all examples/hello.a0

# Or with a policy file for capability gating
a0 run examples/hello.a0

# Run with tracing to see execution details
a0 run --trace trace.jsonl --unsafe-allow-all examples/system-check.a0
```

Validate a program without running it:

```bash
a0 check examples/hello.a0
```

Format a program:

```bash
a0 fmt examples/hello.a0
```
