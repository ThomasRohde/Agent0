---
sidebar_position: 3
---

# Validator

The validator performs semantic checks on the AST before execution. It catches errors that the parser cannot detect structurally, such as unbound variables, duplicate bindings, and capability mismatches.

**Source**: `packages/core/src/validator.ts`

## What the validator checks

### Return placement

- Every program and every block body (`fn`, `for`, `match` arm) must end with a `return` statement (`E_NO_RETURN`)
- `return` must be the last statement -- no statements may follow it (`E_RETURN_NOT_LAST`)

### Binding uniqueness

- No two `let` bindings in the same scope may have the same name (`E_DUP_BINDING`)
- `->` bindings (from tool calls, assert, check) also count as bindings
- Note: `assert` is fatal (halts on failure), `check` is non-fatal (records evidence and continues)

### Unbound variables

- Every variable reference must resolve to a binding in the current or parent scope (`E_UNBOUND`)
- The validator tracks which names are in scope at each point

### Capability declarations

- All capabilities declared in `cap { ... }` must be known capabilities: `fs.read`, `fs.write`, `http.get`, `sh.exec` (`E_UNKNOWN_CAP`)
- Capability values must be literal `true` (`E_CAP_VALUE`)
- Tools used with `call?` or `do` must have their capability declared in `cap` (`E_UNDECLARED_CAP`)

### Tool mode enforcement

- Read-mode tools (`fs.read`, `http.get`) can be used with either `call?` or `do`
- Effect-mode tools (`fs.write`, `sh.exec`) **must** use `do`, not `call?`
- Using `call?` with an effect-mode tool is a compile-time error (`E_CALL_EFFECT`)

### Budget fields

- Only known budget fields are allowed: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations` (`E_UNKNOWN_BUDGET`)
- Budget field values must be integer literals (`E_BUDGET_TYPE`)

### Known functions and tools

- Stdlib function calls must reference known stdlib names (`E_UNKNOWN_FN`)
- Tool calls must reference known tool names (`E_UNKNOWN_TOOL`)
- User-defined function names must be unique (`E_FN_DUP`)

## Scoped validation

The validator uses `validateBlockBindings` for nested scopes:

- **`fn` bodies**: Function parameters are added to the scope. The body is validated independently.
- **`for` bodies**: The loop variable (from `as`) is added to the scope. The body is validated independently.
- **`match` arms**: The bound variable from the arm pattern is added to the scope. Each arm body is validated independently.

In all cases, bindings from parent scopes are visible (closures), but child scope bindings do not leak out.

## Compile-time vs runtime

The validator runs at compile time (during `a0 check` or before `a0 run`). It catches as many errors as it can statically:

| Check | Phase | Diagnostic |
|-------|-------|------------|
| Return placement | Compile | `E_NO_RETURN`, `E_RETURN_NOT_LAST` |
| Duplicate bindings | Compile | `E_DUP_BINDING` |
| Unbound variables | Compile | `E_UNBOUND` |
| Unknown capabilities | Compile | `E_UNKNOWN_CAP` |
| Invalid capability value | Compile | `E_CAP_VALUE` |
| Undeclared capabilities | Compile | `E_UNDECLARED_CAP` |
| call? with effect tool | Compile | `E_CALL_EFFECT` |
| Unknown budget fields | Compile | `E_UNKNOWN_BUDGET` |
| Invalid budget value type | Compile | `E_BUDGET_TYPE` |
| Unknown functions | Compile | `E_UNKNOWN_FN` |
| Unknown tools | Compile | `E_UNKNOWN_TOOL` |
| Duplicate fn names | Compile | `E_FN_DUP` |
| Tool argument schemas | **Runtime** | `E_TOOL_ARGS` |
| Capability denied by policy | **Runtime** | `E_CAP_DENIED` |
| Budget exceeded | **Runtime** | `E_BUDGET` |

Tool argument validation happens at runtime because tool schemas are defined in the tools package, not in core. The validator does not have access to Zod schemas at compile time.

## Exit codes

Validation errors produce exit code 2. This is the same exit code for lexer and parser errors, since all three are pre-execution failures.
