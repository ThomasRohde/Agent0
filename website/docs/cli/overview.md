---
sidebar_position: 1
---

# CLI Overview

The `a0` command-line interface provides six commands for working with A0 programs.

## Commands

| Command | Description |
|---------|-------------|
| [`a0 run`](./run.md) | Execute an A0 program and print its result |
| [`a0 check`](./check.md) | Parse and validate without executing |
| [`a0 fmt`](./fmt.md) | Canonically format A0 source code |
| [`a0 trace`](./trace.md) | Summarize a JSONL execution trace |
| [`a0 policy`](./policy.md) | Show effective policy resolution and capability allowlist |
| `a0 help [topic]` | Show built-in language and runtime help topics |

## Quick Start

```bash
# Validate a program (no execution)
a0 check program.a0

# Run a program
a0 run program.a0

# Run with human-readable errors
a0 run program.a0 --pretty

# Format source code
a0 fmt program.a0

# Format and overwrite in place
a0 fmt program.a0 --write

# Run with trace output, then summarize
a0 run program.a0 --trace trace.jsonl
a0 trace trace.jsonl

# Inspect effective policy resolution
a0 policy
```

## Common Flags

These flags are available on commands where applicable:

| Flag | Commands | Description |
|------|----------|-------------|
| `--pretty` | `run`, `check` | Human-readable error output instead of JSON |
| `--stable-json` | `check` | Emit stable machine success payload (`{"ok":true,"errors":[]}`) |
| `--debug-parse` | `run`, `check` | Show raw parser-internal diagnostics for parse errors |
| `--trace <file>` | `run` | Write execution trace to a JSONL file |
| `--unsafe-allow-all` | `run` | Bypass all capability checks (development only) |
| `--write` | `fmt` | Overwrite the source file in place |
| `--json` | `trace`, `policy` | Output as JSON |
| `--evidence <file>` | `run` | Write evidence records to a JSON file |

## Exit Codes

All commands use a consistent set of exit codes. See [Exit Codes](../errors/exit-codes.md) for details.

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | CLI usage/help error (unknown command/topic/option) |
| 2 | Parse or validation error |
| 3 | Capability denied |
| 4 | Runtime, tool, or CLI I/O error |
| 5 | Assertion or check failed (`assert` = fatal/halts, `check` = non-fatal/continues) |

## Installation

After building the A0 monorepo, install the CLI globally:

```bash
npm install
npm run build
npm install -g ./packages/cli
```

Verify the installation:

```bash
a0 --version
```

## Built-in Help

The CLI includes a built-in help system with language reference topics:

```bash
# General help
a0 --help

# Topic-specific help
a0 help syntax
a0 help types
a0 help tools
a0 help stdlib
a0 help caps
a0 help budget
a0 help flow
a0 help diagnostics
a0 help examples
a0 help stdlib --index
```
