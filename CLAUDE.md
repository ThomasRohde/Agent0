# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is A0?

A0 is a small, structured scripting language and CLI interpreter designed for autonomous agents to generate and repair reliably. It favors structured values (records/lists) over strings, explicit effects (`call?` vs `do`), capability gating (deny-by-default), and machine-readable trace/evidence output.

## Build and Run

```bash
npm install
npm run build                # builds all packages in dependency order (core → std/tools → cli)
npm test                     # runs tests across all workspaces
npm install -g ./packages/cli  # install a0 CLI globally
```

Build must happen before tests — tests run against compiled JS in `dist/` (not TS source directly).

**After a successful build and test, always reinstall the CLI globally** with `npm install -g ./packages/cli`. This ensures the globally available `a0` command reflects the latest changes.

Run a single package's tests:
```bash
npm run test -w packages/core
```

Run the CLI after building:
```bash
a0 run examples/hello.a0
a0 check examples/hello.a0
a0 fmt examples/hello.a0
```

Tests use Node's built-in test runner (`node --test`), not Jest or Vitest.

## Monorepo Structure

npm workspaces with four packages, strict dependency order:

- **`@a0/core`** (`packages/core`) — Lexer (Chevrotain), CST parser, AST types, semantic validator, evaluator, formatter, capability policy loader. This is the foundation — all other packages depend on it.
- **`@a0/std`** (`packages/std`) — Pure stdlib functions: `parse.json`, `get`/`put` (path ops), `patch` (JSON Patch), predicate helpers (`eq`, `contains`, `not`, `and`, `or`), list ops (`len`, `append`, `concat`, `sort`, `filter`, `find`, `range`, `join`), string ops (`str.concat`, `str.split`, `str.starts`, `str.replace`), and record ops (`keys`, `values`, `merge`). Implements the `StdlibFn` interface from core.
- **`@a0/tools`** (`packages/tools`) — Built-in side-effectful tools: `fs.read`, `fs.write`, `http.get`, `sh.exec`. Implements the `ToolDef` interface from core. Uses Zod for schema validation.
- **`a0`** (`packages/cli`) — Commander-based CLI with four commands: `run`, `check`, `fmt`, `trace`. Wires core + std + tools together.

All packages are ESM (`"type": "module"`) targeting ES2022, with TypeScript compiled via `tsc`. Each package has its own `tsconfig.json` extending `tsconfig.base.json`.

## Architecture: How a Program Executes

1. **Lexer** (`core/src/lexer.ts`) — Chevrotain tokenizer. Token order matters: keywords before `Ident`, `FloatLit` before `IntLit`.
2. **Parser** (`core/src/parser.ts`) — Chevrotain CST parser → CST-to-AST visitor functions produce typed AST nodes. Includes arithmetic/comparison expression rules with standard precedence. AST node types include `BinaryExpr` (for `+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `==`, `!=`) and `UnaryExpr` (for unary `-`). Parenthesized grouping `( )` is supported for controlling precedence.
3. **Validator** (`core/src/validator.ts`) — Semantic checks: `return` required and last, known capabilities, unique bindings, no unbound variables, declared capabilities match used tools, known budget fields. Scoped validation for `fn`/`for`/`match` block bodies via `validateBlockBindings`.
4. **Evaluator** (`core/src/evaluator.ts`) — Step-by-step async execution. `Env` class with parent-chained scoping. Tool calls go through `ExecOptions.tools` map; stdlib through `ExecOptions.stdlib` map; user-defined functions through `userFns` map. Emits trace events via callback.
5. **Capabilities** (`core/src/capabilities.ts`) — Policy loaded from `.a0policy.json` (project) → `~/.a0/policy.json` (user) → deny-all default. `--unsafe-allow-all` overrides for dev.

Key interfaces defined in the evaluator that tools/stdlib implement:
- `ToolDef`: `{ name, mode: "read"|"effect", capabilityId, execute(args, signal?), inputSchema?, outputSchema? }`
- `StdlibFn`: `{ name, execute(args) }`

**Stdlib error model:** Stdlib functions throw on errors (never return `{err:...}` records). The evaluator's try/catch wraps thrown errors as `E_FN` (exit 4). This ensures consistent, documented error behavior — programs that need to handle failures should validate inputs before calling stdlib functions.

## Language Contribution Rules

When adding language features, you must update all of: lexer tokens, parser rules, AST node types (`ast.ts`), the evaluator's `evalExpr` switch, the validator, and the formatter. Add tests (golden where possible). Trace impact must be specified.

## Exit Codes

0 = success, 2 = parse/validation, 3 = capability denied, 4 = runtime/tool error, 5 = assertion/check failed.

## Diagnostic Codes

Stable string codes: `E_LEX`, `E_PARSE`, `E_AST`, `E_NO_RETURN`, `E_RETURN_NOT_LAST`, `E_UNKNOWN_CAP`, `E_DUP_BINDING`, `E_UNBOUND`, `E_TOOL_ARGS`, `E_UNKNOWN_TOOL`, `E_CALL_EFFECT`, `E_CAP_DENIED`, `E_TOOL`, `E_UNKNOWN_FN`, `E_FN`, `E_ASSERT`, `E_CHECK`, `E_PATH`, `E_UNDECLARED_CAP`, `E_BUDGET`, `E_UNKNOWN_BUDGET`, `E_FN_DUP`, `E_FOR_NOT_LIST`, `E_MATCH_NOT_RECORD`, `E_MATCH_NO_ARM`, `E_TYPE`.

## Keywords

Reserved keywords (lexer tokens): `cap`, `budget`, `import`, `as`, `let`, `return`, `call?`, `do`, `assert`, `check`, `true`, `false`, `null`, `if`, `for`, `fn`, `match`.

Note: `ok`, `err`, `in`, `cond`, `then`, `else` are NOT keywords — they are parsed as identifiers or record keys.

**Diagnostic phase notes:** `E_CALL_EFFECT` is a compile-time error (caught by `a0 check`, exit 2). `E_TOOL_ARGS` is a runtime error (exit 4) — tool arg schemas are validated at execution time, not statically.

## Trace Events

`run_start`, `run_end`, `stmt_start`, `stmt_end`, `tool_start`, `tool_end`, `evidence`, `budget_exceeded`, `for_start`, `for_end`, `fn_call_start`, `fn_call_end`, `match_start`, `match_end`.

## Budget Fields

`timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations`.

## A0 Language Skills (Plugin)

The `.claude-plugin/` directory contains a project-local Claude Code plugin with two skills for writing and debugging A0 programs (`skills/write-a0/` and `skills/debug-a0/`). These skills teach Claude the A0 syntax, tool signatures, stdlib, idiomatic patterns, and error diagnostics.

**Keep skills in sync with the language.** When changing A0 capabilities — adding tokens, tools, stdlib functions, diagnostic codes, or modifying the evaluator/validator — update the corresponding skill files concurrently:

- New/changed **tools or stdlib** → update `skills/write-a0/SKILL.md` (tool table, stdlib table) and `skills/write-a0/references/tool-signatures.md`
- New **idiomatic patterns** → update `skills/write-a0/references/patterns.md`
- New/changed **diagnostic codes** → update `skills/debug-a0/SKILL.md` (quick reference tables) and `skills/debug-a0/references/diagnostics-guide.md`
- New **capabilities** → update the capabilities list in `skills/write-a0/SKILL.md`
- Changed **exit codes or CLI flags** → update both skills' CLI reference sections
