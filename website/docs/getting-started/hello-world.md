---
sidebar_position: 2
---

# Hello World

Let's look at the simplest possible A0 program and understand how it works.

## The Program

Create a file called `hello.a0`:

```a0
# hello.a0 - A minimal A0 example
let greeting = "Hello, A0!"
let data = { name: "world", version: 1 }
return { greeting: greeting, data: data }
```

## Running It

```bash
a0 run hello.a0
```

Output:

```json
{
  "greeting": "Hello, A0!",
  "data": { "name": "world", "version": 1 }
}
```

A0 programs always produce structured JSON output -- no raw text, no side effects unless explicitly declared.

## Line-by-Line Breakdown

### Comments

```a0
# hello.a0 - A minimal A0 example
```

Lines starting with `#` are comments. They are ignored during execution.

### Let Bindings

```a0
let greeting = "Hello, A0!"
```

`let` binds a value to a name. Once bound, the name cannot be reassigned -- A0 has no mutation. The value here is a string literal.

```a0
let data = { name: "world", version: 1 }
```

This binds a **record** (a key-value structure, similar to a JSON object) to the name `data`. Records use `{ key: value }` syntax. Values can be strings, numbers, booleans, `null`, nested records, or lists.

### Return

```a0
return { greeting: greeting, data: data }
```

Every A0 program **must** end with a `return` statement. The return value can be any expression -- a record, a list, a string, a number, a boolean, or `null`. This is the program's output -- it gets serialized as JSON.

The record here references the previously bound names `greeting` and `data`. A0 evaluates these references and substitutes their values into the output.

## Key Concepts

- **Every program must end with `return`**. Omitting it produces an `E_NO_RETURN` error.
- **`let` bindings are immutable**. You cannot reuse a name in the same scope.
- **Records are the primary data structure**. They map naturally to JSON objects.
- **No side effects by default**. This program is pure computation -- it doesn't read files, make HTTP requests, or execute shell commands. Programs that need side effects must declare [capabilities](../language/data-types.md).

## Checking Without Running

You can validate a program's syntax and semantics without executing it:

```bash
a0 check hello.a0
```

If the program is valid, this exits silently with code 0. If there are errors, it prints diagnostics with line numbers and suggestions.

## Formatting

A0 includes a formatter that normalizes whitespace and style:

```bash
a0 fmt hello.a0          # print formatted output to stdout
a0 fmt hello.a0 --write  # format the file in place
```

## Next Steps

This program is pure data. To see A0 interact with the outside world, continue to [Your First Program](./your-first-program.md).
