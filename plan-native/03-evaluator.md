# 03 - Evaluator and Runtime Semantics

## Overview

This document specifies the design for the A0 evaluator (runtime engine) in Go, faithfully reproducing the behavior of the TypeScript reference implementation (`packages/core/src/evaluator.ts`). The evaluator executes A0 programs step-by-step, managing scoped environments, tool calls, stdlib functions, user-defined functions with closures, budget enforcement, and trace event emission.

---

## 1. Value Model

A0 values are JSON-compatible. The Go representation uses an interface type with concrete implementations:

```go
package runtime

// Value represents any A0 runtime value.
// A0 values are JSON-compatible: null, bool, number (float64), string, list, record.
type Value interface {
    valueTag() string
}

// Null represents the A0 null value.
type Null struct{}
func (Null) valueTag() string { return "null" }

// Bool represents an A0 boolean value.
type Bool struct{ V bool }
func (Bool) valueTag() string { return "bool" }

// Number represents an A0 numeric value (always float64, matching JSON).
type Number struct{ V float64 }
func (Number) valueTag() string { return "number" }

// String represents an A0 string value.
type String struct{ V string }
func (String) valueTag() string { return "string" }

// List represents an A0 list (ordered sequence of values).
type List struct{ Elements []Value }
func (List) valueTag() string { return "list" }

// Record represents an A0 record (ordered map of string keys to values).
// Uses a slice of pairs to preserve insertion order (matching JS object behavior).
type Record struct {
    Pairs []RecordField
}
func (Record) valueTag() string { return "record" }

type RecordField struct {
    Key   string
    Value Value
}

// Get retrieves a value by key, returning Null if not found.
func (r *Record) Get(key string) Value {
    for _, p := range r.Pairs {
        if p.Key == key {
            return p.Value
        }
    }
    return Null{}
}

// Set adds or updates a key-value pair.
func (r *Record) Set(key string, val Value) {
    for i, p := range r.Pairs {
        if p.Key == key {
            r.Pairs[i].Value = val
            return
        }
    }
    r.Pairs = append(r.Pairs, RecordField{Key: key, Value: val})
}

// Has checks if a key exists.
func (r *Record) Has(key string) bool {
    for _, p := range r.Pairs {
        if p.Key == key {
            return true
        }
    }
    return false
}

// Keys returns all keys in insertion order.
func (r *Record) Keys() []string {
    keys := make([]string, len(r.Pairs))
    for i, p := range r.Pairs {
        keys[i] = p.Key
    }
    return keys
}
```

### 1.1 Design Decision: Value Type Representation

**Alternative 1: Interface-based (shown above)**
- Pro: Idiomatic Go, type switches work naturally
- Pro: Zero allocation for small types (Null, Bool) via pointer receivers
- Con: Interface boxing has allocation cost

**Alternative 2: Tagged union with `any`**
```go
type Value struct {
    Tag  ValueTag
    Data any // nil | bool | float64 | string | []Value | *Record
}
```
- Pro: Single struct, no interface overhead
- Con: Type assertions required everywhere, less idiomatic

**Alternative 3: Sum type via embedded struct**
- Similar to Alternative 1 but with fewer interfaces

**Recommendation: Interface-based (Alternative 1)** for idiomatic Go and clean type switches that mirror the TypeScript `switch (expr.kind)` pattern.

### 1.2 Number Representation

The TypeScript implementation uses JavaScript `number` (IEEE 754 float64) for all numeric values. The Go implementation should use `float64` for consistency. Integer literals like `42` are stored as `Number{V: 42.0}`. Integer operations (IntLiteral value) can be preserved by checking `math.Floor(v) == v` when needed.

The reference implementation distinguishes `IntLiteral` and `FloatLiteral` at parse time but evaluates both to JavaScript `number`. We mirror this: both produce `Number`.

---

## 2. Environment (Scope Chain)

The `Env` class from `evaluator.ts:152-180` implements parent-chained lexical scoping. The Go equivalent:

```go
// Env represents a lexical scope with parent chain.
type Env struct {
    bindings map[string]Value
    parent   *Env
}

// NewEnv creates a new root environment.
func NewEnv() *Env {
    return &Env{
        bindings: make(map[string]Value),
    }
}

// Child creates a new child scope.
func (e *Env) Child() *Env {
    return &Env{
        bindings: make(map[string]Value),
        parent:   e,
    }
}

// Set binds a name to a value in this scope.
func (e *Env) Set(name string, val Value) {
    e.bindings[name] = val
}

// Get looks up a name, walking the parent chain.
// Returns (value, true) if found, (nil, false) if not.
func (e *Env) Get(name string) (Value, bool) {
    if val, ok := e.bindings[name]; ok {
        return val, true
    }
    if e.parent != nil {
        return e.parent.Get(name)
    }
    return nil, false
}

// Has checks if a name is bound anywhere in the scope chain.
func (e *Env) Has(name string) bool {
    _, ok := e.Get(name)
    return ok
}
```

### 2.1 Scope Creation Points

Child scopes are created by the evaluator at these points (matching `evaluator.ts`):

| Construct | Scope Created | Bindings |
|---|---|---|
| `for { in: list, as: "x" } { body }` | Child of current env per iteration | `x` = current item |
| `fn name { params } { body }` (declaration) | Records closure env | None (closure capture) |
| `fn name { params } { body }` (call) | Child of closure env | Parameters from args |
| `match subject { ok {v} { ... } err {e} { ... } }` | Child of current env per arm | `v` or `e` = matched value |
| `if (cond) { body } else { body }` | Child of current env per branch | None |
| `try { body } catch { e } { body }` | Child of current env per block | `e` = error record (catch only) |
| `filter { in: list, as: "x" } { body }` | Child of current env per iteration | `x` = current item |
| `loop { in: init, times: N, as: "x" } { body }` | Child of current env per iteration | `x` = current value |
| `map { in: list, fn: "name" }` | Child of closure env per iteration | Parameter(s) from item |
| `reduce { in: list, fn: "name", init: val }` | Child of closure env per iteration | Accumulator + item |

---

## 3. Tool Interface

Tools are side-effectful operations (filesystem, HTTP, shell) that require capability gating:

```go
// ToolDef defines a tool that can be invoked via call? or do.
type ToolDef struct {
    Name         string
    Mode         ToolMode      // "read" or "effect"
    CapabilityID string        // e.g., "fs.read"
    InputSchema  SchemaValidator // optional (Zod equivalent)
    Execute      func(ctx context.Context, args *Record) (Value, error)
}

type ToolMode string

const (
    ToolModeRead   ToolMode = "read"
    ToolModeEffect ToolMode = "effect"
)

// SchemaValidator validates tool arguments.
// In Go, this replaces Zod schemas.
type SchemaValidator interface {
    Validate(args *Record) error
}
```

### 3.1 Tool Call Execution Flow

This replicates the logic from `evaluator.ts:394-524`:

```
1. Look up tool by name in options.tools map
2. If not found -> E_UNKNOWN_TOOL (exit 4)
3. Mode check: if expr is CallExpr and tool.mode == "effect" -> E_CALL_EFFECT (exit 4)
4. Capability check: if tool.capabilityId not in allowedCapabilities -> E_CAP_DENIED (exit 3)
5. Evaluate argument expressions -> A0Record
6. Schema validation (if inputSchema present): validate args -> E_TOOL_ARGS (exit 4) on failure
7. Budget check: increment toolCalls counter -> E_BUDGET if exceeded
8. Emit trace: tool_start
9. Execute tool with context (for cancellation/timeout)
10. On success:
    a. Emit trace: tool_end (outcome: ok)
    b. Budget check: if result has "bytes" field, add to bytesWritten -> E_BUDGET if exceeded
    c. Budget check: timeMs -> E_BUDGET if exceeded
    d. Return result
11. On error:
    a. Re-throw if A0RuntimeError (budget errors)
    b. Emit trace: tool_end (outcome: err)
    c. Wrap as E_TOOL error (exit 4)
```

```go
func (ev *Evaluator) evalToolCall(
    expr ast.Expr, // CallExpr or DoExpr
    toolName string,
    argsExpr *ast.RecordExpr,
    isCall bool, // true for call?, false for do
) (Value, error) {
    tool, ok := ev.options.Tools[toolName]
    if !ok {
        return nil, ev.runtimeError("E_UNKNOWN_TOOL",
            fmt.Sprintf("Unknown tool '%s'.", toolName), expr)
    }

    // Mode check (call? cannot invoke effect tools)
    if isCall && tool.Mode == ToolModeEffect {
        return nil, ev.runtimeError("E_CALL_EFFECT",
            fmt.Sprintf("Cannot use 'call?' with effectful tool '%s'. Use 'do' instead.", toolName),
            expr)
    }

    // Capability check
    if !ev.options.AllowedCapabilities.Has(tool.CapabilityID) {
        return nil, ev.runtimeError("E_CAP_DENIED",
            fmt.Sprintf("Capability '%s' required by tool '%s' is not allowed.",
                tool.CapabilityID, toolName),
            expr)
    }

    // Evaluate arguments
    args, err := ev.evalRecordPairs(argsExpr)
    if err != nil {
        return nil, err
    }

    // Schema validation
    if tool.InputSchema != nil {
        if err := tool.InputSchema.Validate(args); err != nil {
            return nil, ev.runtimeError("E_TOOL_ARGS",
                fmt.Sprintf("Invalid arguments for tool '%s': %s", toolName, err.Error()),
                argsExpr)
        }
    }

    // Budget: maxToolCalls
    ev.tracker.ToolCalls++
    if ev.budget.MaxToolCalls > 0 && ev.tracker.ToolCalls > ev.budget.MaxToolCalls {
        ev.emitTrace("budget_exceeded", expr, map[string]Value{
            "budget": String{V: "maxToolCalls"},
            "limit":  Number{V: float64(ev.budget.MaxToolCalls)},
            "actual": Number{V: float64(ev.tracker.ToolCalls)},
        })
        return nil, ev.runtimeError("E_BUDGET",
            fmt.Sprintf("Budget exceeded: maxToolCalls limit of %d reached.", ev.budget.MaxToolCalls),
            expr)
    }

    // Emit tool_start trace
    ev.emitTrace("tool_start", expr, map[string]Value{
        "tool": String{V: toolName},
        "mode": String{V: string(tool.Mode)},
    })
    startMs := time.Now()

    // Execute tool
    result, execErr := tool.Execute(ev.ctx, args)
    durationMs := time.Since(startMs).Milliseconds()

    if execErr != nil {
        // Re-throw budget errors
        if rErr, ok := execErr.(*A0RuntimeError); ok {
            return nil, rErr
        }
        ev.emitTrace("tool_end", expr, map[string]Value{
            "tool":       String{V: toolName},
            "outcome":    String{V: "err"},
            "durationMs": Number{V: float64(durationMs)},
            "error":      String{V: execErr.Error()},
        })
        return nil, ev.runtimeError("E_TOOL",
            fmt.Sprintf("Tool '%s' failed: %s", toolName, execErr.Error()),
            expr)
    }

    ev.emitTrace("tool_end", expr, map[string]Value{
        "tool":       String{V: toolName},
        "outcome":    String{V: "ok"},
        "durationMs": Number{V: float64(durationMs)},
    })

    // Budget: maxBytesWritten
    if rec, ok := result.(*Record); ok {
        if bytesVal := rec.Get("bytes"); bytesVal != nil {
            if num, ok := bytesVal.(Number); ok {
                ev.tracker.BytesWritten += int64(num.V)
                if ev.budget.MaxBytesWritten > 0 &&
                    ev.tracker.BytesWritten > ev.budget.MaxBytesWritten {
                    ev.emitTrace("budget_exceeded", expr, nil)
                    return nil, ev.runtimeError("E_BUDGET",
                        fmt.Sprintf("Budget exceeded: maxBytesWritten limit of %d bytes exceeded.",
                            ev.budget.MaxBytesWritten),
                        expr)
                }
            }
        }
    }

    // Budget: timeMs after tool
    if err := ev.enforceTimeBudget(expr); err != nil {
        return nil, err
    }

    return result, nil
}
```

---

## 4. Stdlib Interface

Stdlib functions are pure, synchronous computations:

```go
// StdlibFn defines a pure stdlib function.
type StdlibFn struct {
    Name    string
    Execute func(args *Record) (Value, error)
}
```

### 4.1 Stdlib Call Execution Flow

From `evaluator.ts:850-881`:

```
1. Look up function in options.stdlib map
2. If not found -> E_UNKNOWN_FN (exit 4)
3. Evaluate argument expressions -> A0Record
4. Execute stdlib function (synchronous in TS, but may error)
5. On success: enforce time budget, return result
6. On error:
    a. Re-throw if A0RuntimeError
    b. Wrap as E_FN error (exit 4)
```

```go
func (ev *Evaluator) evalStdlibCall(fnName string, args *Record, span ast.Span) (Value, error) {
    fn, ok := ev.options.Stdlib[fnName]
    if !ok {
        return nil, &A0RuntimeError{
            Code:    "E_UNKNOWN_FN",
            Message: fmt.Sprintf("Unknown function '%s'.", fnName),
            Span:    &span,
        }
    }

    result, err := fn.Execute(args)
    if err != nil {
        if rErr, ok := err.(*A0RuntimeError); ok {
            return nil, rErr
        }
        return nil, &A0RuntimeError{
            Code:    "E_FN",
            Message: fmt.Sprintf("Function '%s' failed: %s", fnName, err.Error()),
            Span:    &span,
            Details: &Record{Pairs: []RecordField{{Key: "fn", Value: String{V: fnName}}}},
        }
    }

    if err := ev.enforceTimeBudget(span); err != nil {
        return nil, err
    }

    return result, nil
}
```

---

## 5. User-Defined Functions and Closures

User-defined functions capture their defining scope (closure) and create child scopes on invocation:

```go
// UserFn represents a user-defined function with its closure environment.
type UserFn struct {
    Decl    *ast.FnDecl
    Closure *Env
}
```

### 5.1 Function Declaration

From `evaluator.ts:289-290`:

```go
case *ast.FnDecl:
    // Register function with current environment as closure
    ev.userFns[stmt.Name] = &UserFn{
        Decl:    stmt,
        Closure: env,
    }
```

### 5.2 Function Call

From `evaluator.ts:830-849`:

```go
func (ev *Evaluator) evalUserFnCall(
    fnName string,
    userFn *UserFn,
    argsExpr *ast.RecordExpr,
    env *Env,
    span ast.Span,
) (Value, error) {
    ev.emitTrace("fn_call_start", span, map[string]Value{
        "fn": String{V: fnName},
    })

    // Evaluate call arguments in the caller's scope
    args, err := ev.evalRecordPairsInEnv(argsExpr, env)
    if err != nil {
        return nil, err
    }

    // Create child scope from the closure (not the caller!)
    fnEnv := userFn.Closure.Child()
    for _, param := range userFn.Decl.Params {
        val := args.Get(param)
        if val == nil {
            val = Null{}
        }
        fnEnv.Set(param, val)
    }

    // Execute function body
    result, err := ev.executeBlock(userFn.Decl.Body, fnEnv)
    ev.emitTrace("fn_call_end", span, map[string]Value{
        "fn": String{V: fnName},
    })

    return result, err
}
```

### 5.3 Key Closure Semantics

The closure captures the **environment at definition time**, not at call time. This means:

```a0
let x = 10
fn addX { n } {
    return x + n
}
let x = 20          # shadows outer x in new scope
let result = addX { n: 5 }
return result       # returns 15, not 25
```

Wait -- A0 forbids duplicate bindings at the same scope level (`E_DUP_BINDING`), so the above would be a validator error. But the closure principle still matters for nested functions where parent bindings are captured.

---

## 6. Higher-Order Functions

### 6.1 Map

From `evaluator.ts:565-641`. The `map` built-in iterates over a list, calling a user-defined function on each element:

```go
func (ev *Evaluator) evalMap(argsExpr *ast.RecordExpr, env *Env, span ast.Span) (Value, error) {
    args, err := ev.evalRecordPairsInEnv(argsExpr, env)
    if err != nil {
        return nil, err
    }

    listVal := args.Get("in")
    list, ok := listVal.(*List)
    if !ok {
        return nil, ev.typeError("map 'in' must be a list", span)
    }

    fnNameVal := args.Get("fn")
    fnNameStr, ok := fnNameVal.(String)
    if !ok {
        return nil, ev.typeError("map 'fn' must be a string", span)
    }

    mapFn, ok := ev.userFns[fnNameStr.V]
    if !ok {
        return nil, ev.unknownFnError(fnNameStr.V, span)
    }

    ev.emitTrace("map_start", span, map[string]Value{
        "fn":         String{V: fnNameStr.V},
        "listLength": Number{V: float64(len(list.Elements))},
    })

    results := make([]Value, 0, len(list.Elements))
    for _, item := range list.Elements {
        // Budget: maxIterations
        if err := ev.incrementIterations(span); err != nil {
            return nil, err
        }

        ev.emitTrace("fn_call_start", span, map[string]Value{"fn": String{V: fnNameStr.V}})
        fnEnv := mapFn.Closure.Child()

        // Parameter binding: single param -> bind item; multi-param -> destructure record
        if err := ev.bindFnParams(mapFn, item, fnEnv, fnNameStr.V, span); err != nil {
            return nil, err
        }

        iterResult, err := ev.executeBlock(mapFn.Decl.Body, fnEnv)
        ev.emitTrace("fn_call_end", span, map[string]Value{"fn": String{V: fnNameStr.V}})
        if err != nil {
            return nil, err
        }
        results = append(results, iterResult)
    }

    ev.emitTrace("map_end", span, map[string]Value{
        "fn":         String{V: fnNameStr.V},
        "iterations": Number{V: float64(len(list.Elements))},
    })

    return &List{Elements: results}, nil
}
```

### 6.2 Parameter Binding Logic

From `evaluator.ts:618-633`. When a function has a single parameter, the item is bound directly. When it has multiple parameters, the item must be a record and its fields are destructured:

```go
func (ev *Evaluator) bindFnParams(
    fn *UserFn, item Value, fnEnv *Env,
    fnName string, span ast.Span,
) error {
    if len(fn.Decl.Params) == 1 {
        fnEnv.Set(fn.Decl.Params[0], item)
        return nil
    }

    // Multi-param: item must be a record
    rec, ok := item.(*Record)
    if !ok {
        return ev.typeError(
            fmt.Sprintf("map item must be a record when function '%s' expects %d parameters; got %s.",
                fnName, len(fn.Decl.Params), valueTypeName(item)),
            span,
        )
    }

    for _, param := range fn.Decl.Params {
        val := rec.Get(param)
        if val == nil {
            val = Null{}
        }
        fnEnv.Set(param, val)
    }
    return nil
}
```

### 6.3 Filter (Higher-Order with fn:)

From `evaluator.ts:644-754`. Filter supports two overloads:
1. `filter { in: list, by: "key" }` -- stdlib (key-truthiness filter)
2. `filter { in: list, fn: "predicate" }` -- higher-order (user function predicate)

If both `by:` and `fn:` are provided, it is an error (`E_FN`).

The higher-order filter has a special truthiness check: since A0 function returns always go through `return` which can produce any value, but historically returned records, the evaluator unwraps single-field records to check the first value's truthiness:

```go
// unwrapPredicateResult extracts the truthiness check value from a
// predicate function's return value. If the result is a record,
// check the first value (not the container). Empty records are falsy.
func unwrapPredicateResult(result Value) Value {
    if rec, ok := result.(*Record); ok {
        if len(rec.Pairs) > 0 {
            return rec.Pairs[0].Value
        }
        return Null{} // empty record is falsy
    }
    return result
}
```

### 6.4 Reduce

From `evaluator.ts:757-827`. Reduce folds a list into a single value using a two-parameter function (accumulator, item):

```go
func (ev *Evaluator) evalReduce(argsExpr *ast.RecordExpr, env *Env, span ast.Span) (Value, error) {
    args, err := ev.evalRecordPairsInEnv(argsExpr, env)
    if err != nil {
        return nil, err
    }

    list := mustList(args.Get("in"), "reduce 'in'", span)
    fnName := mustString(args.Get("fn"), "reduce 'fn'", span)
    initVal := args.Get("init")
    if initVal == nil {
        initVal = Null{}
    }

    reduceFn, ok := ev.userFns[fnName]
    if !ok {
        return nil, ev.unknownFnError(fnName, span)
    }

    if len(reduceFn.Decl.Params) != 2 {
        return nil, ev.typeError(
            fmt.Sprintf("reduce callback '%s' must accept exactly 2 parameters (accumulator, item), got %d.",
                fnName, len(reduceFn.Decl.Params)),
            span,
        )
    }

    ev.emitTrace("reduce_start", span, nil)

    acc := initVal
    for _, item := range list.Elements {
        if err := ev.incrementIterations(span); err != nil {
            return nil, err
        }

        ev.emitTrace("fn_call_start", span, map[string]Value{"fn": String{V: fnName}})
        fnEnv := reduceFn.Closure.Child()
        fnEnv.Set(reduceFn.Decl.Params[0], acc)
        fnEnv.Set(reduceFn.Decl.Params[1], item)

        acc, err = ev.executeBlock(reduceFn.Decl.Body, fnEnv)
        ev.emitTrace("fn_call_end", span, map[string]Value{"fn": String{V: fnName}})
        if err != nil {
            return nil, err
        }
    }

    ev.emitTrace("reduce_end", span, nil)
    return acc, nil
}
```

---

## 7. Control Flow

### 7.1 If Expression (Inline)

From `evaluator.ts:883-890`:

```go
case *ast.IfExpr:
    condVal, err := ev.evalExpr(expr.Cond, env)
    if err != nil {
        return nil, err
    }
    if isTruthy(condVal) {
        return ev.evalExpr(expr.Then, env)
    }
    return ev.evalExpr(expr.Else, env)
```

### 7.2 If Block Expression

From `evaluator.ts:892-897`:

```go
case *ast.IfBlockExpr:
    condVal, err := ev.evalExpr(expr.Cond, env)
    if err != nil {
        return nil, err
    }
    blockEnv := env.Child()
    if isTruthy(condVal) {
        return ev.executeBlock(expr.ThenBody, blockEnv)
    }
    return ev.executeBlock(expr.ElseBody, blockEnv)
```

### 7.3 For Expression

From `evaluator.ts:899-933`. Iterates over a list, creating a child scope per iteration. Returns a list of results:

```go
case *ast.ForExpr:
    listVal, err := ev.evalExpr(expr.List, env)
    if err != nil {
        return nil, err
    }
    list, ok := listVal.(*List)
    if !ok {
        return nil, &A0RuntimeError{
            Code:    "E_FOR_NOT_LIST",
            Message: fmt.Sprintf("for-in expression must evaluate to a list, got %s.", valueTypeName(listVal)),
            Span:    &expr.List.GetSpan(),
        }
    }

    ev.emitTrace("for_start", expr, map[string]Value{
        "listLength": Number{V: float64(len(list.Elements))},
        "as":         String{V: expr.Binding},
    })

    results := make([]Value, 0, len(list.Elements))
    for _, item := range list.Elements {
        if err := ev.incrementIterations(expr); err != nil {
            return nil, err
        }
        iterEnv := env.Child()
        iterEnv.Set(expr.Binding, item)
        iterResult, err := ev.executeBlock(expr.Body, iterEnv)
        if err != nil {
            return nil, err
        }
        results = append(results, iterResult)
    }

    ev.emitTrace("for_end", expr, map[string]Value{
        "iterations": Number{V: float64(len(list.Elements))},
    })
    return &List{Elements: results}, nil
```

### 7.4 Match Expression

From `evaluator.ts:935-967`. Matches on a record with `ok` or `err` key:

```go
case *ast.MatchExpr:
    subject, err := ev.evalExpr(expr.Subject, env)
    if err != nil {
        return nil, err
    }
    rec, ok := subject.(*Record)
    if !ok {
        return nil, &A0RuntimeError{
            Code:    "E_MATCH_NOT_RECORD",
            Message: fmt.Sprintf("match subject must be a record, got %s.", valueTypeName(subject)),
            Span:    &expr.Subject.GetSpan(),
        }
    }

    if rec.Has("ok") {
        ev.emitTrace("match_start", expr, map[string]Value{"arm": String{V: "ok"}})
        armEnv := env.Child()
        armEnv.Set(expr.OkArm.Binding, rec.Get("ok"))
        result, err := ev.executeBlock(expr.OkArm.Body, armEnv)
        ev.emitTrace("match_end", expr, map[string]Value{"arm": String{V: "ok"}})
        return result, err
    }
    if rec.Has("err") {
        ev.emitTrace("match_start", expr, map[string]Value{"arm": String{V: "err"}})
        armEnv := env.Child()
        armEnv.Set(expr.ErrArm.Binding, rec.Get("err"))
        result, err := ev.executeBlock(expr.ErrArm.Body, armEnv)
        ev.emitTrace("match_end", expr, map[string]Value{"arm": String{V: "err"}})
        return result, err
    }

    return nil, &A0RuntimeError{
        Code:    "E_MATCH_NO_ARM",
        Message: "match subject record has neither 'ok' nor 'err' key.",
        Span:    &expr.Subject.GetSpan(),
    }
```

### 7.5 Try/Catch

From `evaluator.ts:969-984`. Catches runtime errors and binds a `{ code, message }` record:

```go
case *ast.TryExpr:
    tryEnv := env.Child()
    result, tryErr := ev.executeBlock(expr.TryBody, tryEnv)
    if tryErr == nil {
        return result, nil
    }

    catchEnv := env.Child()
    if rErr, ok := tryErr.(*A0RuntimeError); ok {
        errRec := &Record{Pairs: []RecordField{
            {Key: "code", Value: String{V: rErr.Code}},
            {Key: "message", Value: String{V: rErr.Message}},
        }}
        if rErr.Details != nil {
            errRec.Set("details", rErr.Details)
        }
        catchEnv.Set(expr.CatchBinding, errRec)
    } else {
        catchEnv.Set(expr.CatchBinding, &Record{Pairs: []RecordField{
            {Key: "code", Value: String{V: "E_RUNTIME"}},
            {Key: "message", Value: String{V: tryErr.Error()}},
        }})
    }
    return ev.executeBlock(expr.CatchBody, catchEnv)
```

### 7.6 Filter Block

From `evaluator.ts:986-1032`. Inline filter with block body:

```go
case *ast.FilterBlockExpr:
    listVal, err := ev.evalExpr(expr.List, env)
    if err != nil {
        return nil, err
    }
    list, ok := listVal.(*List)
    if !ok {
        return nil, ev.typeError("filter 'in' must be a list", expr.List.GetSpan())
    }

    ev.emitTrace("filter_start", expr, map[string]Value{
        "listLength": Number{V: float64(len(list.Elements))},
        "as":         String{V: expr.Binding},
    })

    var results []Value
    for _, item := range list.Elements {
        if err := ev.incrementIterations(expr); err != nil {
            return nil, err
        }
        iterEnv := env.Child()
        iterEnv.Set(expr.Binding, item)
        predResult, err := ev.executeBlock(expr.Body, iterEnv)
        if err != nil {
            return nil, err
        }
        checkValue := unwrapPredicateResult(predResult)
        if isTruthy(checkValue) {
            results = append(results, item)
        }
    }

    ev.emitTrace("filter_end", expr, nil)
    return &List{Elements: results}, nil
```

### 7.7 Loop

From `evaluator.ts:1034-1068`. Iterative convergence loop:

```go
case *ast.LoopExpr:
    initVal, err := ev.evalExpr(expr.Init, env)
    if err != nil {
        return nil, err
    }
    timesVal, err := ev.evalExpr(expr.Times, env)
    if err != nil {
        return nil, err
    }
    timesNum, ok := timesVal.(Number)
    if !ok || timesNum.V < 0 || math.Floor(timesNum.V) != timesNum.V {
        return nil, ev.typeError("loop 'times' must be a non-negative integer", expr.GetSpan())
    }
    times := int(timesNum.V)

    ev.emitTrace("loop_start", expr, map[string]Value{
        "times": Number{V: float64(times)},
        "as":    String{V: expr.Binding},
    })

    current := initVal
    for i := 0; i < times; i++ {
        if err := ev.incrementIterations(expr); err != nil {
            return nil, err
        }
        iterEnv := env.Child()
        iterEnv.Set(expr.Binding, current)
        current, err = ev.executeBlock(expr.Body, iterEnv)
        if err != nil {
            return nil, err
        }
    }

    ev.emitTrace("loop_end", expr, nil)
    return current, nil
```

---

## 8. Truthiness Rules

From `evaluator.ts:146-149`:

```go
// isTruthy implements A0 truthiness rules.
// Falsy: null, false, 0, ""
// Truthy: everything else (non-zero numbers, non-empty strings, lists, records, true)
func isTruthy(v Value) bool {
    switch val := v.(type) {
    case Null:
        return false
    case Bool:
        return val.V
    case Number:
        return val.V != 0
    case String:
        return val.V != ""
    default:
        // Lists (even empty), Records (even empty) are truthy
        return true
    }
}
```

---

## 9. Binary and Unary Operators

### 9.1 Binary Operations

From `evaluator.ts:1090-1158`:

```go
func evalBinaryOp(op ast.BinaryOp, left, right Value, span ast.Span) (Value, error) {
    switch op {
    case ast.OpAdd:
        // String concatenation or numeric addition
        if ls, lok := left.(String); lok {
            if rs, rok := right.(String); rok {
                return String{V: ls.V + rs.V}, nil
            }
        }
        if ln, lok := left.(Number); lok {
            if rn, rok := right.(Number); rok {
                return Number{V: ln.V + rn.V}, nil
            }
        }
        return nil, typeErrorBinOp("+", left, right, span)

    case ast.OpSub, ast.OpMul, ast.OpDiv, ast.OpMod:
        ln, lok := left.(Number)
        rn, rok := right.(Number)
        if !lok || !rok {
            return nil, typeErrorBinOp(string(op), left, right, span)
        }
        switch op {
        case ast.OpSub: return Number{V: ln.V - rn.V}, nil
        case ast.OpMul: return Number{V: ln.V * rn.V}, nil
        case ast.OpDiv:
            if rn.V == 0 {
                return nil, &A0RuntimeError{Code: "E_TYPE", Message: "Division by zero.", Span: &span}
            }
            return Number{V: ln.V / rn.V}, nil
        case ast.OpMod:
            if rn.V == 0 {
                return nil, &A0RuntimeError{Code: "E_TYPE", Message: "Modulo by zero.", Span: &span}
            }
            return Number{V: math.Mod(ln.V, rn.V)}, nil
        }

    case ast.OpEqEq:
        return Bool{V: deepEqual(left, right)}, nil
    case ast.OpNeq:
        return Bool{V: !deepEqual(left, right)}, nil

    case ast.OpGt, ast.OpLt, ast.OpGtEq, ast.OpLtEq:
        // Numbers or strings, but not mixed
        if ln, lok := left.(Number); lok {
            if rn, rok := right.(Number); rok {
                return Bool{V: compareNumbers(op, ln.V, rn.V)}, nil
            }
        }
        if ls, lok := left.(String); lok {
            if rs, rok := right.(String); rok {
                return Bool{V: compareStrings(op, ls.V, rs.V)}, nil
            }
        }
        return nil, typeErrorBinOp(string(op), left, right, span)
    }

    return nil, &A0RuntimeError{Code: "E_TYPE", Message: fmt.Sprintf("Unknown operator '%s'.", op), Span: &span}
}
```

### 9.2 Deep Equality

From `evaluator.ts:1161-1188`:

```go
func deepEqual(a, b Value) bool {
    switch av := a.(type) {
    case Null:
        _, ok := b.(Null)
        return ok
    case Bool:
        if bv, ok := b.(Bool); ok {
            return av.V == bv.V
        }
        return false
    case Number:
        if bv, ok := b.(Number); ok {
            return av.V == bv.V
        }
        return false
    case String:
        if bv, ok := b.(String); ok {
            return av.V == bv.V
        }
        return false
    case *List:
        bv, ok := b.(*List)
        if !ok || len(av.Elements) != len(bv.Elements) {
            return false
        }
        for i := range av.Elements {
            if !deepEqual(av.Elements[i], bv.Elements[i]) {
                return false
            }
        }
        return true
    case *Record:
        bv, ok := b.(*Record)
        if !ok || len(av.Pairs) != len(bv.Pairs) {
            return false
        }
        for _, ap := range av.Pairs {
            found := false
            for _, bp := range bv.Pairs {
                if ap.Key == bp.Key {
                    if !deepEqual(ap.Value, bp.Value) {
                        return false
                    }
                    found = true
                    break
                }
            }
            if !found {
                return false
            }
        }
        return true
    default:
        return false
    }
}
```

### 9.3 Unary Negation

From `evaluator.ts:1076-1087`:

```go
case *ast.UnaryExpr:
    operand, err := ev.evalExpr(expr.Operand, env)
    if err != nil {
        return nil, err
    }
    if num, ok := operand.(Number); ok {
        return Number{V: -num.V}, nil
    }
    return nil, &A0RuntimeError{
        Code:    "E_TYPE",
        Message: fmt.Sprintf("Unary '-' requires a number, got %s.", valueTypeName(operand)),
        Span:    &expr.GetSpan(),
    }
```

---

## 10. Budget Tracking

### 10.1 Budget Structure

From `evaluator.ts:89-101`:

```go
// Budget defines resource limits for program execution.
type Budget struct {
    TimeMs          int64 // max wall-clock time in milliseconds
    MaxToolCalls    int   // max number of tool invocations
    MaxBytesWritten int64 // max total bytes written via tools
    MaxIterations   int   // max iterations across for/map/reduce/filter/loop
}

// BudgetTracker tracks consumption against budget limits.
type BudgetTracker struct {
    ToolCalls    int
    BytesWritten int64
    Iterations   int
    StartMs      time.Time
}
```

### 10.2 Budget Extraction

From `evaluator.ts:122-143`. Budget values are extracted from `BudgetDecl` headers at program start:

```go
func extractBudget(program *ast.Program) Budget {
    var budget Budget
    for _, h := range program.Headers {
        if bd, ok := h.(*ast.BudgetDecl); ok {
            for _, entry := range bd.Budget.Pairs {
                pair, ok := entry.(*ast.RecordPair)
                if !ok { continue }
                intLit, ok := pair.Value.(*ast.IntLiteral)
                if !ok { continue }
                switch pair.Key {
                case "timeMs":          budget.TimeMs = intLit.Value
                case "maxToolCalls":    budget.MaxToolCalls = int(intLit.Value)
                case "maxBytesWritten": budget.MaxBytesWritten = intLit.Value
                case "maxIterations":   budget.MaxIterations = int(intLit.Value)
                }
            }
        }
    }
    return budget
}
```

### 10.3 Iteration Counter

The iteration counter is **shared** across all iteration constructs: `for`, `map`, `reduce`, `filter` (both fn: and block), and `loop`. This matches the TypeScript implementation where `tracker.iterations` is a single mutable counter:

```go
func (ev *Evaluator) incrementIterations(node ast.Node) error {
    ev.tracker.Iterations++
    if ev.budget.MaxIterations > 0 && ev.tracker.Iterations > ev.budget.MaxIterations {
        span := node.GetSpan()
        ev.emitTrace("budget_exceeded", node, map[string]Value{
            "budget": String{V: "maxIterations"},
            "limit":  Number{V: float64(ev.budget.MaxIterations)},
            "actual": Number{V: float64(ev.tracker.Iterations)},
        })
        return &A0RuntimeError{
            Code:    "E_BUDGET",
            Message: fmt.Sprintf("Budget exceeded: maxIterations limit of %d reached.", ev.budget.MaxIterations),
            Span:    &span,
        }
    }
    return nil
}
```

### 10.4 Time Budget Enforcement

From `evaluator.ts:103-120`:

```go
func (ev *Evaluator) enforceTimeBudget(node ast.Node) error {
    if ev.budget.TimeMs <= 0 {
        return nil
    }
    elapsed := time.Since(ev.tracker.StartMs).Milliseconds()
    if elapsed > ev.budget.TimeMs {
        span := node.GetSpan()
        ev.emitTrace("budget_exceeded", node, map[string]Value{
            "budget": String{V: "timeMs"},
            "limit":  Number{V: float64(ev.budget.TimeMs)},
            "actual": Number{V: float64(elapsed)},
        })
        return &A0RuntimeError{
            Code:    "E_BUDGET",
            Message: fmt.Sprintf("Budget exceeded: timeMs limit of %dms exceeded (%dms elapsed).",
                ev.budget.TimeMs, elapsed),
            Span:    &span,
        }
    }
    return nil
}
```

---

## 11. Trace Events

### 11.1 Event Types

From `evaluator.ts:30`:

```go
type TraceEventType string

const (
    TraceRunStart     TraceEventType = "run_start"
    TraceRunEnd       TraceEventType = "run_end"
    TraceStmtStart    TraceEventType = "stmt_start"
    TraceStmtEnd      TraceEventType = "stmt_end"
    TraceToolStart    TraceEventType = "tool_start"
    TraceToolEnd      TraceEventType = "tool_end"
    TraceEvidence     TraceEventType = "evidence"
    TraceBudgetExceed TraceEventType = "budget_exceeded"
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
```

### 11.2 Trace Event Structure

```go
type TraceEvent struct {
    Timestamp string            `json:"ts"`
    RunID     string            `json:"runId"`
    Event     TraceEventType    `json:"event"`
    Span      *ast.Span         `json:"span,omitempty"`
    Data      map[string]Value  `json:"data,omitempty"`
}
```

### 11.3 Trace Emission

```go
// TraceCallback is the function signature for trace event listeners.
type TraceCallback func(event TraceEvent)

func (ev *Evaluator) emitTrace(event TraceEventType, node ast.Node, data map[string]Value) {
    if ev.options.Trace == nil {
        return
    }
    var span *ast.Span
    if node != nil {
        s := node.GetSpan()
        span = &s
    }
    ev.options.Trace(TraceEvent{
        Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
        RunID:     ev.options.RunID,
        Event:     event,
        Span:      span,
        Data:      data,
    })
}
```

---

## 12. Evidence Collection

### 12.1 Evidence Structure

From `evaluator.ts:21-27`:

```go
type Evidence struct {
    Kind    string     // "assert" or "check"
    OK      bool
    Msg     string
    Details *Record    // optional
    Span    *ast.Span  // optional
}
```

### 12.2 Assert vs Check

From `evaluator.ts:526-559`:

- **assert**: Fatal. If the condition is falsy, throws `E_ASSERT` (exit 5) immediately
- **check**: Non-fatal. Records evidence and continues. If any check fails, the runner returns exit 5 after execution completes

```go
func (ev *Evaluator) evalAssertOrCheck(
    argsExpr *ast.RecordExpr, env *Env,
    isAssert bool, span ast.Span,
) (Value, error) {
    args, err := ev.evalRecordPairsInEnv(argsExpr, env)
    if err != nil {
        return nil, err
    }

    ok := isTruthy(args.Get("that"))
    msg := ""
    if msgVal, ok := args.Get("msg").(String); ok {
        msg = msgVal.V
    }

    ev := Evidence{
        Kind: "check",
        OK:   ok,
        Msg:  msg,
        Span: &span,
    }
    if isAssert {
        ev.Kind = "assert"
    }
    if details, ok := args.Get("details").(*Record); ok {
        ev.Details = details
    }

    ev.evidence = append(ev.evidence, ev)
    ev.emitTrace("evidence", span, nil)

    if !ok && isAssert {
        return nil, &A0RuntimeError{
            Code:    "E_ASSERT",
            Message: fmt.Sprintf("Assertion failed: %s", msg),
            Span:    &span,
        }
    }

    return evidenceToValue(ev), nil
}
```

---

## 13. Runtime Error Model

### 13.1 Error Structure

From `evaluator.ts:57-70`:

```go
// A0RuntimeError represents a runtime error during program execution.
type A0RuntimeError struct {
    Code     string
    Message  string
    Span     *ast.Span
    Details  *Record
    Evidence []Evidence // populated on run_end for failed checks
}

func (e *A0RuntimeError) Error() string {
    return e.Message
}
```

### 13.2 Exit Code Mapping

```go
func ExitCodeFromError(err error) int {
    if err == nil {
        return 0
    }
    rErr, ok := err.(*A0RuntimeError)
    if !ok {
        return 4 // generic runtime error
    }
    switch rErr.Code {
    case "E_LEX", "E_PARSE", "E_AST", "E_NO_RETURN", "E_RETURN_NOT_LAST",
        "E_UNKNOWN_CAP", "E_DUP_BINDING", "E_UNBOUND", "E_UNKNOWN_TOOL",
        "E_CALL_EFFECT", "E_UNDECLARED_CAP", "E_BUDGET", "E_UNKNOWN_BUDGET",
        "E_FN_DUP", "E_IMPORT_UNSUPPORTED", "E_DUP_BUDGET",
        "E_CAP_VALUE", "E_BUDGET_TYPE":
        return 2 // parse/validation error
    case "E_CAP_DENIED":
        return 3 // capability denied
    case "E_TOOL", "E_TOOL_ARGS", "E_FN", "E_UNKNOWN_FN", "E_TYPE",
        "E_PATH", "E_FOR_NOT_LIST", "E_MATCH_NOT_RECORD", "E_MATCH_NO_ARM",
        "E_RUNTIME":
        return 4 // runtime error
    case "E_ASSERT", "E_CHECK":
        return 5 // assertion/check failure
    default:
        return 4
    }
}
```

---

## 14. Execution Context and Cancellation

### 14.1 Go context.Context vs Node.js AbortSignal

The TypeScript evaluator uses `AbortSignal` for cancellation (passed via `ExecOptions.signal`). In Go, the idiomatic equivalent is `context.Context`:

```go
// ExecOptions configures program execution.
type ExecOptions struct {
    AllowedCapabilities *CapabilitySet
    Tools               map[string]*ToolDef
    Stdlib              map[string]*StdlibFn
    Trace               TraceCallback
    RunID               string
}

// ExecResult contains the execution output.
type ExecResult struct {
    Value       Value
    Evidence    []Evidence
    Diagnostics []Diagnostic
}

// Execute runs an A0 program.
// The context controls cancellation and timeout.
func Execute(ctx context.Context, program *ast.Program, options ExecOptions) (*ExecResult, error) {
    ev := &Evaluator{
        ctx:      ctx,
        options:  options,
        env:      NewEnv(),
        evidence: nil,
        budget:   extractBudget(program),
        tracker:  BudgetTracker{StartMs: time.Now()},
        userFns:  make(map[string]*UserFn),
    }

    // Validate capabilities
    requestedCaps := extractCapabilities(program)
    for _, cap := range requestedCaps {
        if !options.AllowedCapabilities.Has(cap) {
            return nil, &A0RuntimeError{
                Code:    "E_CAP_DENIED",
                Message: fmt.Sprintf("Capability '%s' is not allowed by policy.", cap),
            }
        }
    }

    ev.emitTrace(TraceRunStart, program, nil)
    startMs := time.Now()

    result, err := ev.executeBlock(program.Statements, ev.env)
    durationMs := time.Since(startMs).Milliseconds()

    if err != nil {
        ev.emitTrace(TraceRunEnd, program, map[string]Value{
            "durationMs": Number{V: float64(durationMs)},
            "error":      String{V: err.Error()},
        })
        return nil, err
    }

    ev.emitTrace(TraceRunEnd, program, map[string]Value{
        "durationMs": Number{V: float64(durationMs)},
    })

    return &ExecResult{
        Value:    result,
        Evidence: ev.evidence,
    }, nil
}
```

### 14.2 Cancellation Check Points

Context cancellation should be checked at the same points where `enforceTimeBudget` is called:
- Before each statement execution
- Before each expression evaluation
- After tool calls

```go
func (ev *Evaluator) checkCancelled() error {
    select {
    case <-ev.ctx.Done():
        return ev.ctx.Err()
    default:
        return nil
    }
}
```

---

## 15. Record Spread Evaluation

From `evaluator.ts:365-384`:

```go
case *ast.RecordExpr:
    result := &Record{}
    for _, entry := range expr.Pairs {
        switch e := entry.(type) {
        case *ast.SpreadPair:
            val, err := ev.evalExpr(e.Expr, env)
            if err != nil {
                return nil, err
            }
            rec, ok := val.(*Record)
            if !ok {
                return nil, &A0RuntimeError{
                    Code:    "E_TYPE",
                    Message: fmt.Sprintf("Spread requires a record, got %s.", valueTypeName(val)),
                    Span:    &e.GetSpan(),
                }
            }
            // Copy all pairs from spread source
            for _, p := range rec.Pairs {
                result.Set(p.Key, p.Value)
            }
        case *ast.RecordPair:
            val, err := ev.evalExpr(e.Value, env)
            if err != nil {
                return nil, err
            }
            result.Set(e.Key, val)
        }
    }
    return result, nil
```

---

## 16. IdentPath Evaluation

From `evaluator.ts:340-363`:

```go
case *ast.IdentPath:
    base, ok := env.Get(expr.Parts[0])
    if !ok {
        return nil, &A0RuntimeError{
            Code:    "E_UNBOUND",
            Message: fmt.Sprintf("Unbound variable '%s'.", expr.Parts[0]),
            Span:    &expr.GetSpan(),
        }
    }
    // Traverse dotted path
    val := base
    for i := 1; i < len(expr.Parts); i++ {
        rec, ok := val.(*Record)
        if !ok {
            return nil, &A0RuntimeError{
                Code:    "E_PATH",
                Message: fmt.Sprintf("Cannot access '%s' on non-record value.", expr.Parts[i]),
                Span:    &expr.GetSpan(),
            }
        }
        val = rec.Get(expr.Parts[i])
        if val == nil {
            val = Null{}
        }
    }
    return val, nil
```

---

## 17. ExprStmt with Arrow Target

From `evaluator.ts:279-288`. The `->` syntax binds a tool result to a nested path:

```go
case *ast.ExprStmt:
    val, err := ev.evalExpr(stmt.Expr, env)
    if err != nil {
        return nil, err
    }
    if stmt.Target != nil {
        // Build nested record: if target is a.b.c, wrap val as {c: val},
        // then {b: {c: val}}, then set a = {b: {c: val}}
        parts := stmt.Target.Parts
        wrappedVal := val
        for i := len(parts) - 1; i >= 1; i-- {
            wrappedVal = &Record{Pairs: []RecordField{
                {Key: parts[i], Value: wrappedVal},
            }}
        }
        env.Set(parts[0], wrappedVal)
    }
```

---

## 18. Evaluator Structure

```go
// Evaluator executes A0 programs.
type Evaluator struct {
    ctx      context.Context
    options  ExecOptions
    env      *Env
    evidence []Evidence
    budget   Budget
    tracker  BudgetTracker
    userFns  map[string]*UserFn
}

// executeBlock executes a sequence of statements, returning the value
// from the ReturnStmt (or Null if no return).
func (ev *Evaluator) executeBlock(stmts []ast.Stmt, env *Env) (Value, error) {
    var result Value = Null{}

    for _, stmt := range stmts {
        if err := ev.enforceTimeBudget(stmt); err != nil {
            return nil, err
        }
        if err := ev.checkCancelled(); err != nil {
            return nil, err
        }

        ev.emitTrace(TraceStmtStart, stmt, nil)

        switch s := stmt.(type) {
        case *ast.LetStmt:
            val, err := ev.evalExpr(s.Value, env)
            if err != nil {
                return nil, err
            }
            env.Set(s.Name, val)

        case *ast.ExprStmt:
            val, err := ev.evalExpr(s.Expr, env)
            if err != nil {
                return nil, err
            }
            if s.Target != nil {
                // Arrow target binding (see section 17)
                parts := s.Target.Parts
                wrapped := val
                for i := len(parts) - 1; i >= 1; i-- {
                    wrapped = &Record{Pairs: []RecordField{
                        {Key: parts[i], Value: wrapped},
                    }}
                }
                env.Set(parts[0], wrapped)
            }

        case *ast.FnDecl:
            ev.userFns[s.Name] = &UserFn{Decl: s, Closure: env}

        case *ast.ReturnStmt:
            val, err := ev.evalExpr(s.Value, env)
            if err != nil {
                return nil, err
            }
            result = val
            ev.emitTrace(TraceStmtEnd, stmt, nil)
            return result, nil // early return
        }

        ev.emitTrace(TraceStmtEnd, stmt, nil)
    }

    return result, nil
}
```

---

## 19. WASM Considerations

### 19.1 Single-Threaded Execution

WASM runs single-threaded. The Go evaluator must not use goroutines or channels in any code path reachable from WASM. Specifically:

- No `go` statements
- No channel operations
- No `sync.Mutex` (unnecessary in single-threaded context)
- `context.Context` cancellation works without goroutines (manual check via `select` with `default`)

### 19.2 Tool Execution in WASM

In native mode, tools execute via Go's standard library (file I/O, HTTP client, exec). In WASM mode, tools must be provided by the host environment via imported functions. The `ToolDef.Execute` signature uses `context.Context` which works in both modes.

### 19.3 Time Budget in WASM

`time.Now()` works in WASM (both wasip1 and js targets) but may have lower resolution. The `monotime` package or `performance.now()` (js target) could provide better precision if needed.

### 19.4 Memory Management

The evaluator allocates many small `Value` objects. In WASM, these are garbage-collected by Go's runtime (compiled into the WASM binary). No special pooling or arena allocation is needed for correctness, though it may be a performance optimization target later.

---

## 20. File Organization

```
a0-go/
  runtime/
    value.go         -- Value types (Null, Bool, Number, String, List, Record)
    value_util.go    -- deepEqual, isTruthy, valueTypeName, JSON conversion
    env.go           -- Env (scope chain)
    evaluator.go     -- Evaluator struct, Execute(), executeBlock()
    eval_expr.go     -- evalExpr() switch with all expression types
    eval_tool.go     -- Tool call execution logic
    eval_fn.go       -- User function calls, map/reduce/filter higher-order
    eval_op.go       -- Binary/unary operator evaluation
    budget.go        -- Budget/BudgetTracker, enforcement functions
    trace.go         -- TraceEvent types, emission
    evidence.go      -- Evidence collection, assert/check
    error.go         -- A0RuntimeError, exit code mapping
    types.go         -- ToolDef, StdlibFn, ExecOptions, ExecResult interfaces
  runtime_test.go    -- Comprehensive evaluator tests
```

---

## 21. Conformance Testing Strategy

The Go evaluator must produce identical results to the TypeScript reference for all inputs. Testing approach:

1. **Golden output tests:** Run sample A0 programs through both implementations, compare JSON-serialized output values
2. **Error code tests:** Verify that runtime errors produce the same diagnostic codes
3. **Trace event tests:** Compare trace event sequences (event types and ordering)
4. **Budget enforcement tests:** Verify identical behavior at budget boundaries
5. **Edge case tests:**
   - Truthiness: `null`, `false`, `0`, `""`, `[]`, `{}`, `true`, `1`, `"x"`, `[1]`, `{a:1}`
   - Deep equality: nested records, lists with different lengths, mixed types
   - Division by zero, modulo by zero
   - String concatenation with `+`
   - Unary negation of non-numbers
   - Spread on non-record values
   - Closure capture vs call-site scope
   - Nested try/catch
   - Filter predicate truthiness unwrapping
   - Loop with 0 iterations (returns init value)
