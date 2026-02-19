---
sidebar_position: 1
---

# Architecture Overview

A0 is structured as an npm workspaces monorepo with four packages in a strict dependency order.

## Package structure

```
packages/
  core/     @a0/core    Lexer, parser, AST, validator, evaluator, formatter, capabilities
  std/      @a0/std     Pure stdlib functions
  tools/    @a0/tools   Built-in side-effectful tools (Zod validation)
  cli/      a0          Commander-based CLI
```

### Dependency order

```
core  -->  std
      -->  tools
      -->  cli (depends on core + std + tools)
```

`@a0/core` is the foundation. All other packages depend on it. `@a0/std` and `@a0/tools` are siblings that both depend on core. The `a0` CLI package depends on all three, wiring them together.

## @a0/core (packages/core)

The core package contains the language implementation:

| Module | Purpose |
|--------|---------|
| `lexer.ts` | Chevrotain tokenizer -- keywords, literals, operators |
| `parser.ts` | Chevrotain CST parser with CST-to-AST visitor |
| `ast.ts` | TypeScript types for all AST nodes |
| `validator.ts` | Semantic checks (return placement, capability matching, binding uniqueness) |
| `evaluator.ts` | Step-by-step async execution engine |
| `formatter.ts` | Source code formatter |
| `capabilities.ts` | Policy file loader (project, user, deny-all default) |
| `diagnostics.ts` | Diagnostic code definitions and helpers |

The core package defines the key interfaces that std and tools implement:

- **`ToolDef`**: `{ name, mode: "read" | "effect", capabilityId, execute(args, signal?) }`
- **`StdlibFn`**: `{ name, execute(args) }`

## @a0/std (packages/std)

Pure stdlib functions with no side effects. All functions implement the `StdlibFn` interface:

- **Data**: `parse.json`, `get`, `put`, `patch`
- **Predicates**: `eq`, `contains`, `not`, `and`, `or`
- **Lists**: `len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`, `map`
- **Strings**: `str.concat`, `str.split`, `str.starts`, `str.replace`
- **Records**: `keys`, `values`, `merge`

Stdlib functions throw on errors. The evaluator catches thrown errors and wraps them as `E_FN` diagnostics (exit 4).

## @a0/tools (packages/tools)

Built-in side-effectful tools implementing the `ToolDef` interface. Each tool uses Zod for input schema validation:

| Tool | Mode | Capability | Purpose |
|------|------|------------|---------|
| `fs.read` | read | `fs.read` | Read file contents |
| `fs.write` | effect | `fs.write` | Write data to a file |
| `http.get` | read | `http.get` | HTTP GET request |
| `sh.exec` | effect | `sh.exec` | Execute shell command |

Tool argument schemas are validated at runtime, not statically. Invalid arguments produce `E_TOOL_ARGS` (exit 4).

## a0 CLI (packages/cli)

Commander-based CLI with six commands:

| Command | Purpose |
|---------|---------|
| `a0 run` | Execute an A0 program |
| `a0 check` | Validate without executing |
| `a0 fmt` | Format source code |
| `a0 trace` | Summarize a trace file |
| `a0 policy` | Show effective policy resolution and allowlist |
| `a0 help` | Show built-in language/runtime help topics |

The CLI wires together core, std, and tools: it registers all stdlib functions and tools with the evaluator, loads capability policies, and handles trace output.

## Build system

- All packages use ESM (`"type": "module"`) targeting ES2022
- TypeScript compiled via `tsc` with each package extending `tsconfig.base.json`
- **Build must happen before tests** -- tests run against compiled JS in `dist/`, not TS source
- Tests use Node's built-in test runner (`node --test`)

```bash
npm install          # install dependencies
npm run build        # build all packages in dependency order
npm test             # run all tests
```

## Execution pipeline

A program flows through these stages:

1. **Lexing** -- source text to tokens
2. **Parsing** -- tokens to CST to AST
3. **Validation** -- semantic checks on the AST
4. **Evaluation** -- step-by-step execution of AST nodes

See the individual architecture pages for details on each stage:
- [Lexer and Parser](./lexer-parser.md)
- [Validator](./validator.md)
- [Evaluator](./evaluator.md)
