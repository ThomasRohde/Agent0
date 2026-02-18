---
sidebar_position: 3
---

# Budgets

Budgets constrain how many resources an A0 program can consume. They act as safety limits for autonomous execution, preventing runaway programs from using excessive time, making too many tool calls, writing too much data, or looping indefinitely.

## Syntax

Declare a `budget` block at the top of your program, after `cap` declarations:

```a0
cap { fs.read: true, fs.write: true }
budget { maxToolCalls: 10, maxBytesWritten: 1024 }

call? fs.read { path: "input.txt" } -> data
do fs.write { path: "output.txt", data: data } -> result

return { result: result }
```

Only declare the budget fields you need. Omitted fields are unconstrained.

## Budget Fields

| Field | Type | Description |
|-------|------|-------------|
| `timeMs` | `int` | Maximum wall-clock time in milliseconds. Checked before each statement executes. |
| `maxToolCalls` | `int` | Maximum total number of tool calls (both `call?` and `do`). |
| `maxBytesWritten` | `int` | Maximum cumulative bytes written via `fs.write`. |
| `maxIterations` | `int` | Maximum cumulative iterations across all `for` loops and `map` calls. |

### timeMs

Limits how long the program can run. The elapsed time is checked at the start of each statement. If the program has exceeded `timeMs` milliseconds since it started, execution halts with `E_BUDGET`.

```a0
budget { timeMs: 5000 }

# Program must complete within 5 seconds
return { status: "done" }
```

### maxToolCalls

Limits the total number of tool invocations. Each `call?` or `do` statement increments the counter. Once the limit is reached, the next tool call produces `E_BUDGET`.

```a0
cap { http.get: true }
budget { maxToolCalls: 3 }

call? http.get { url: "https://api.example.com/1" } -> a
call? http.get { url: "https://api.example.com/2" } -> b
call? http.get { url: "https://api.example.com/3" } -> c
# A fourth call? would produce E_BUDGET

return { statuses: [a.status, b.status, c.status] }
```

### maxBytesWritten

Limits the cumulative bytes written through `fs.write`. The byte count from each write is added to a running total. When the total exceeds the limit, the next write that pushes it over produces `E_BUDGET`.

```a0
cap { fs.write: true }
budget { maxBytesWritten: 4096 }

do fs.write { path: "small.txt", data: "hello" } -> result
return { result: result }
```

### maxIterations

Limits the cumulative number of iterations across **all** `for` loops and `map` calls. Each iteration increments a shared counter. This prevents infinite or excessively long loops.

```a0
budget { maxIterations: 100 }

fn double { n } {
  return { val: n * 2 }
}

let items = range { from: 0, to: 50 }
let doubled = map { in: items, fn: "double" }

# 50 iterations used by map; 50 remaining for any other loops

return { doubled: doubled }
```

## Errors

- **`E_BUDGET`** (exit 4) -- A budget limit was exceeded during execution. The trace event `budget_exceeded` is emitted with details about which field was exceeded, the limit, and the actual value.
- **`E_UNKNOWN_BUDGET`** (exit 2) -- An unrecognized budget field was declared. This is a compile-time validation error. Valid fields are: `timeMs`, `maxToolCalls`, `maxBytesWritten`, `maxIterations`.

## Full Example

A constrained program that reads data, processes it, and writes results:

```a0
cap { fs.read: true, fs.write: true }
budget {
  timeMs: 10000,
  maxToolCalls: 5,
  maxBytesWritten: 8192,
  maxIterations: 1000
}

call? fs.read { path: "data.json" } -> raw
let data = parse.json { in: raw }
let items = get { in: data, path: "items" }

fn format { item } {
  let label = str.concat { parts: [item.name, ": ", item.value] }
  return { label: label }
}

let lines = map { in: items, fn: "format" }
let output = join { in: lines, sep: "\n" }
do fs.write { path: "report.txt", data: output } -> artifact

return { artifact: artifact }
```

## See Also

- [Tools Overview](../tools/overview.md) -- Tool modes and capabilities
- [fs.write](../tools/fs-write.md) -- maxBytesWritten applies to this tool
