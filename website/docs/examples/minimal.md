---
sidebar_position: 2
---

# Minimal Program

The simplest A0 program demonstrates comments, let bindings, records, and the required `return` statement.

## Source: hello.a0

```a0
# hello.a0 - A minimal A0 example
let greeting = "Hello, A0!"
let data = { name: "world", version: 1 }
return { greeting: greeting, data: data }
```

## Line-by-line walkthrough

### Line 1: Comment

```a0
# hello.a0 - A minimal A0 example
```

Lines starting with `#` are comments. They are ignored by the interpreter and do not appear in the AST or trace output.

### Line 2: String binding

```a0
let greeting = "Hello, A0!"
```

`let` binds a value to a name. Here, `greeting` is bound to the string `"Hello, A0!"`. Bindings are immutable -- once set, they cannot be reassigned.

### Line 3: Record binding

```a0
let data = { name: "world", version: 1 }
```

Records are key-value structures written with `{ key: value }` syntax. Keys are identifiers (unquoted), and values can be strings, numbers, booleans, `null`, lists, or nested records. Here, `data` has a string field `name` and an integer field `version`.

### Line 4: Return

```a0
return { greeting: greeting, data: data }
```

Every A0 program must end with a `return` statement. The return value is a record containing the program's output. It must be the last statement in the program -- placing statements after `return` is a validation error (`E_RETURN_NOT_LAST`).

## Running it

```bash
a0 run examples/hello.a0
```

## Expected output

```json
{
  "greeting": "Hello, A0!",
  "data": {
    "name": "world",
    "version": 1
  }
}
```

## Key takeaways

- Every program must have a `return` as its last statement
- `let` bindings are immutable
- Records `{ key: value }` are A0's primary data structure
- Comments start with `#`
- No capabilities or budget are needed for pure computation
