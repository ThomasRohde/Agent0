# 01 - System Architecture and Module Design

## Overview

This document describes the architecture for a native Go implementation of the A0 language runtime, targeting both standalone CLI usage and WebAssembly (WASM) compilation. The design mirrors the current TypeScript implementation's pipeline (lexer, parser, validator, evaluator, formatter) while leveraging Go's strengths: static typing, goroutines for async tool execution, small binaries, and first-class WASM/WASI support.

## Pipeline Architecture

The A0 execution pipeline is a linear chain of transformations:

```
Source Text
    |
    v
+----------+     +---------+     +-------+     +-----------+     +-----------+
|  Lexer   | --> | Parser  | --> |  AST  | --> | Validator | --> | Evaluator |
| (tokens) |     | (CST →  |     | types |     | (semantic |     | (step-by- |
|          |     |   AST)  |     |       |     |  checks)  |     |  step)    |
+----------+     +---------+     +-------+     +-----------+     +-----------+
                                                                       |
                                                                       v
                                                                 +-----------+
                                                                 | ExecResult|
                                                                 |  + Trace  |
                                                                 +-----------+
```

The formatter operates as a separate read path: `AST -> Formatter -> Source Text`.

## Go Package Layout

The Go module follows a single-module monorepo approach with internal packages enforcing the dependency order:

```
github.com/a0-lang/a0/
├── go.mod
├── go.sum
├── cmd/
│   └── a0/                     # CLI binary entry point
│       └── main.go
├── pkg/
│   ├── ast/                    # AST node types and Span
│   │   └── ast.go
│   ├── lexer/                  # Tokenizer
│   │   ├── lexer.go
│   │   ├── tokens.go           # Token type constants
│   │   └── lexer_test.go
│   ├── parser/                 # Recursive-descent parser
│   │   ├── parser.go           # CST-to-AST (direct, no intermediate CST)
│   │   └── parser_test.go
│   ├── validator/              # Semantic validation
│   │   ├── validator.go
│   │   └── validator_test.go
│   ├── evaluator/              # Step-by-step async execution
│   │   ├── evaluator.go        # execute(), evalExpr(), evalBinaryOp()
│   │   ├── env.go              # Scope chain (Env struct)
│   │   ├── value.go            # A0Value type hierarchy
│   │   ├── budget.go           # Budget tracking and enforcement
│   │   └── evaluator_test.go
│   ├── formatter/              # Canonical pretty-printer
│   │   ├── formatter.go
│   │   └── formatter_test.go
│   ├── diagnostics/            # Diagnostic codes, types, formatting
│   │   └── diagnostics.go
│   ├── capabilities/           # Policy loading and enforcement
│   │   ├── policy.go
│   │   └── policy_test.go
│   ├── stdlib/                 # Pure stdlib functions
│   │   ├── registry.go         # StdlibFn interface + registration
│   │   ├── parse_json.go
│   │   ├── path_ops.go         # get, put
│   │   ├── patch.go            # JSON Patch (patch)
│   │   ├── predicates.go       # eq, contains, not, and, or, coalesce, typeof
│   │   ├── list_ops.go         # len, append, concat, sort, filter, find, etc.
│   │   ├── string_ops.go       # str.concat, str.split, str.starts, etc.
│   │   ├── record_ops.go       # keys, values, merge, entries
│   │   ├── math_ops.go         # math.max, math.min
│   │   └── stdlib_test.go
│   ├── tools/                  # Built-in side-effectful tools
│   │   ├── registry.go         # ToolDef interface + registration
│   │   ├── fs_tools.go         # fs.read, fs.write, fs.list, fs.exists
│   │   ├── http_tools.go       # http.get
│   │   ├── sh_tools.go         # sh.exec
│   │   └── tools_test.go
│   └── runtime/                # Top-level orchestrator
│       ├── runtime.go          # Wires lexer+parser+validator+evaluator
│       └── runtime_test.go
└── internal/
    └── testutil/               # Shared test helpers (golden files, fixtures)
        └── golden.go
```

### Dependency Graph

```
cmd/a0 ──────────────────┐
                          v
                     pkg/runtime
                     /    |    \
                    v     v     v
          pkg/evaluator  pkg/validator  pkg/formatter
           /  |  \           |              |
          v   v   v          v              v
  pkg/stdlib pkg/tools  pkg/ast         pkg/ast
          \   |         /
           v  v        v
          pkg/ast
              |
              v
       pkg/diagnostics
              |
              v
          pkg/lexer (used by parser only)
```

Key constraints:
- `pkg/ast` and `pkg/diagnostics` have zero external dependencies
- `pkg/stdlib` depends only on `pkg/ast` (value types) — never on tools or evaluator
- `pkg/tools` depends on `pkg/ast` — never on evaluator internals
- `pkg/evaluator` depends on `pkg/ast`, `pkg/diagnostics`, `pkg/stdlib`, and `pkg/tools` (interfaces only)
- `cmd/a0` is the only package that imports everything

## Key Go Interfaces and Types

### A0Value: The Universal Value Type

A0 values are JSON-compatible: null, boolean, number (float64), string, list, and record. In Go, we use a tagged-union approach with an interface to avoid pervasive `interface{}`.

```go
package ast

// A0Value represents any A0 runtime value.
// Concrete types: A0Null, A0Bool, A0Number, A0String, A0List, A0Record.
type A0Value interface {
    a0Value() // marker method — seals the interface
    Type() string // "null", "boolean", "number", "string", "list", "record"
}

type A0Null   struct{}
type A0Bool   struct{ Value bool }
type A0Number struct{ Value float64 }
type A0String struct{ Value string }
type A0List   struct{ Elements []A0Value }
type A0Record struct{ Pairs *OrderedMap[string, A0Value] }

func (A0Null)   a0Value() {}
func (A0Bool)   a0Value() {}
func (A0Number) a0Value() {}
func (A0String) a0Value() {}
func (A0List)   a0Value() {}
func (A0Record) a0Value() {}

func (A0Null)   Type() string { return "null" }
func (A0Bool)   Type() string { return "boolean" }
func (A0Number) Type() string { return "number" }
func (A0String) Type() string { return "string" }
func (A0List)   Type() string { return "list" }
func (A0Record) Type() string { return "record" }
```

**Design rationale:** A sealed interface with concrete struct types gives us exhaustive switch-case checking at compile time (via linters like `exhaustive`), avoids `interface{}` ambiguity, and makes the type hierarchy explicit. Using `float64` for all numbers matches JavaScript semantics and JSON (A0 distinguishes int/float at the syntax level but both are `float64` at runtime, consistent with the TypeScript implementation).

**OrderedMap:** A0 records preserve insertion order (matching JavaScript object semantics). The `A0Record` type uses a custom `OrderedMap[K, V]` that maintains both a `map[string]A0Value` for O(1) lookup and a `[]string` slice for iteration order. This is a simple struct:

```go
type OrderedMap[K comparable, V any] struct {
    keys   []K
    values map[K]V
}
```

### Span: Source Location

```go
package ast

type Span struct {
    File     string
    StartLine int
    StartCol  int
    EndLine   int
    EndCol    int
}
```

### AST Nodes

AST nodes use Go interfaces with a discriminated kind, mirroring the TypeScript `kind` field:

```go
package ast

type Node interface {
    Kind() string
    GetSpan() Span
}

// BaseNode provides shared span storage.
type BaseNode struct {
    Span Span
}

func (b BaseNode) GetSpan() Span { return b.Span }

// --- Expression nodes ---
type Expr interface {
    Node
    exprNode() // sealed marker
}

type IntLiteral struct {
    BaseNode
    Value int64 // stored as int64 for precision; converted to float64 at eval time
}
func (IntLiteral) Kind() string { return "IntLiteral" }
func (IntLiteral) exprNode()    {}

type FloatLiteral struct {
    BaseNode
    Value float64
}
func (FloatLiteral) Kind() string { return "FloatLiteral" }
func (FloatLiteral) exprNode()    {}

type BoolLiteral struct {
    BaseNode
    Value bool
}

type StrLiteral struct {
    BaseNode
    Value string
}

type NullLiteral struct{ BaseNode }

type IdentPath struct {
    BaseNode
    Parts []string
}

type RecordExpr struct {
    BaseNode
    Pairs []RecordEntry // RecordPair | SpreadPair
}

type RecordPair struct {
    BaseNode
    Key   string
    Value Expr
}

type SpreadPair struct {
    BaseNode
    Expr Expr
}

type ListExpr struct {
    BaseNode
    Elements []Expr
}

type CallExpr struct {
    BaseNode
    Tool *IdentPath
    Args *RecordExpr
}

type DoExpr struct {
    BaseNode
    Tool *IdentPath
    Args *RecordExpr
}

// ... (BinaryExpr, UnaryExpr, IfExpr, IfBlockExpr, ForExpr,
//      MatchExpr, TryExpr, FilterBlockExpr, LoopExpr, FnCallExpr,
//      AssertExpr, CheckExpr follow the same pattern)

type BinaryOp string
const (
    OpAdd  BinaryOp = "+"
    OpSub  BinaryOp = "-"
    OpMul  BinaryOp = "*"
    OpDiv  BinaryOp = "/"
    OpMod  BinaryOp = "%"
    OpGt   BinaryOp = ">"
    OpLt   BinaryOp = "<"
    OpGtEq BinaryOp = ">="
    OpLtEq BinaryOp = "<="
    OpEqEq BinaryOp = "=="
    OpNeq  BinaryOp = "!="
)

type BinaryExpr struct {
    BaseNode
    Op    BinaryOp
    Left  Expr
    Right Expr
}

// --- Statement nodes ---
type Stmt interface {
    Node
    stmtNode()
}

type LetStmt struct {
    BaseNode
    Name  string
    Value Expr
}

type ExprStmt struct {
    BaseNode
    Expr   Expr
    Target *IdentPath // optional -> binding
}

type ReturnStmt struct {
    BaseNode
    Value Expr
}

type FnDecl struct {
    BaseNode
    Name   string
    Params []string
    Body   []Stmt
}

// --- Header nodes ---
type Header interface {
    Node
    headerNode()
}

type CapDecl struct {
    BaseNode
    Capabilities *RecordExpr
}

type BudgetDecl struct {
    BaseNode
    Budget *RecordExpr
}

type ImportDecl struct {
    BaseNode
    Path  string
    Alias string
}

// --- Top-level ---
type Program struct {
    BaseNode
    Headers    []Header
    Statements []Stmt
}
```

### Diagnostic

```go
package diagnostics

import "github.com/a0-lang/a0/pkg/ast"

type Diagnostic struct {
    Code    string
    Message string
    Span    *ast.Span // nil for global diagnostics
    Hint    string    // optional remediation hint
}

// Stable diagnostic codes
const (
    ELex           = "E_LEX"
    EParse         = "E_PARSE"
    EAst           = "E_AST"
    ENoReturn      = "E_NO_RETURN"
    EReturnNotLast = "E_RETURN_NOT_LAST"
    EUnknownCap    = "E_UNKNOWN_CAP"
    EDupBinding    = "E_DUP_BINDING"
    EUnbound       = "E_UNBOUND"
    EToolArgs      = "E_TOOL_ARGS"
    EUnknownTool   = "E_UNKNOWN_TOOL"
    ECallEffect    = "E_CALL_EFFECT"
    ECapDenied     = "E_CAP_DENIED"
    ETool          = "E_TOOL"
    EUnknownFn     = "E_UNKNOWN_FN"
    EFn            = "E_FN"
    EAssert        = "E_ASSERT"
    ECheck         = "E_CHECK"
    EPath          = "E_PATH"
    EUndeclaredCap = "E_UNDECLARED_CAP"
    EBudget        = "E_BUDGET"
    EUnknownBudget = "E_UNKNOWN_BUDGET"
    EFnDup         = "E_FN_DUP"
    EForNotList    = "E_FOR_NOT_LIST"
    EMatchNotRecord= "E_MATCH_NOT_RECORD"
    EMatchNoArm    = "E_MATCH_NO_ARM"
    EType          = "E_TYPE"
)
```

### ToolDef Interface

```go
package tools

import (
    "context"
    "github.com/a0-lang/a0/pkg/ast"
)

type ToolMode string
const (
    ModeRead   ToolMode = "read"
    ModeEffect ToolMode = "effect"
)

// ToolDef defines a built-in or user-provided tool.
type ToolDef struct {
    Name         string
    Mode         ToolMode
    CapabilityID string
    Execute      func(ctx context.Context, args ast.A0Record) (ast.A0Value, error)
    InputSchema  interface{} // optional; for future JSON Schema validation
    OutputSchema interface{} // optional
}
```

**Key difference from TypeScript:** Go uses `context.Context` instead of `AbortSignal` for cancellation propagation. This is idiomatic Go and provides the same functionality (deadline, cancellation, values).

### StdlibFn Interface

```go
package stdlib

import "github.com/a0-lang/a0/pkg/ast"

// StdlibFn defines a pure standard library function.
// Stdlib functions are synchronous — they never perform I/O.
type StdlibFn struct {
    Name    string
    Execute func(args ast.A0Record) (ast.A0Value, error)
}
```

**Error model:** Like TypeScript, stdlib functions return errors (Go-idiomatic) rather than error records. The evaluator wraps these as `E_FN` diagnostics.

### ExecOptions and ExecResult

```go
package evaluator

import (
    "context"
    "github.com/a0-lang/a0/pkg/ast"
    "github.com/a0-lang/a0/pkg/diagnostics"
    "github.com/a0-lang/a0/pkg/stdlib"
    "github.com/a0-lang/a0/pkg/tools"
)

type TraceEventType string
const (
    TraceRunStart     TraceEventType = "run_start"
    TraceRunEnd       TraceEventType = "run_end"
    TraceStmtStart    TraceEventType = "stmt_start"
    TraceStmtEnd      TraceEventType = "stmt_end"
    TraceToolStart    TraceEventType = "tool_start"
    TraceToolEnd      TraceEventType = "tool_end"
    TraceEvidence     TraceEventType = "evidence"
    TraceBudgetExceeded TraceEventType = "budget_exceeded"
    TraceForStart     TraceEventType = "for_start"
    TraceForEnd       TraceEventType = "for_end"
    TraceFnCallStart  TraceEventType = "fn_call_start"
    TraceFnCallEnd    TraceEventType = "fn_call_end"
    TraceMatchStart   TraceEventType = "match_start"
    TraceMatchEnd     TraceEventType = "match_end"
    TraceMapStart     TraceEventType = "map_start"
    TraceMapEnd       TraceEventType = "map_end"
    TraceReduceStart  TraceEventType = "reduce_start"
    TraceReduceEnd    TraceEventType = "reduce_end"
    TraceFilterStart  TraceEventType = "filter_start"
    TraceFilterEnd    TraceEventType = "filter_end"
    TraceLoopStart    TraceEventType = "loop_start"
    TraceLoopEnd      TraceEventType = "loop_end"
)

type TraceEvent struct {
    Timestamp string         `json:"ts"`
    RunID     string         `json:"runId"`
    Event     TraceEventType `json:"event"`
    Span      *ast.Span      `json:"span,omitempty"`
    Data      ast.A0Record   `json:"data,omitempty"`
}

type Evidence struct {
    Kind    string       `json:"kind"`    // "assert" or "check"
    OK      bool         `json:"ok"`
    Msg     string       `json:"msg"`
    Details ast.A0Record `json:"details,omitempty"`
    Span    *ast.Span    `json:"span,omitempty"`
}

type ExecOptions struct {
    AllowedCapabilities map[string]bool
    Tools               map[string]*tools.ToolDef
    Stdlib              map[string]*stdlib.StdlibFn
    Trace               func(TraceEvent)       // nil = no tracing
    RunID               string
}

type ExecResult struct {
    Value       ast.A0Value
    Evidence    []Evidence
    Diagnostics []diagnostics.Diagnostic
}

// Execute runs an A0 program to completion.
func Execute(ctx context.Context, program *ast.Program, opts ExecOptions) (*ExecResult, error) {
    // ...
}
```

## Scope Chain (Environment)

The evaluator uses parent-chained scoping identical to the TypeScript implementation:

```go
package evaluator

import "github.com/a0-lang/a0/pkg/ast"

type Env struct {
    bindings map[string]ast.A0Value
    parent   *Env
}

func NewEnv(parent *Env) *Env {
    return &Env{
        bindings: make(map[string]ast.A0Value),
        parent:   parent,
    }
}

func (e *Env) Set(name string, value ast.A0Value) {
    e.bindings[name] = value
}

func (e *Env) Get(name string) (ast.A0Value, bool) {
    if v, ok := e.bindings[name]; ok {
        return v, true
    }
    if e.parent != nil {
        return e.parent.Get(name)
    }
    return nil, false
}

func (e *Env) Has(name string) bool {
    _, ok := e.Get(name)
    return ok
}

func (e *Env) Child() *Env {
    return NewEnv(e)
}
```

Scoping rules match the TypeScript implementation:
- **Program level:** top-level `let` bindings, `fn` declarations
- **fn bodies:** params + enclosing scope (closures) + function's own name (recursion)
- **for/filter/loop bodies:** loop binding + enclosing scope
- **if-block/try/catch bodies:** child scope inheriting parent
- **match arms:** arm binding + enclosing scope

User-defined functions capture their defining scope as a closure:

```go
type UserFn struct {
    Decl    *ast.FnDecl
    Closure *Env
}
```

## Async Execution Model

### TypeScript: async/await

The current TypeScript evaluator is `async` — every expression evaluation returns `Promise<A0Value>` because tool calls (`call?`, `do`) are async operations.

### Go: goroutines + context.Context

Go handles this differently:

1. **Tool calls are blocking calls within goroutines.** The evaluator runs in a goroutine. When a tool call executes, it blocks that goroutine while waiting for I/O. This is natural Go style.

2. **Cancellation uses `context.Context`.** The `context.Context` passed through the evaluator carries deadlines (for `timeMs` budget) and cancellation signals (for external abort).

3. **No need for `Promise`-like wrappers.** Go's evaluator functions return `(A0Value, error)` directly. The caller's goroutine blocks until the tool call returns.

```go
func (ev *evaluator) evalExpr(ctx context.Context, expr ast.Expr) (ast.A0Value, error) {
    // Check context cancellation (maps to AbortSignal check)
    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    default:
    }

    switch e := expr.(type) {
    case *ast.CallExpr:
        return ev.evalToolCall(ctx, e)
    // ... other cases
    }
}

func (ev *evaluator) evalToolCall(ctx context.Context, expr *ast.CallExpr) (ast.A0Value, error) {
    // ... capability checks, arg evaluation ...

    // Tool execution — blocks this goroutine, but other goroutines can proceed
    result, err := tool.Execute(ctx, args)
    if err != nil {
        return nil, &A0RuntimeError{Code: ETool, Message: err.Error(), Span: expr.GetSpan()}
    }
    return result, nil
}
```

4. **Budget `timeMs` uses context deadline:**

```go
func executeWithBudget(ctx context.Context, program *ast.Program, opts ExecOptions) (*ExecResult, error) {
    budget := extractBudget(program)
    if budget.TimeMs > 0 {
        var cancel context.CancelFunc
        ctx, cancel = context.WithTimeout(ctx, time.Duration(budget.TimeMs)*time.Millisecond)
        defer cancel()
    }
    return execute(ctx, program, opts)
}
```

## Error Handling

### A0RuntimeError

```go
package evaluator

import "github.com/a0-lang/a0/pkg/ast"

type A0RuntimeError struct {
    Code     string
    Message  string
    Span     *ast.Span
    Details  ast.A0Record
    Evidence []Evidence // attached on propagation
}

func (e *A0RuntimeError) Error() string {
    return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}
```

Go's error return pattern replaces TypeScript's throw/catch:

| TypeScript | Go |
|---|---|
| `throw new A0RuntimeError(...)` | `return nil, &A0RuntimeError{...}` |
| `try { ... } catch (e) { ... }` | `result, err := ...; if err != nil { ... }` |
| `e instanceof A0RuntimeError` | `var rtErr *A0RuntimeError; errors.As(err, &rtErr)` |

The `try/catch` A0 language construct (not Go try/catch) is implemented by checking the error return from `executeBlock`:

```go
case *ast.TryExpr:
    tryEnv := env.Child()
    result, err := ev.executeBlock(ctx, e.TryBody, tryEnv)
    if err != nil {
        catchEnv := env.Child()
        var rtErr *A0RuntimeError
        if errors.As(err, &rtErr) {
            errRec := ast.NewRecord()
            errRec.Set("code", ast.A0String{Value: rtErr.Code})
            errRec.Set("message", ast.A0String{Value: rtErr.Message})
            catchEnv.Set(e.CatchBinding, errRec)
        } else {
            errRec := ast.NewRecord()
            errRec.Set("code", ast.A0String{Value: "E_RUNTIME"})
            errRec.Set("message", ast.A0String{Value: err.Error()})
            catchEnv.Set(e.CatchBinding, errRec)
        }
        return ev.executeBlock(ctx, e.CatchBody, catchEnv)
    }
    return result, nil
```

### Exit Codes

Exit codes are preserved identically:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 2 | Parse/validation error |
| 3 | Capability denied |
| 4 | Runtime/tool error |
| 5 | Assertion/check failed |

## Plugin Architecture for Tools

Tools are registered via a simple registry pattern, matching the TypeScript design:

```go
package tools

var registry = make(map[string]*ToolDef)

func Register(tool *ToolDef) {
    registry[tool.Name] = tool
}

func Get(name string) (*ToolDef, bool) {
    t, ok := registry[name]
    return t, ok
}

func All() map[string]*ToolDef {
    m := make(map[string]*ToolDef, len(registry))
    for k, v := range registry {
        m[k] = v
    }
    return m
}

// RegisterBuiltin registers all built-in tools.
func RegisterBuiltin() {
    Register(FsReadTool())
    Register(FsWriteTool())
    Register(FsListTool())
    Register(FsExistsTool())
    Register(HttpGetTool())
    Register(ShExecTool())
}
```

Custom tools can be registered by embedding applications:

```go
tools.Register(&tools.ToolDef{
    Name:         "db.query",
    Mode:         tools.ModeRead,
    CapabilityID: "db.query",
    Execute: func(ctx context.Context, args ast.A0Record) (ast.A0Value, error) {
        // custom implementation
    },
})
```

## Capability Policy Loading

Policy loading follows the same precedence chain:

```
.a0policy.json (project-local)  →  ~/.a0/policy.json (user)  →  deny-all (default)
```

```go
package capabilities

type Policy struct {
    Version int               `json:"version"`
    Allow   []string          `json:"allow"`
    Deny    []string          `json:"deny,omitempty"`
    Limits  map[string]int64  `json:"limits,omitempty"`
}

type ResolvedPolicy struct {
    Policy Policy
    Source string // "project", "user", "default"
    Path   string // file path, or "" for default
}

func ResolvePolicy(cwd, homeDir string) ResolvedPolicy {
    // 1. Try cwd/.a0policy.json
    // 2. Try homeDir/.a0/policy.json
    // 3. Return deny-all default
}

func BuildAllowedCaps(policy Policy, unsafeAllowAll bool) map[string]bool {
    if unsafeAllowAll {
        // Return all known capabilities
    }
    deny := make(map[string]bool)
    for _, c := range policy.Deny {
        deny[c] = true
    }
    allowed := make(map[string]bool)
    for _, c := range policy.Allow {
        if !deny[c] {
            allowed[c] = true
        }
    }
    return allowed
}
```

## Build Targets

The Go implementation supports three build targets from a single codebase:

| Target | Command | Output | Use Case |
|--------|---------|--------|----------|
| Native CLI | `go build ./cmd/a0` | `a0` binary | Local development, CI/CD |
| WASM+WASI | `tinygo build -target wasi ./cmd/a0` | `a0.wasm` | Edge functions, sandboxed execution |
| WASM+JS | `GOOS=js GOARCH=wasm go build ./cmd/a0` | `a0.wasm` + JS glue | Browser-based playground |

The `pkg/tools` package uses build tags to swap implementations:

```go
//go:build !wasm
// +build !wasm

package tools

// fs_tools_native.go — uses os.ReadFile, os.WriteFile
```

```go
//go:build wasm
// +build wasm

package tools

// fs_tools_wasm.go — uses WASI filesystem or host function imports
```

See `04-wasm-wasi.md` for detailed WASM/WASI integration design.

## Component Interaction Summary

```
                    ┌──────────────────────────────┐
                    │         cmd/a0 (CLI)          │
                    │  Parses flags, loads policy,  │
                    │  wires runtime, handles exit  │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │       pkg/runtime             │
                    │  Orchestrates full pipeline:  │
                    │  lex → parse → validate →     │
                    │  evaluate → format result     │
                    └──┬───────┬──────┬──────┬─────┘
                       │       │      │      │
            ┌──────────▼──┐ ┌──▼──────▼──┐ ┌─▼──────────┐
            │ pkg/lexer   │ │pkg/parser  │ │pkg/validator│
            │ Tokenize    │ │CST-free    │ │Semantic     │
            │ source text │ │recursive-  │ │checks on    │
            │             │ │descent to  │ │AST nodes    │
            │             │ │AST         │ │             │
            └─────────────┘ └────────────┘ └─────────────┘
                                               │
                    ┌──────────────────────────┘
                    │
            ┌───────▼─────────────────────────────┐
            │         pkg/evaluator                │
            │  Walks AST, manages Env scope chain, │
            │  calls tools/stdlib, tracks budgets, │
            │  emits trace events, collects        │
            │  evidence                            │
            └───┬──────────────┬──────────────────┘
                │              │
        ┌───────▼──────┐ ┌────▼──────────┐
        │ pkg/stdlib   │ │ pkg/tools     │
        │ Pure fns:    │ │ Side effects: │
        │ get, put,    │ │ fs.read,      │
        │ len, sort,   │ │ fs.write,     │
        │ filter, etc. │ │ http.get,     │
        │              │ │ sh.exec       │
        └──────────────┘ └───────────────┘
```

## Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Single Go module (not separate modules) | Simpler versioning; internal packages enforce boundaries |
| Sealed interface for A0Value | Compile-time exhaustive checks; avoids `interface{}` |
| `context.Context` for cancellation | Idiomatic Go; replaces AbortSignal; integrates with `timeMs` budget |
| Recursive-descent parser (no Chevrotain) | Chevrotain is JS-only; Go recursive-descent is simple, fast, debuggable |
| `OrderedMap` for records | Preserves insertion order matching JS/TypeScript semantics |
| Build tags for WASM vs native tools | Single codebase, platform-specific implementations |
| `map[string]bool` for capabilities | Simple, efficient; matches `Set<string>` semantics |
| Error returns, not panics | Idiomatic Go; panics reserved for truly unrecoverable bugs |
| `float64` for all numeric values | Matches JavaScript/JSON semantics; A0 int vs float is syntax-level only |
