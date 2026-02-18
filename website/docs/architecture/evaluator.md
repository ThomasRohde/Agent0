---
sidebar_position: 4
---

# Evaluator

The evaluator executes A0 programs step by step, managing scopes, tool calls, stdlib dispatch, budget enforcement, and trace emission.

**Source**: `packages/core/src/evaluator.ts`

## Execution model

The evaluator is an async, step-by-step interpreter. It walks the AST nodes produced by the parser and executes each one in sequence. There is no compilation to bytecode or intermediate representation.

### ExecOptions

The evaluator receives an `ExecOptions` object that configures the runtime:

```typescript
interface ExecOptions {
  allowedCapabilities: Set<string>;
  tools: Map<string, ToolDef>;
  stdlib: Map<string, StdlibFn>;
  trace?: (event: TraceEvent) => void;
  signal?: AbortSignal;
  runId: string;
}
```

| Field | Purpose |
|-------|---------|
| `allowedCapabilities` | Set of capabilities permitted by the policy |
| `tools` | Map of tool name to `ToolDef` implementation |
| `stdlib` | Map of stdlib function name to `StdlibFn` implementation |
| `trace` | Callback for emitting trace events |
| `signal` | AbortSignal for cancellation |
| `runId` | Unique identifier for the run |

## Environment and scoping

The `Env` class implements parent-chained scoping:

```typescript
class Env {
  private bindings: Map<string, A0Value>;
  private parent: Env | null;

  child(): Env;       // create a nested scope
  set(name, value);   // bind a name in this scope
  get(name): value;   // look up, walking parent chain
  has(name): boolean;  // check existence, walking parent chain
}
```

When resolving a variable, the evaluator checks the current scope first, then walks up the parent chain. This enables:
- **Let bindings** scoped to their containing block
- **Function parameters** scoped to the function body
- **For loop variables** scoped to the loop body
- **Match arm bindings** scoped to the arm body

## Name resolution

The evaluator resolves names in this order:

1. **Tool calls** (`call?` / `do`): Looked up in `ExecOptions.tools`
2. **Stdlib functions**: Looked up in `ExecOptions.stdlib`
3. **User-defined functions**: Looked up in the `userFns` map (populated by `fn` definitions)
4. **Variables**: Looked up in the current `Env` scope chain

## Key interfaces

### ToolDef

```typescript
interface ToolDef {
  name: string;
  mode: "read" | "effect";
  capabilityId: string;
  inputSchema?: unknown;   // Zod schema at runtime
  outputSchema?: unknown;
  execute(args: A0Record, signal?: AbortSignal): Promise<A0Value>;
}
```

Tools are async and may accept an `AbortSignal` for cancellation. The `mode` field determines whether the tool can be used with `call?` (read) or requires `do` (effect).

### StdlibFn

```typescript
interface StdlibFn {
  name: string;
  execute(args: A0Record): A0Value;
}
```

Stdlib functions are synchronous and pure. They throw on errors; the evaluator catches these and wraps them as `E_FN` diagnostics (exit 4).

## Budget enforcement

The evaluator tracks resource usage against declared budget limits:

| Budget field | What is tracked |
|-------------|-----------------|
| `timeMs` | Wall-clock elapsed time from run start |
| `maxToolCalls` | Number of tool invocations |
| `maxBytesWritten` | Bytes written by `fs.write` |
| `maxIterations` | Number of `for` loop iterations |

When a limit is exceeded, the evaluator emits a `budget_exceeded` trace event and throws an `A0RuntimeError` with code `E_BUDGET`.

## Trace events

The evaluator emits 16 trace event types via the `trace` callback:

| Event | When emitted |
|-------|-------------|
| `run_start` | Program execution begins |
| `run_end` | Program execution completes |
| `stmt_start` / `stmt_end` | Each statement |
| `tool_start` / `tool_end` | Each tool call (includes args and result) |
| `evidence` | Each `assert` or `check` |
| `budget_exceeded` | A budget limit is hit |
| `for_start` / `for_end` | Loop lifecycle |
| `fn_call_start` / `fn_call_end` | User function calls |
| `match_start` / `match_end` | Match expression evaluation |
| `map_start` / `map_end` | Map operation |

Each event includes a timestamp, the run ID, source span, and event-specific data.

## Error handling

| Scenario | Diagnostic | Exit code |
|----------|-----------|-----------|
| Tool execution failure | `E_TOOL` | 4 |
| Invalid tool arguments | `E_TOOL_ARGS` | 4 |
| Capability denied by policy | `E_CAP_DENIED` | 3 |
| Stdlib function error | `E_FN` | 4 |
| Assert failure (fatal -- halts immediately) | `E_ASSERT` | 5 |
| Check failure (non-fatal -- records evidence, continues; exit 5 after run) | `E_CHECK` | 5 |
| Budget exceeded | `E_BUDGET` | 4 |
| for input not a list | `E_FOR_NOT_LIST` | 4 |
| match input not a record | `E_MATCH_NOT_RECORD` | 4 |
| No match arm matched | `E_MATCH_NO_ARM` | 4 |
| Type error | `E_TYPE` | 4 |

## ExecResult

The evaluator returns an `ExecResult` with the program's return value, collected evidence, and any diagnostics:

```typescript
interface ExecResult {
  value: A0Value;
  evidence: Evidence[];
  diagnostics: Diagnostic[];
}
```
