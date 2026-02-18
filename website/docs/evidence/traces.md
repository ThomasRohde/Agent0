---
sidebar_position: 2
---

# Traces

A0 produces structured trace files that record every step of program execution. Traces are the primary tool for debugging runtime issues and auditing program behavior.

## Producing a trace

Use the `--trace` flag with `a0 run` to write a trace file:

```bash
a0 run --trace trace.jsonl program.a0
```

This creates a JSONL file (one JSON object per line) containing all trace events from the run.

## Trace format

Each line in the trace file is a JSON object with these fields:

```json
{
  "ts": "2024-01-15T10:30:00.000Z",
  "runId": "abc-123",
  "event": "stmt_start",
  "span": { "startLine": 3, "startCol": 1, "endLine": 3, "endCol": 42 },
  "data": {}
}
```

| Field   | Type   | Description |
|---------|--------|-------------|
| `ts`    | string | ISO 8601 timestamp |
| `runId` | string | Unique identifier for the run |
| `event` | string | One of the 16 event types |
| `span`  | object | Source location (line/column range) |
| `data`  | object | Event-specific payload |

## Event types

A0 emits 16 trace event types:

### Program lifecycle

| Event | Description |
|-------|-------------|
| `run_start` | Program execution begins |
| `run_end` | Program execution completes (includes exit code) |

### Statement execution

| Event | Description |
|-------|-------------|
| `stmt_start` | A statement begins executing |
| `stmt_end` | A statement finishes executing |

### Tool invocation

| Event | Description |
|-------|-------------|
| `tool_start` | A tool call begins (includes tool name and arguments) |
| `tool_end` | A tool call completes (includes result) |

### Evidence

| Event | Description |
|-------|-------------|
| `evidence` | An `assert` or `check` statement produced an evidence record |

### Budget

| Event | Description |
|-------|-------------|
| `budget_exceeded` | A budget limit was hit (includes which field exceeded) |

### Control flow

| Event | Description |
|-------|-------------|
| `for_start` | A `for` loop begins iterating |
| `for_end` | A `for` loop finishes all iterations |
| `fn_call_start` | A user-defined function call begins |
| `fn_call_end` | A user-defined function call completes |
| `match_start` | A `match` expression begins evaluation |
| `match_end` | A `match` expression completes |
| `map_start` | A `map` operation begins |
| `map_end` | A `map` operation completes |

## Summarizing traces

Use `a0 trace` to produce a human-readable summary of a trace file:

```bash
a0 trace trace.jsonl
```

This prints a condensed view of the run: which tools were called, what evidence was recorded, and whether the run succeeded or failed.

## Example trace workflow

1. Run a program with tracing enabled:

```bash
a0 run --trace debug.jsonl --unsafe-allow-all examples/system-check.a0
```

2. If the program fails or produces unexpected output, examine the trace:

```bash
a0 trace debug.jsonl
```

3. For detailed inspection, read the raw JSONL:

```bash
head -5 debug.jsonl
```

Each line shows exactly what happened at each step, including tool arguments, return values, and evidence results.

## Using traces for debugging

Traces are especially useful for:

- **Tool failures**: `tool_start`/`tool_end` events show exact arguments passed and results returned
- **Assertion failures**: `evidence` events show which `assert` or `check` failed and why
- **Budget overruns**: `budget_exceeded` events show which limit was hit
- **Loop issues**: `for_start`/`for_end` events show iteration counts
- **Function call chains**: `fn_call_start`/`fn_call_end` events show the call stack

Since A0 programs are designed for autonomous agents, traces provide the machine-readable audit trail needed to verify that a program did what it was supposed to do.
