# Blind Black-Box Report: `a0` CLI

Date: 2026-02-19  
Version tested: `a0 0.5.2`  
Method: Black-box only (CLI invocation, help system, and runtime behavior). No source code inspection.

## Executive Summary

`a0` is a DSL interpreter focused on constrained agent-like programs with explicit capabilities, optional budgets, deterministic data transforms, tool calls, and evidence collection.

The tool is unusually self-explanatory for a CLI language runtime:
- `--help` plus topic docs provide a near-complete reference.
- Errors are structured, coded, and usually include actionable hints.
- The command set is small and coherent (`check`, `run`, `fmt`, `trace`, `help`).

Overall self-explanation score (subjective): **8.7/10**.

## What I Did

I tested:
- Discoverability (`a0 --help`, `a0 help <topic>`, subcommand help)
- Static validation (`a0 check`)
- Execution (`a0 run`, file and stdin)
- Formatting (`a0 fmt`)
- Tracing (`a0 run --trace`, `a0 trace`)
- Evidence output (`a0 run --evidence`)
- Capability policy behavior
- Budget enforcement
- Control-flow semantics (`for`, `fn`, `map`, `match`)
- Diagnostics formatting (`JSON` vs `--pretty`)

All tests were done with custom `.a0` files created for probing behavior.

## Key Findings

### 1. CLI and language are discoverable

`a0 --help` immediately reveals:
- command surface
- quick language reference
- capabilities, budgets, exit code contract
- examples and topic system

`a0 help <topic>` pages are detailed and useful (`syntax`, `tools`, `flow`, `diagnostics`, etc.).

### 2. Diagnostics are high quality

Observed error payloads include:
- stable machine-readable `code`
- `message`
- source `span` (`file`, line/column)
- contextual `hint` (on many static errors)

`--pretty` mode gives clean human-readable output.  
Default JSON output is automation-friendly.

### 3. Exit codes match documented contract

Verified:
- `0` success
- `1` CLI usage/help style failures (e.g., unknown help topic)
- `2` parse/validation failures (e.g., `E_PARSE`, `E_NO_RETURN`)
- `3` capability denied (`E_CAP_DENIED`)
- `4` runtime/tool/budget failures (`E_BUDGET`, `E_TOOL`, `E_PATH`, etc.)
- `5` evidence/assert failures (`E_ASSERT` or failed `check`)

### 4. Capability model works and is explicit

Behavior confirmed:
- Missing declared cap is caught by `check` (`E_UNDECLARED_CAP`)
- Denied by host policy fails at runtime (`E_CAP_DENIED`, exit `3`)
- `--unsafe-allow-all` bypasses policy as advertised

In this environment:
- project policy file absent
- home policy existed with `{ "allow": ["fs.read"] }`
- so `fs.read` worked by default while `fs.write`/`sh.exec` were denied

### 5. Budgets are enforced, including post-write byte budget

Confirmed:
- `maxToolCalls` raises `E_BUDGET` once exceeded
- `maxBytesWritten` triggers after write side effect (file exists even though run exits with `E_BUDGET`)

### 6. Runtime semantics matched docs in tested areas

Verified:
- property on non-record -> `E_PATH`
- missing record field -> `null` (not error)
- `map` over list with named function works
- `match` on non-`ok`/`err` record -> `E_MATCH_NO_ARM`
- `run -` (stdin) works
- file path resolution is by process `cwd`, not script directory

### 7. Trace UX is strong

`run --trace` emits JSONL with per-event rows; `trace` summarizes:
- run ID
- event count
- tools used
- evidence/failure/budget counts
- duration

Robust trace validation:
- empty/invalid trace -> `E_TRACE`
- multi-run JSONL -> clear `E_TRACE` message

## Strengths (Self-Explaining Design)

- Excellent first-run help density without being unreadable
- Topic-based reference is practical and specific
- Error taxonomy feels intentional and stable
- Machine/human output modes are both present
- Examples are realistic and aligned with actual behavior
- Safety model (capabilities + policy + budget) is clear

## Gaps / Improvement Opportunities

1. `check` success JSON is `[]`, which is terse but ambiguous.
Suggestion: optionally emit `{ "ok": true, "errors": [] }` in machine mode for schema stability.

2. Some parser errors are verbose (token list dump from parser internals).
Suggestion: keep verbose details behind a debug flag; default message could be shorter with likely fix.

3. Policy visibility requires inference from runtime failures.
Suggestion: add `a0 policy` (effective allow/deny + source path) for easier environment debugging.

4. Quick reference mentions a core stdlib subset; full stdlib appears only in topic docs.
Suggestion: include a compact “full stdlib index” command (e.g., `a0 help stdlib --index`).

## Bottom Line

This is a strong self-describing CLI and DSL runtime.  
A new user can discover core concepts, write/rerun/fix programs, and debug failures with minimal external docs. The overall design reads as deliberate and production-minded.

