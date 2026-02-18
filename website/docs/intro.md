---
sidebar_position: 1
slug: /
---

# Introduction

**A0** is a small, structured scripting language with a CLI interpreter built for autonomous agents. It trades expressiveness for reliability: structured values instead of string pipelines, explicit side effects, deny-by-default capability gating, and machine-readable traces that make failures cheap to diagnose.

## Why Another Language?

LLM agents that generate shell scripts or Python hit a wall: implicit side effects, no capability boundaries, and opaque failures that require expensive re-generation. A0 is designed so that an agent's first attempt is more likely to be correct — and when it isn't, the trace output tells you exactly where and why.

## Design Principles

- **Structured data over strings** — Records and lists are first-class. No string interpolation or template hacking.
- **Explicit effects** — Read-only operations use `call?`, effectful operations use `do`. The distinction is enforced at compile time.
- **Deny-by-default capabilities** — Every tool call requires an explicit capability grant. Programs declare what they need; the host decides what to allow.
- **Machine-readable traces** — Every execution can produce a JSONL trace with 16 event types. Failures include structured diagnostics with stable error codes.
- **Evidence-based execution** — `assert` and `check` create evidence records that appear in traces, making correctness claims explicit and auditable.

## What A0 Looks Like

```a0
# Fetch data, transform it, write results
cap { http.get: true, fs.write: true }

call? http.get { url: "https://api.example.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
do fs.write { path: "out.json", data: { title: title }, format: "json" } -> artifact

return { artifact: artifact }
```

## Quick Overview

| Concept | Description |
|---------|-------------|
| **Data types** | `null`, `bool`, `int`, `float`, `string`, records `{}`, lists `[]` |
| **Bindings** | `let x = expr` or `expr -> x` (no reassignment) |
| **Tools** | `call?` for reads, `do` for effects — 4 built-in tools |
| **Stdlib** | 25+ pure functions for data manipulation |
| **Control flow** | `if`, `for`, `fn`, `match`, `map` |
| **Evidence** | `assert` / `check` with trace output |
| **Capabilities** | `cap { ... }` declaration + policy files |
| **Budgets** | `budget { ... }` for resource limits |

## Next Steps

- [Install A0](getting-started/installation) and run your first program
- Explore the [Language Reference](language/data-types) for full syntax details
- See [Examples](examples/) for annotated walkthroughs
