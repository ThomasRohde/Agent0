---
sidebar_position: 1
---

# Built-in Tools

A0 includes six built-in tools for file I/O, HTTP requests, and shell execution. Tools are the primary way A0 programs interact with the outside world.

## Calling Convention

A0 distinguishes between **read-only** and **effectful** tool calls using two keywords:

- **`call?`** -- Invokes a read-only tool. Cannot modify external state.
- **`do`** -- Invokes an effectful tool. May modify files, run commands, etc.

Using `call?` on an effectful tool is a **compile-time error** (`E_CALL_EFFECT`, exit 2). This is caught by `a0 check` before the program runs.

```a0
# Correct: fs.read is read-only
cap { fs.read: true, fs.write: true }

call? fs.read { path: "data.txt" } -> content

# Correct: fs.write is effectful
do fs.write { path: "out.txt", data: "hello" } -> result

return { content: content, result: result }

# WRONG: fs.write requires 'do', not 'call?'
# call? fs.write { path: "out.txt", data: "hello" } -> result
# -> E_CALL_EFFECT (exit 2)
```

## Tool Arguments

Tool arguments are always **records** `{ key: value }`, never positional. Arguments are validated at runtime using Zod schemas. Invalid arguments produce `E_TOOL_ARGS` (exit 4).

```a0
# Arguments are named key-value pairs
cap { fs.read: true }

call? fs.read { path: "config.json", encoding: "utf8" } -> data

return { data: data }
```

## Capabilities

Every tool requires a **capability** that must be declared in the `cap` block at the top of your program. Without the required capability, the tool call will be denied at runtime (`E_CAP_DENIED`, exit 3).

```a0
cap { fs.read: true }

call? fs.read { path: "input.txt" } -> data

return { data: data }
```

## Tool Reference

| Tool | Mode | Keyword | Capability | Description |
|------|------|---------|------------|-------------|
| [`fs.read`](./fs-read.md) | read | `call?` | `fs.read` | Read file contents |
| [`fs.write`](./fs-write.md) | effect | `do` | `fs.write` | Write data to a file |
| [`fs.list`](./fs-list.md) | read | `call?` | `fs.read` | List directory contents |
| [`fs.exists`](./fs-exists.md) | read | `call?` | `fs.read` | Check if a path exists |
| [`http.get`](./http-get.md) | read | `call?` | `http.get` | Fetch a URL via HTTP GET |
| [`sh.exec`](./sh-exec.md) | effect | `do` | `sh.exec` | Execute a shell command |
