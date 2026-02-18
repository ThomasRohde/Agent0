---
sidebar_position: 5
---

# Contributing

This page covers guidelines for contributing to the A0 language implementation.

## Language contribution rules

When adding a new language feature, you must update **all** of the following:

1. **Lexer tokens** (`packages/core/src/lexer.ts`) -- Add new tokens if the feature introduces new syntax
2. **Parser rules** (`packages/core/src/parser.ts`) -- Add grammar rules and CST-to-AST visitor functions
3. **AST node types** (`packages/core/src/ast.ts`) -- Define TypeScript types for new AST nodes
4. **Evaluator** (`packages/core/src/evaluator.ts`) -- Add a case to the `evalExpr` switch (or equivalent)
5. **Validator** (`packages/core/src/validator.ts`) -- Add semantic checks for the new construct
6. **Formatter** (`packages/core/src/formatter.ts`) -- Add formatting support so `a0 fmt` handles the new syntax

Additionally:
- **Trace impact** must be specified -- does the feature emit new trace events?
- **Tests** must be added, using golden tests where possible
- **Skills** must be updated if the feature changes tools, stdlib, diagnostics, or capabilities (see below)

## Testing

A0 uses Node's built-in test runner (`node --test`), not Jest or Vitest.

```bash
# Run all tests
npm test

# Run tests for a single package
npm run test -w packages/core
```

Tests run against compiled JavaScript in `dist/`, not TypeScript source. Always build before testing:

```bash
npm run build && npm test
```

### Golden tests

Where possible, use golden tests: provide an input `.a0` file and an expected output, then compare the actual output. This makes it easy to see what changed when a test fails.

## PR guidelines

- **Small PRs**: One logical change per PR. Do not bundle unrelated changes.
- **Preserve core invariants**: Every change must maintain A0's core design principles:
  - Structured data over strings
  - Explicit effects (`call?` vs `do`)
  - Capability gating (deny by default)
  - Evidence and trace output
- **Nondeterminism must be opt-in**: Any nondeterministic behavior must be visible in traces and explicitly requested by the program.

## Keeping skills in sync

The `.claude-plugin/` directory contains Claude Code skills for writing and debugging A0. When you change the language, update the skills concurrently:

| Change | Files to update |
|--------|----------------|
| New/changed tools or stdlib | `skills/write-a0/SKILL.md`, `skills/write-a0/references/tool-signatures.md` |
| New idiomatic patterns | `skills/write-a0/references/patterns.md` |
| New/changed diagnostic codes | `skills/debug-a0/SKILL.md`, `skills/debug-a0/references/diagnostics-guide.md` |
| New capabilities | Capabilities list in `skills/write-a0/SKILL.md` |
| Changed exit codes or CLI flags | Both skills' CLI reference sections |

## Build system

```bash
npm install                        # install dependencies
npm run build                      # build all packages (core -> std/tools -> cli)
npm test                           # run all tests
npm install -g ./packages/cli      # install CLI globally
```

The build order is strict: `@a0/core` must build first, then `@a0/std` and `@a0/tools` (which depend on core), then `a0` CLI (which depends on all three).

## Diagnostic codes

When adding new error conditions, assign a stable string diagnostic code following the existing convention:

| Prefix | Phase | Examples |
|--------|-------|---------|
| `E_LEX` | Lexer | Tokenization failure |
| `E_PARSE` | Parser | Grammar mismatch |
| `E_*` (validator) | Validation | `E_NO_RETURN`, `E_UNBOUND`, `E_DUP_BINDING` |
| `E_*` (runtime) | Evaluation | `E_TOOL`, `E_FN`, `E_BUDGET` |

Codes must be documented in `packages/core/src/diagnostics.ts` and added to the diagnostics guide skill reference.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | Parse or validation error |
| 3 | Capability denied |
| 4 | Runtime or tool error |
| 5 | Assertion or check failure (`assert` = fatal/halts, `check` = non-fatal/continues) |

New features should map to existing exit codes where possible. Adding a new exit code requires updating the CLI, both skills, and this documentation.
