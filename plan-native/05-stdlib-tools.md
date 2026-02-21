# 05 - Standard Library and Tools Implementation Plan

This document details the Go/WASM implementation strategy for the A0 standard library (pure functions) and built-in tools (side-effectful operations). It covers interface design, function-by-function porting notes, error handling, schema validation, and WASM/WASI considerations.

---

## Table of Contents

1. [Core Interfaces](#1-core-interfaces)
2. [Value Type System in Go](#2-value-type-system-in-go)
3. [Stdlib Architecture](#3-stdlib-architecture)
4. [Stdlib Function Catalog](#4-stdlib-function-catalog)
5. [Tools Architecture](#5-tools-architecture)
6. [Tool Catalog](#6-tool-catalog)
7. [Schema Validation](#7-schema-validation)
8. [Error Handling](#8-error-handling)
9. [Tool Registry](#9-tool-registry)
10. [WASM/WASI Considerations](#10-wasmwasi-considerations)
11. [TypeScript vs Go Comparison](#11-typescript-vs-go-comparison)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Core Interfaces

The TypeScript runtime defines two key interfaces that tools and stdlib implement. The Go port must replicate these contracts precisely.

### TypeScript Originals

```typescript
// Value types
type A0Value = null | boolean | number | string | A0Value[] | A0Record;
type A0Record = { [key: string]: A0Value };

// Stdlib: synchronous, pure functions
interface StdlibFn {
  name: string;
  execute(args: A0Record): A0Value;
}

// Tools: async, side-effectful operations
interface ToolDef {
  name: string;
  mode: "read" | "effect";
  capabilityId: string;
  inputSchema?: unknown;   // Zod schema at runtime
  outputSchema?: unknown;
  execute(args: A0Record, signal?: AbortSignal): Promise<A0Value>;
}
```

### Go Equivalents

```go
package a0

// A0Value represents any A0 runtime value.
// Possible concrete types: nil, bool, float64, string, []A0Value, A0Record.
type A0Value interface{}

// A0Record is a string-keyed map of A0 values.
type A0Record map[string]A0Value

// StdlibFn defines a pure, synchronous stdlib function.
type StdlibFn interface {
    Name() string
    Execute(args A0Record) (A0Value, error)
}

// ToolMode distinguishes read-only from side-effectful tools.
type ToolMode int

const (
    ToolModeRead   ToolMode = iota
    ToolModeEffect
)

// ToolDef defines a side-effectful tool.
type ToolDef interface {
    Name() string
    Mode() ToolMode
    CapabilityID() string
    InputSchema() *Schema  // nil if no schema
    Execute(ctx context.Context, args A0Record) (A0Value, error)
}
```

**Key differences from TypeScript:**

| Aspect | TypeScript | Go |
|--------|-----------|-----|
| Null | `null` literal | `nil` interface value |
| Numbers | Single `number` (float64) | `float64` (matching JS semantics) |
| Async | `Promise<A0Value>` | `context.Context` parameter |
| Errors | `throw new Error(...)` | Return `error` |
| Schema | Zod objects | Custom `Schema` type or JSON Schema |
| Cancellation | `AbortSignal` | `context.Context` cancellation |

---

## 2. Value Type System in Go

A0 values map to Go types as follows:

| A0 Type | TypeScript | Go Concrete Type | Notes |
|---------|-----------|-----------------|-------|
| `null` | `null` | `nil` | Nil interface |
| `boolean` | `boolean` | `bool` | |
| `number` (int) | `number` | `float64` | All numbers are float64 in JS |
| `number` (float) | `number` | `float64` | |
| `string` | `string` | `string` | |
| `list` | `A0Value[]` | `[]A0Value` | |
| `record` | `A0Record` | `A0Record` (`map[string]A0Value`) | |

### Helper Functions

```go
// Type assertion helpers for safe value extraction.

func AsString(v A0Value) (string, bool) {
    s, ok := v.(string)
    return s, ok
}

func AsFloat(v A0Value) (float64, bool) {
    f, ok := v.(float64)
    return f, ok
}

func AsInt(v A0Value) (int, bool) {
    f, ok := v.(float64)
    if !ok || f != math.Trunc(f) {
        return 0, false
    }
    return int(f), true
}

func AsBool(v A0Value) (bool, bool) {
    b, ok := v.(bool)
    return b, ok
}

func AsList(v A0Value) ([]A0Value, bool) {
    l, ok := v.([]A0Value)
    return l, ok
}

func AsRecord(v A0Value) (A0Record, bool) {
    r, ok := v.(A0Record)
    return r, ok
}

func IsNil(v A0Value) bool {
    return v == nil
}

// IsTruthy implements A0 truthiness rules:
// Falsy: nil, false, 0 (float64), ""
// Truthy: everything else (including empty records, empty lists)
func IsTruthy(v A0Value) bool {
    if v == nil {
        return false
    }
    switch val := v.(type) {
    case bool:
        return val
    case float64:
        return val != 0
    case string:
        return val != ""
    default:
        return true  // lists, records are always truthy
    }
}
```

### Deep Equality

Both the stdlib (`eq`, `contains`, `find`, `unique`, `patch`) and the evaluator rely on deep structural equality. Implement a single canonical `DeepEqual` function:

```go
func DeepEqual(a, b A0Value) bool {
    if a == nil && b == nil {
        return true
    }
    if a == nil || b == nil {
        return false
    }
    switch av := a.(type) {
    case bool:
        bv, ok := b.(bool)
        return ok && av == bv
    case float64:
        bv, ok := b.(float64)
        return ok && av == bv
    case string:
        bv, ok := b.(string)
        return ok && av == bv
    case []A0Value:
        bv, ok := b.([]A0Value)
        if !ok || len(av) != len(bv) {
            return false
        }
        for i := range av {
            if !DeepEqual(av[i], bv[i]) {
                return false
            }
        }
        return true
    case A0Record:
        bv, ok := b.(A0Record)
        if !ok || len(av) != len(bv) {
            return false
        }
        for k, va := range av {
            vb, exists := bv[k]
            if !exists || !DeepEqual(va, vb) {
                return false
            }
        }
        return true
    default:
        return false
    }
}
```

---

## 3. Stdlib Architecture

### Design Principles

1. **Pure functions** - No I/O, no side effects, no context needed
2. **Synchronous** - All stdlib functions return immediately (no goroutines)
3. **Error via return** - Go idiomatic `(A0Value, error)` return
4. **Registered by name** - Functions keyed by their dotted name string (`"parse.json"`, `"str.concat"`, etc.)
5. **Args as A0Record** - All arguments are passed in a single record (never positional)

### Registration Pattern

```go
package stdlib

import "github.com/a0-lang/a0/pkg/a0"

// stdlibFn is a concrete StdlibFn implementation.
type stdlibFn struct {
    name    string
    execute func(args a0.A0Record) (a0.A0Value, error)
}

func (f *stdlibFn) Name() string { return f.name }
func (f *stdlibFn) Execute(args a0.A0Record) (a0.A0Value, error) {
    return f.execute(args)
}

// Register creates a new stdlib function.
func Register(name string, fn func(a0.A0Record) (a0.A0Value, error)) a0.StdlibFn {
    return &stdlibFn{name: name, execute: fn}
}

// GetAll returns all stdlib functions keyed by name.
func GetAll() map[string]a0.StdlibFn {
    fns := make(map[string]a0.StdlibFn)
    for _, fn := range allFns {
        fns[fn.Name()] = fn
    }
    return fns
}

var allFns = []a0.StdlibFn{
    parseJSONFn,
    getFn, putFn,
    patchFn,
    eqFn, containsFn, notFn, andFn, orFn, coalesceFn, typeofFn,
    lenFn, appendFn, concatFn, sortFn, filterFn, findFn, rangeFn, joinFn,
    uniqueFn, pluckFn, flatFn,
    strConcatFn, strSplitFn, strStartsFn, strEndsFn, strReplaceFn, strTemplateFn,
    keysFn, valuesFn, mergeFn, entriesFn,
    mathMaxFn, mathMinFn,
}
```

### Package Layout

```
pkg/
  a0/
    value.go        # A0Value, A0Record, DeepEqual, IsTruthy, type helpers
    interfaces.go   # StdlibFn, ToolDef, ToolMode, Schema interfaces
    errors.go       # A0RuntimeError, diagnostic codes
  stdlib/
    parse_json.go   # parse.json
    path_ops.go     # get, put
    patch.go        # patch (RFC 6902)
    predicates.go   # eq, contains, not, and, or, coalesce, typeof
    list_ops.go     # len, append, concat, sort, filter, find, range, join, unique, pluck, flat
    string_ops.go   # str.concat, str.split, str.starts, str.ends, str.replace, str.template
    record_ops.go   # keys, values, merge, entries
    math_ops.go     # math.max, math.min
    stdlib.go       # GetAll(), registration
  tools/
    fs.go           # fs.read, fs.write, fs.list, fs.exists
    http.go         # http.get
    sh.go           # sh.exec
    registry.go     # tool registration
    schemas.go      # input validation schemas
```

---

## 4. Stdlib Function Catalog

### 4.1 Data Functions

#### `parse.json`

Parses a JSON string into an A0 value.

| Property | TypeScript | Go |
|----------|-----------|-----|
| Input | `{ in: string }` | `args["in"]` must be `string` |
| Output | `A0Value` (parsed JSON) | `A0Value` |
| Error | Throws on non-string input or invalid JSON | Returns `error` |

```go
var parseJSONFn = Register("parse.json", func(args a0.A0Record) (a0.A0Value, error) {
    input, ok := a0.AsString(args["in"])
    if !ok {
        return nil, fmt.Errorf("parse.json requires 'in' to be a string.")
    }
    var result a0.A0Value
    if err := json.Unmarshal([]byte(input), &result); err != nil {
        return nil, err
    }
    // json.Unmarshal produces map[string]interface{}, []interface{}, etc.
    // Need to normalize to A0Value types.
    return normalizeJSON(result), nil
})
```

**Go-specific concern:** `encoding/json` unmarshals numbers as `float64` by default, which matches A0 semantics. However, `json.Unmarshal` produces `map[string]interface{}` not `A0Record`, so a recursive normalization pass is needed to convert `interface{}` values to proper `A0Value` types.

```go
func normalizeJSON(v interface{}) a0.A0Value {
    if v == nil {
        return nil
    }
    switch val := v.(type) {
    case bool:
        return val
    case float64:
        return val
    case string:
        return val
    case []interface{}:
        result := make([]a0.A0Value, len(val))
        for i, item := range val {
            result[i] = normalizeJSON(item)
        }
        return result
    case map[string]interface{}:
        result := make(a0.A0Record, len(val))
        for k, item := range val {
            result[k] = normalizeJSON(item)
        }
        return result
    default:
        return nil
    }
}
```

#### `get`

Reads a value at a dotted/bracketed path from a record.

| Property | TypeScript | Go |
|----------|-----------|-----|
| Input | `{ in: any, path: string }` | path string like `"a.b[0].c"` |
| Output | Value at path, or `null` if not found | `nil` if not found |
| Error | Throws if `path` is not a string | Returns `error` |

**Path syntax:** `"foo.bar[0].baz"` - dot-separated keys, bracket notation for array indices.

```go
func parsePath(pathStr string) []pathSegment {
    // Split on dots and bracket notation [N]
    // Returns a mix of string keys and integer indices
    // e.g., "a.b[0].c" -> ["a", "b", 0, "c"]
}

type pathSegment struct {
    key   string
    index int
    isIdx bool
}

func getByPath(obj a0.A0Value, segments []pathSegment) a0.A0Value {
    current := obj
    for _, seg := range segments {
        if current == nil {
            return nil
        }
        if seg.isIdx {
            list, ok := a0.AsList(current)
            if !ok || seg.index >= len(list) {
                return nil
            }
            current = list[seg.index]
        } else {
            rec, ok := a0.AsRecord(current)
            if !ok {
                return nil
            }
            val, exists := rec[seg.key]
            if !exists {
                return nil
            }
            current = val
        }
    }
    return current
}
```

#### `put`

Returns a new record/list with a value set at a dotted path. Creates intermediate records as needed.

| Property | TypeScript | Go |
|----------|-----------|-----|
| Input | `{ in: any, path: string, value: any }` | Immutable update |
| Output | New record with value set | Deep copy semantics |

**Implementation note:** The TypeScript version does structural sharing via shallow spread (`{...obj}`). In Go, use `maps.Clone()` or manual iteration for shallow copies at each path level.

```go
func putByPath(obj a0.A0Value, segments []pathSegment, value a0.A0Value) a0.A0Value {
    if len(segments) == 0 {
        return value
    }
    seg := segments[0]
    rest := segments[1:]

    if seg.isIdx {
        var arr []a0.A0Value
        if list, ok := a0.AsList(obj); ok {
            arr = make([]a0.A0Value, len(list))
            copy(arr, list)
        }
        for len(arr) <= seg.index {
            arr = append(arr, nil)
        }
        arr[seg.index] = putByPath(arr[seg.index], rest, value)
        return arr
    }

    rec := make(a0.A0Record)
    if r, ok := a0.AsRecord(obj); ok {
        for k, v := range r {
            rec[k] = v
        }
    }
    existing := rec[seg.key] // nil if missing
    rec[seg.key] = putByPath(existing, rest, value)
    return rec
}
```

#### `patch`

Applies JSON Patch (RFC 6902) operations. Supports `add`, `remove`, `replace`, `move`, `copy`, `test`.

| Property | TypeScript | Go |
|----------|-----------|-----|
| Input | `{ in: any, ops: list }` | Each op is a record with `op`, `path`, optional `value`, `from` |
| Output | Patched document | |
| Complexity | ~260 lines in TS | Similar in Go, pointer parsing + recursive ops |

**Implementation notes:**

- JSON Pointer parsing: `/` separated segments, `~0` encodes `~`, `~1` encodes `/`
- Array indices: numeric segments, `-` for append position in `add`
- `test` op requires deep equality check
- Each operation is applied sequentially, mutating a working copy
- Go implementation should use the same `DeepEqual` from the value package

The patch implementation is the most complex stdlib function. Consider using an existing Go JSON Patch library (e.g., `github.com/evanphx/json-patch`) as a reference, but the implementation must operate on `A0Value` types directly, not raw JSON bytes.

### 4.2 Predicate Functions

All predicates use A0 truthiness semantics (falsy: `nil`, `false`, `0.0`, `""`).

| Function | Args | Return | Notes |
|----------|------|--------|-------|
| `eq` | `{ a, b }` | `bool` | Deep structural equality |
| `contains` | `{ in, value }` | `bool` | String: substring. List: deep membership. Record: key existence |
| `not` | `{ in }` | `bool` | `!IsTruthy(in)` |
| `and` | `{ a, b }` | `bool` | `IsTruthy(a) && IsTruthy(b)` |
| `or` | `{ a, b }` | `bool` | `IsTruthy(a) \|\| IsTruthy(b)` |
| `coalesce` | `{ in, default }` | any | Returns `in` if not nil, else `default`. Strictly null-checking (NOT truthiness) |
| `typeof` | `{ in }` | `string` | Returns: `"null"`, `"boolean"`, `"number"`, `"string"`, `"list"`, `"record"` |

```go
var containsFn = Register("contains", func(args a0.A0Record) (a0.A0Value, error) {
    input := args["in"]
    value := args["value"]

    switch in := input.(type) {
    case string:
        s, ok := value.(string)
        if !ok {
            return false, nil
        }
        return strings.Contains(in, s), nil
    case []a0.A0Value:
        for _, el := range in {
            if a0.DeepEqual(el, value) {
                return true, nil
            }
        }
        return false, nil
    case a0.A0Record:
        key, ok := value.(string)
        if !ok {
            return false, nil
        }
        _, exists := in[key]
        return exists, nil
    default:
        return false, nil
    }
})

var coalesceFn = Register("coalesce", func(args a0.A0Record) (a0.A0Value, error) {
    input := args["in"]
    fallback := args["default"]
    if input != nil {
        return input, nil
    }
    return fallback, nil
})

var typeofFn = Register("typeof", func(args a0.A0Record) (a0.A0Value, error) {
    input := args["in"]
    if input == nil {
        return "null", nil
    }
    switch input.(type) {
    case bool:
        return "boolean", nil
    case float64:
        return "number", nil
    case string:
        return "string", nil
    case []a0.A0Value:
        return "list", nil
    case a0.A0Record:
        return "record", nil
    default:
        return "record", nil
    }
})
```

### 4.3 List Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `len` | `{ in: list\|str\|record }` -> `int` | List length, string length, or record key count |
| `append` | `{ in: list, value: any }` -> `list` | Returns new list (does not mutate) |
| `concat` | `{ a: list, b: list }` -> `list` | Concatenate two lists |
| `sort` | `{ in: list, by?: str\|list }` -> `list` | Natural sort; `by` selects record keys for multi-key sort |
| `filter` | `{ in: list, by: str }` -> `list` | Keep records where `element[by]` is truthy |
| `find` | `{ in: list, key: str, value: any }` -> `any\|nil` | First record where `element[key]` deeply equals `value` |
| `range` | `{ from: int, to: int }` -> `list` | Integers from `from` (inclusive) to `to` (exclusive) |
| `join` | `{ in: list, sep?: str }` -> `str` | Join elements as strings, default sep `""` |
| `unique` | `{ in: list }` -> `list` | Remove duplicates via deep equality, preserve first-occurrence order |
| `pluck` | `{ in: list, key: str }` -> `list` | Extract one field from each record; non-records yield `nil` |
| `flat` | `{ in: list }` -> `list` | Flatten one level of nesting |

**Sort implementation note:** The TypeScript sort uses `localeCompare` for strings. In Go, use standard string comparison (`<`/`>`), which gives lexicographic byte ordering. Document this behavioral difference. For the `by` parameter, the TS version supports both a single string and a list of strings for multi-key sorting.

```go
var sortFn = Register("sort", func(args a0.A0Record) (a0.A0Value, error) {
    input, ok := a0.AsList(args["in"])
    if !ok {
        return nil, fmt.Errorf("sort: 'in' must be a list")
    }
    by := args["by"]

    // Normalize by to []string or nil
    var keys []string
    if by != nil {
        switch v := by.(type) {
        case string:
            keys = []string{v}
        case []a0.A0Value:
            keys = make([]string, len(v))
            for i, k := range v {
                s, ok := k.(string)
                if !ok {
                    return nil, fmt.Errorf("sort: 'by' array elements must be strings")
                }
                keys[i] = s
            }
        default:
            return nil, fmt.Errorf("sort: 'by' must be a string or list of strings")
        }
    }

    sorted := make([]a0.A0Value, len(input))
    copy(sorted, input)
    sort.SliceStable(sorted, func(i, j int) bool {
        if keys == nil {
            return compareValues(sorted[i], sorted[j]) < 0
        }
        for _, key := range keys {
            a := getRecordField(sorted[i], key)
            b := getRecordField(sorted[j], key)
            cmp := compareValues(a, b)
            if cmp != 0 {
                return cmp < 0
            }
        }
        return false
    })
    return sorted, nil
})
```

**Behavioral note on `sort` stability:** Go's `sort.SliceStable` provides stable sorting (preserving original order for equal elements), which matches JavaScript's `Array.prototype.sort` behavior in modern engines.

### 4.4 String Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `str.concat` | `{ parts: list }` -> `str` | Concatenate all parts (coerced to string via `fmt.Sprint`) |
| `str.split` | `{ in: str, sep: str }` -> `list` | Split string by separator |
| `str.starts` | `{ in: str, value: str }` -> `bool` | `strings.HasPrefix` |
| `str.ends` | `{ in: str, value: str }` -> `bool` | `strings.HasSuffix` |
| `str.replace` | `{ in: str, from: str, to: str }` -> `str` | Replace ALL occurrences (`strings.ReplaceAll`) |
| `str.template` | `{ in: str, vars: record }` -> `str` | Replace `{key}` placeholders; unmatched left as-is |

```go
var strTemplateFn = Register("str.template", func(args a0.A0Record) (a0.A0Value, error) {
    input, ok := a0.AsString(args["in"])
    if !ok {
        return nil, fmt.Errorf("str.template: 'in' must be a string")
    }
    vars, ok := a0.AsRecord(args["vars"])
    if !ok {
        return nil, fmt.Errorf("str.template: 'vars' must be a record")
    }
    // Replace {key} placeholders
    re := regexp.MustCompile(`\{([^}]+)\}`)
    result := re.ReplaceAllStringFunc(input, func(match string) string {
        key := match[1 : len(match)-1]
        val, exists := vars[key]
        if !exists || val == nil {
            return match // leave unmatched placeholders as-is
        }
        return fmt.Sprint(val)
    })
    return result, nil
})
```

**Performance note:** Compile the regex once at package init, not per call. Use a package-level `var tmplRe = regexp.MustCompile(...)`.

### 4.5 Record Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `keys` | `{ in: record }` -> `list` | Returns list of string keys |
| `values` | `{ in: record }` -> `list` | Returns list of values |
| `merge` | `{ a: record, b: record }` -> `record` | Shallow merge, `b` wins on conflicts |
| `entries` | `{ in: record }` -> `list` | Returns `[{ key, value }, ...]` pairs |

**Go-specific concern:** Go maps have non-deterministic iteration order. The TypeScript implementation uses `Object.keys()` which returns insertion-order keys. For `keys`, `values`, and `entries`, sort the keys alphabetically for deterministic output, or consider using an ordered map. This is a known behavioral difference to document.

```go
var keysFn = Register("keys", func(args a0.A0Record) (a0.A0Value, error) {
    rec, ok := a0.AsRecord(args["in"])
    if !ok {
        return nil, fmt.Errorf("keys: 'in' must be a record")
    }
    keys := make([]string, 0, len(rec))
    for k := range rec {
        keys = append(keys, k)
    }
    sort.Strings(keys) // deterministic order
    result := make([]a0.A0Value, len(keys))
    for i, k := range keys {
        result[i] = k
    }
    return result, nil
})

var entriesFn = Register("entries", func(args a0.A0Record) (a0.A0Value, error) {
    rec, ok := a0.AsRecord(args["in"])
    if !ok {
        return nil, fmt.Errorf("entries: 'in' must be a record")
    }
    keys := make([]string, 0, len(rec))
    for k := range rec {
        keys = append(keys, k)
    }
    sort.Strings(keys)
    result := make([]a0.A0Value, len(keys))
    for i, k := range keys {
        result[i] = a0.A0Record{
            "key":   k,
            "value": rec[k],
        }
    }
    return result, nil
})
```

### 4.6 Math Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `math.max` | `{ in: list }` -> `number` | Maximum of numeric list. Error on empty or non-numbers |
| `math.min` | `{ in: list }` -> `number` | Minimum of numeric list. Error on empty or non-numbers |

```go
var mathMaxFn = Register("math.max", func(args a0.A0Record) (a0.A0Value, error) {
    input, ok := a0.AsList(args["in"])
    if !ok {
        return nil, fmt.Errorf("math.max: 'in' must be a list")
    }
    if len(input) == 0 {
        return nil, fmt.Errorf("math.max: list must not be empty")
    }
    max := math.Inf(-1)
    for _, item := range input {
        n, ok := item.(float64)
        if !ok {
            return nil, fmt.Errorf("math.max: all elements must be numbers")
        }
        if n > max {
            max = n
        }
    }
    return max, nil
})
```

---

## 5. Tools Architecture

### Design Principles

1. **Async via context** - All tools accept `context.Context` for cancellation and timeouts
2. **Capability-gated** - Each tool declares a `capabilityId`; the evaluator checks capability before calling
3. **Schema-validated** - Input arguments are validated before execution
4. **Mode-tagged** - `read` tools use `call?`, `effect` tools use `do`
5. **Pluggable** - Tools are registered in a map, allowing hosts to add/remove tools

### Tool Implementation Pattern

```go
package tools

import (
    "context"
    "github.com/a0-lang/a0/pkg/a0"
)

type tool struct {
    name         string
    mode         a0.ToolMode
    capabilityID string
    inputSchema  *a0.Schema
    executeFn    func(ctx context.Context, args a0.A0Record) (a0.A0Value, error)
}

func (t *tool) Name() string                { return t.name }
func (t *tool) Mode() a0.ToolMode           { return t.mode }
func (t *tool) CapabilityID() string         { return t.capabilityID }
func (t *tool) InputSchema() *a0.Schema      { return t.inputSchema }
func (t *tool) Execute(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
    return t.executeFn(ctx, args)
}
```

---

## 6. Tool Catalog

### 6.1 `fs.read` - Read a File

| Property | Value |
|----------|-------|
| Mode | `read` |
| Capability | `fs.read` |
| Args | `{ path: string, encoding?: string }` |
| Return | `string` (file contents) |

```go
var FsRead = &tool{
    name:         "fs.read",
    mode:         a0.ToolModeRead,
    capabilityID: "fs.read",
    inputSchema:  fsReadSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        path, ok := a0.AsString(args["path"])
        if !ok {
            return nil, fmt.Errorf("fs.read requires a 'path' argument of type string.")
        }
        encoding, _ := a0.AsString(args["encoding"])
        if encoding == "" {
            encoding = "utf8"
        }

        resolved := filepath.Clean(path)
        data, err := os.ReadFile(resolved)
        if err != nil {
            return nil, err
        }
        if encoding == "utf8" {
            return string(data), nil
        }
        // base64 encoding
        return base64.StdEncoding.EncodeToString(data), nil
    },
}
```

### 6.2 `fs.write` - Write Data to File

| Property | Value |
|----------|-------|
| Mode | `effect` |
| Capability | `fs.write` |
| Args | `{ path: string, data: any, format?: string }` |
| Return | `{ kind: "file", path: string, bytes: int, sha256: string }` |

```go
var FsWrite = &tool{
    name:         "fs.write",
    mode:         a0.ToolModeEffect,
    capabilityID: "fs.write",
    inputSchema:  fsWriteSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        path, ok := a0.AsString(args["path"])
        if !ok {
            return nil, fmt.Errorf("fs.write requires a 'path' argument of type string.")
        }
        format, _ := a0.AsString(args["format"])
        if format == "" {
            format = "raw"
        }

        var data string
        if format == "json" {
            bytes, err := json.MarshalIndent(args["data"], "", "  ")
            if err != nil {
                return nil, err
            }
            data = string(bytes)
        } else if s, ok := a0.AsString(args["data"]); ok {
            data = s
        } else {
            bytes, err := json.Marshal(args["data"])
            if err != nil {
                return nil, err
            }
            data = string(bytes)
        }

        resolved, _ := filepath.Abs(path)
        dir := filepath.Dir(resolved)
        if err := os.MkdirAll(dir, 0755); err != nil {
            return nil, err
        }
        if err := os.WriteFile(resolved, []byte(data), 0644); err != nil {
            return nil, err
        }

        hash := sha256.Sum256([]byte(data))
        return a0.A0Record{
            "kind":   "file",
            "path":   resolved,
            "bytes":  float64(len([]byte(data))),
            "sha256": hex.EncodeToString(hash[:]),
        }, nil
    },
}
```

### 6.3 `fs.list` - List Directory Contents

| Property | Value |
|----------|-------|
| Mode | `read` |
| Capability | `fs.read` (shares with `fs.read` and `fs.exists`) |
| Args | `{ path: string }` |
| Return | `[{ name: string, type: string }]` where type is `"file"`, `"directory"`, or `"other"` |

```go
var FsList = &tool{
    name:         "fs.list",
    mode:         a0.ToolModeRead,
    capabilityID: "fs.read",
    inputSchema:  fsListSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        dirPath, ok := a0.AsString(args["path"])
        if !ok {
            return nil, fmt.Errorf("fs.list requires a 'path' argument of type string.")
        }
        resolved, _ := filepath.Abs(dirPath)
        entries, err := os.ReadDir(resolved)
        if err != nil {
            return nil, err
        }
        result := make([]a0.A0Value, len(entries))
        for i, entry := range entries {
            entryType := "other"
            if entry.IsDir() {
                entryType = "directory"
            } else if entry.Type().IsRegular() {
                entryType = "file"
            }
            result[i] = a0.A0Record{
                "name": entry.Name(),
                "type": entryType,
            }
        }
        return result, nil
    },
}
```

### 6.4 `fs.exists` - Check If Path Exists

| Property | Value |
|----------|-------|
| Mode | `read` |
| Capability | `fs.read` (shares with `fs.read` and `fs.list`) |
| Args | `{ path: string }` |
| Return | `bool` |

```go
var FsExists = &tool{
    name:         "fs.exists",
    mode:         a0.ToolModeRead,
    capabilityID: "fs.read",
    inputSchema:  fsExistsSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        filePath, ok := a0.AsString(args["path"])
        if !ok {
            return nil, fmt.Errorf("fs.exists requires a 'path' argument of type string.")
        }
        resolved, _ := filepath.Abs(filePath)
        _, err := os.Stat(resolved)
        return err == nil, nil
    },
}
```

### 6.5 `http.get` - HTTP GET Request

| Property | Value |
|----------|-------|
| Mode | `read` |
| Capability | `http.get` |
| Args | `{ url: string, headers?: record }` |
| Return | `{ status: int, headers: record, body: string }` |

```go
var HttpGet = &tool{
    name:         "http.get",
    mode:         a0.ToolModeRead,
    capabilityID: "http.get",
    inputSchema:  httpGetSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        url, ok := a0.AsString(args["url"])
        if !ok {
            return nil, fmt.Errorf("http.get requires a 'url' argument of type string.")
        }

        req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
        if err != nil {
            return nil, err
        }

        // Apply custom headers
        if hdrs, ok := a0.AsRecord(args["headers"]); ok {
            for k, v := range hdrs {
                if s, ok := v.(string); ok {
                    req.Header.Set(k, s)
                }
            }
        }

        client := &http.Client{}
        resp, err := client.Do(req)
        if err != nil {
            return nil, err
        }
        defer resp.Body.Close()

        body, err := io.ReadAll(resp.Body)
        if err != nil {
            return nil, err
        }

        respHeaders := make(a0.A0Record)
        for k, vals := range resp.Header {
            if len(vals) > 0 {
                respHeaders[strings.ToLower(k)] = vals[0]
            }
        }

        return a0.A0Record{
            "status":  float64(resp.StatusCode),
            "headers": respHeaders,
            "body":    string(body),
        }, nil
    },
}
```

**Behavioral note:** The TypeScript version uses the global `fetch()` API which returns lowercase header names. Go's `http.Response.Header` uses canonical form (`Content-Type`). We lowercase header names for compatibility.

### 6.6 `sh.exec` - Execute Shell Command

| Property | Value |
|----------|-------|
| Mode | `effect` |
| Capability | `sh.exec` |
| Args | `{ cmd: string, cwd?: string, env?: record, timeoutMs?: number }` |
| Return | `{ exitCode: int, stdout: string, stderr: string, durationMs: int }` |

```go
var ShExec = &tool{
    name:         "sh.exec",
    mode:         a0.ToolModeEffect,
    capabilityID: "sh.exec",
    inputSchema:  shExecSchema,
    executeFn: func(ctx context.Context, args a0.A0Record) (a0.A0Value, error) {
        cmd, ok := a0.AsString(args["cmd"])
        if !ok {
            return nil, fmt.Errorf("sh.exec requires a 'cmd' argument of type string.")
        }

        cwd, _ := a0.AsString(args["cwd"])
        if cwd == "" {
            cwd, _ = os.Getwd()
        }

        timeoutMs := 30000.0
        if t, ok := a0.AsFloat(args["timeoutMs"]); ok {
            timeoutMs = t
        }

        // Create timeout context
        timeout := time.Duration(timeoutMs) * time.Millisecond
        execCtx, cancel := context.WithTimeout(ctx, timeout)
        defer cancel()

        // Build command - use shell to interpret the command string
        var execCmd *exec.Cmd
        if runtime.GOOS == "windows" {
            execCmd = exec.CommandContext(execCtx, "cmd", "/C", cmd)
        } else {
            execCmd = exec.CommandContext(execCtx, "sh", "-c", cmd)
        }
        execCmd.Dir = cwd

        // Environment
        execCmd.Env = os.Environ()
        if envRec, ok := a0.AsRecord(args["env"]); ok {
            for k, v := range envRec {
                if s, ok := v.(string); ok {
                    execCmd.Env = append(execCmd.Env, k+"="+s)
                }
            }
        }

        var stdout, stderr bytes.Buffer
        execCmd.Stdout = &stdout
        execCmd.Stderr = &stderr

        start := time.Now()
        err := execCmd.Run()
        durationMs := time.Since(start).Milliseconds()

        exitCode := 0
        if err != nil {
            if exitErr, ok := err.(*exec.ExitError); ok {
                exitCode = exitErr.ExitCode()
            } else {
                exitCode = 1
            }
        }

        return a0.A0Record{
            "exitCode":   float64(exitCode),
            "stdout":     stdout.String(),
            "stderr":     stderr.String(),
            "durationMs": float64(durationMs),
        }, nil
    },
}
```

**WASM note:** `sh.exec` cannot run in a WASM sandbox. See Section 10 for WASI considerations.

---

## 7. Schema Validation

The TypeScript version uses Zod for input schema validation. In Go, there are several options:

### Option A: Go Struct Tags + Custom Validator

```go
type FsReadInput struct {
    Path     string `a0:"path,required"`
    Encoding string `a0:"encoding,optional"`
}
```

### Option B: JSON Schema

Store schemas as JSON Schema documents and validate using a library like `github.com/santhosh-tekuri/jsonschema`.

### Option C: Programmatic Validation (Recommended)

Define a lightweight validation DSL that mirrors the Zod schemas:

```go
type Schema struct {
    Fields []FieldSchema
}

type FieldSchema struct {
    Name     string
    Type     string // "string", "number", "record", "any"
    Required bool
}

func (s *Schema) Validate(args a0.A0Record) error {
    for _, field := range s.Fields {
        val, exists := args[field.Name]
        if field.Required && (!exists || val == nil) {
            return fmt.Errorf("%s is required", field.Name)
        }
        if exists && val != nil && field.Type != "any" {
            if err := checkType(val, field.Type); err != nil {
                return fmt.Errorf("field '%s': %w", field.Name, err)
            }
        }
    }
    return nil
}

// Schema definitions matching the TypeScript Zod schemas
var fsReadSchema = &Schema{Fields: []FieldSchema{
    {Name: "path", Type: "string", Required: true},
    {Name: "encoding", Type: "string", Required: false},
}}

var fsWriteSchema = &Schema{Fields: []FieldSchema{
    {Name: "path", Type: "string", Required: true},
    {Name: "data", Type: "any", Required: true},
    {Name: "format", Type: "string", Required: false},
}}

var httpGetSchema = &Schema{Fields: []FieldSchema{
    {Name: "url", Type: "string", Required: true},
    {Name: "headers", Type: "record", Required: false},
}}

var fsListSchema = &Schema{Fields: []FieldSchema{
    {Name: "path", Type: "string", Required: true},
}}

var fsExistsSchema = &Schema{Fields: []FieldSchema{
    {Name: "path", Type: "string", Required: true},
}}

var shExecSchema = &Schema{Fields: []FieldSchema{
    {Name: "cmd", Type: "string", Required: true},
    {Name: "cwd", Type: "string", Required: false},
    {Name: "timeoutMs", Type: "number", Required: false},
    {Name: "env", Type: "record", Required: false},
}}
```

**Recommendation:** Option C (programmatic validation) keeps the Go code dependency-free and aligns with the simple validation needs. The TypeScript Zod schemas are simple (no nested objects, no unions, no transforms), so a lightweight custom validator is sufficient.

---

## 8. Error Handling

### Stdlib Error Model

All stdlib functions throw (return error) on invalid inputs. The evaluator wraps these as `E_FN` (exit 4).

```go
// In the evaluator, when calling a stdlib function:
result, err := stdlibFn.Execute(args)
if err != nil {
    return nil, &a0.A0RuntimeError{
        Code:    "E_FN",
        Message: err.Error(),
        Span:    currentSpan,
    }
}
```

### Tool Error Model

Tool errors become `E_TOOL` (exit 4). Tool argument schema validation errors become `E_TOOL_ARGS` (exit 4).

```go
// In the evaluator, when calling a tool:
if tool.InputSchema() != nil {
    if err := tool.InputSchema().Validate(args); err != nil {
        return nil, &a0.A0RuntimeError{
            Code:    "E_TOOL_ARGS",
            Message: fmt.Sprintf("%s: %s", tool.Name(), err.Error()),
            Span:    currentSpan,
        }
    }
}
result, err := tool.Execute(ctx, args)
if err != nil {
    return nil, &a0.A0RuntimeError{
        Code:    "E_TOOL",
        Message: fmt.Sprintf("%s: %s", tool.Name(), err.Error()),
        Span:    currentSpan,
    }
}
```

### Error Message Compatibility

Error messages must match the TypeScript versions for conformance testing. Use the exact same error strings, e.g.:

- `"parse.json requires 'in' to be a string."`
- `"sort: 'in' must be a list"`
- `"math.max: all elements must be numbers"`
- `"fs.read requires a 'path' argument of type string."`

---

## 9. Tool Registry

The TypeScript version uses a mutable global `Map<string, ToolDef>`. The Go version should support both global registration and instance-based registration.

```go
package tools

import "github.com/a0-lang/a0/pkg/a0"

// Registry holds registered tools.
type Registry struct {
    tools map[string]a0.ToolDef
}

func NewRegistry() *Registry {
    return &Registry{tools: make(map[string]a0.ToolDef)}
}

func (r *Registry) Register(tool a0.ToolDef) {
    r.tools[tool.Name()] = tool
}

func (r *Registry) Get(name string) (a0.ToolDef, bool) {
    t, ok := r.tools[name]
    return t, ok
}

func (r *Registry) All() map[string]a0.ToolDef {
    result := make(map[string]a0.ToolDef, len(r.tools))
    for k, v := range r.tools {
        result[k] = v
    }
    return result
}

// RegisterBuiltin registers all built-in tools.
func (r *Registry) RegisterBuiltin() {
    r.Register(FsRead)
    r.Register(FsWrite)
    r.Register(FsList)
    r.Register(FsExists)
    r.Register(HttpGet)
    r.Register(ShExec)
}
```

---

## 10. WASM/WASI Considerations

### Stdlib in WASM

All stdlib functions are pure computations with no system dependencies. They will work identically in WASM and native builds with no changes needed.

### Tools in WASM

Tools require I/O and system access. WASI (WebAssembly System Interface) provides limited access:

| Tool | WASI Support | Notes |
|------|-------------|-------|
| `fs.read` | WASI filesystem | Requires pre-opened directories |
| `fs.write` | WASI filesystem | Requires pre-opened directories |
| `fs.list` | WASI filesystem | `fd_readdir` |
| `fs.exists` | WASI filesystem | `path_filestat_get` |
| `http.get` | Not in WASI Preview 1 | Requires WASI HTTP proposal or host function |
| `sh.exec` | Not in WASI | Requires host function |

### Build Tags

Use Go build tags to provide platform-specific tool implementations:

```go
//go:build !wasm

package tools

// Native fs.read implementation using os.ReadFile
```

```go
//go:build wasm

package tools

// WASM fs.read implementation using WASI fd_read
```

### Host Function Injection

For capabilities not available in WASI (like `http.get` and `sh.exec`), the Go runtime should support host-injected tool implementations:

```go
// The host (browser, Node.js, or other embedder) provides these
type HostFunctions struct {
    HttpGet func(ctx context.Context, url string, headers map[string]string) (HttpResponse, error)
    ShExec  func(ctx context.Context, cmd string, opts ShExecOpts) (ShExecResult, error)
}
```

This allows the WASM module to delegate tool execution to the host environment.

### WASM-Specific Behavioral Differences

1. **File paths**: WASI uses pre-opened directory handles, not absolute paths. The `fs.*` tools need path translation logic.
2. **No shell access**: `sh.exec` is entirely host-dependent in WASM.
3. **HTTP**: Requires either the WASI HTTP proposal or host function bridging.
4. **Timeouts**: `context.Context` deadlines work in WASM but depend on the host's event loop.

---

## 11. TypeScript vs Go Comparison

### Stdlib Function Comparison

| Aspect | TypeScript | Go |
|--------|-----------|-----|
| Error handling | `throw new Error(msg)` | Return `(nil, error)` |
| Null handling | `args["key"] ?? null` | `args["key"]` (nil for missing) |
| String coercion | `String(val)` | `fmt.Sprint(val)` |
| Array spread | `[...arr, val]` | `append(slices.Clone(arr), val)` |
| Object spread | `{...a, ...b}` | Manual map copy + merge |
| Regex | `RegExp` | `regexp.MustCompile` (compile once) |
| JSON parse | `JSON.parse()` | `json.Unmarshal()` + normalize |
| Deep equality | Custom recursive | Custom recursive (same semantics) |
| Sort stability | Engine-dependent (stable in modern) | `sort.SliceStable` (guaranteed) |
| Map iteration | Insertion order | Non-deterministic (must sort for determinism) |
| Number types | Single `number` (float64) | `float64` only |
| Type check | `typeof`, `Array.isArray()` | Type switch |

### Tool Comparison

| Aspect | TypeScript | Go |
|--------|-----------|-----|
| Async | `async/await` + `Promise` | `context.Context` |
| File I/O | `node:fs` sync APIs | `os.ReadFile`/`os.WriteFile` |
| HTTP | Global `fetch()` | `net/http.Client` |
| Shell exec | `child_process.execSync` | `os/exec.CommandContext` |
| Hashing | `node:crypto` | `crypto/sha256` |
| Path resolution | `path.resolve()` | `filepath.Abs()` |
| Cancellation | `AbortSignal` | `context.Context` cancellation |
| Schema validation | Zod | Custom lightweight validator |
| Buffer handling | Node `Buffer` | `[]byte` |

---

## 12. Testing Strategy

### Conformance Tests

Create a shared test fixture format (JSON or YAML) that both the TypeScript and Go implementations validate against:

```json
{
  "function": "sort",
  "cases": [
    {
      "name": "sort numbers",
      "args": { "in": [3, 1, 2] },
      "expected": [1, 2, 3]
    },
    {
      "name": "sort by key",
      "args": { "in": [{"name": "b"}, {"name": "a"}], "by": "name" },
      "expected": [{"name": "a"}, {"name": "b"}]
    },
    {
      "name": "sort empty list",
      "args": { "in": [] },
      "expected": []
    }
  ]
}
```

### Stdlib Test Categories

For each stdlib function, test:

1. **Happy path** - Normal inputs produce expected outputs
2. **Type errors** - Wrong argument types produce the correct error message
3. **Edge cases** - Empty lists, empty strings, null values, nested structures
4. **Deep equality** - For functions using `DeepEqual` (eq, contains, find, unique)

### Tool Test Categories

1. **Schema validation** - Missing required args, wrong types
2. **Execution** - Successful operations with known inputs
3. **Error handling** - File not found, network errors, command failures
4. **Context cancellation** - Tools respect context deadlines

### Go Test Structure

```go
func TestParseJSON(t *testing.T) {
    tests := []struct {
        name    string
        args    a0.A0Record
        want    a0.A0Value
        wantErr string
    }{
        {
            name: "parse object",
            args: a0.A0Record{"in": `{"key": 42}`},
            want: a0.A0Record{"key": float64(42)},
        },
        {
            name:    "non-string input",
            args:    a0.A0Record{"in": float64(42)},
            wantErr: "parse.json requires 'in' to be a string.",
        },
        {
            name:    "invalid JSON",
            args:    a0.A0Record{"in": "{bad}"},
            wantErr: "invalid character",
        },
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := parseJSONFn.Execute(tt.args)
            if tt.wantErr != "" {
                if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
                    t.Errorf("expected error containing %q, got %v", tt.wantErr, err)
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }
            if !a0.DeepEqual(got, tt.want) {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

### Known Behavioral Differences to Test

1. **Map iteration order**: `keys`, `values`, `entries` may differ from TypeScript insertion order. Go version should sort for determinism.
2. **String sort**: `localeCompare` (JS) vs byte comparison (Go). Most ASCII strings behave the same, but Unicode ordering may differ.
3. **JSON number precision**: Both use float64, but edge cases with very large integers (> 2^53) may differ in serialization.
4. **Regex behavior**: `str.template` uses regex. Go's `regexp` package uses RE2 (no backreferences), which is sufficient for the `{key}` pattern used here.
5. **Path resolution**: `path.resolve()` vs `filepath.Abs()` behave differently on Windows vs Unix. The Go version handles this natively.
