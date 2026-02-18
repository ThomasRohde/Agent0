---
sidebar_position: 6
---

# Iteration and Map

A0 provides two ways to process lists: `for` loops for side-effectful iteration, and `map` for pure functional transformations. This page walks through both.

## for loops

`for` iterates over a list, executing a block for each element. The block can contain tool calls and other side effects.

### Source: for-demo.a0

```a0
# for-demo.a0 — List iteration with for loop
cap { sh.exec: true }
budget { timeMs: 15000, maxToolCalls: 3, maxIterations: 10 }

let cmds = ["echo one", "echo two", "echo three"]
let results = for { in: cmds, as: "cmd" } {
  do sh.exec { cmd: cmd, timeoutMs: 5000 } -> out
  return { cmd: cmd, stdout: out.stdout, exitCode: out.exitCode }
}

return { results: results }
```

### Walkthrough

#### Line 3: Budget with iteration limit

```a0
budget { timeMs: 15000, maxToolCalls: 3, maxIterations: 10 }
```

`maxIterations` limits how many loop iterations can execute. This prevents runaway loops from consuming unbounded resources.

#### Lines 5-9: The for loop

```a0
let cmds = ["echo one", "echo two", "echo three"]
let results = for { in: cmds, as: "cmd" } {
  do sh.exec { cmd: cmd, timeoutMs: 5000 } -> out
  return { cmd: cmd, stdout: out.stdout, exitCode: out.exitCode }
}
```

- `in` specifies the list to iterate over
- `as` names the loop variable (must be a string literal)
- The block body executes once per element
- Each iteration must end with `return`, and its value is collected
- `results` is a list of all returned values

The loop variable `cmd` is scoped to the block body -- it is not visible outside.

#### Expected output

```json
{
  "results": [
    { "cmd": "echo one", "stdout": "one\n", "exitCode": 0 },
    { "cmd": "echo two", "stdout": "two\n", "exitCode": 0 },
    { "cmd": "echo three", "stdout": "three\n", "exitCode": 0 }
  ]
}
```

## map

`map` applies a user-defined function to each element of a list. It is a pure operation -- no tool calls allowed inside the mapped function.

### Source: map-demo.a0

```a0
# map-demo.a0 — Demonstrates the map higher-order function

# Define a function that doubles a number
fn double { x } {
  return { val: x * 2 }
}

# Map over a list of numbers
let nums = [1, 2, 3, 4, 5]
let doubled = map { in: nums, fn: "double" }

# Define a function that formats a user record
fn formatUser { name, age } {
  let label = str.concat { parts: [name, " (age ", age, ")"] }
  return { label: label, name: name }
}

# Map over a list of records with multi-param destructuring
let users = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 }
]
let formatted = map { in: users, fn: "formatUser" }

return { doubled: doubled, formatted: formatted }
```

### Walkthrough

#### Lines 4-6: Defining a function

```a0
fn double { x } {
  return { val: x * 2 }
}
```

`fn` defines a named function. The parameter list `{ x }` declares the arguments. When mapping over a list of scalars (numbers, strings), each element is passed as the single parameter.

#### Line 10: Mapping with a function

```a0
let doubled = map { in: nums, fn: "double" }
```

`map` takes:
- `in` -- the list to transform
- `fn` -- the **name** of the function to apply (as a string)

It returns a new list with the function applied to each element.

#### Lines 13-16: Multi-parameter destructuring

```a0
fn formatUser { name, age } {
  let label = str.concat { parts: [name, " (age ", age, ")"] }
  return { label: label, name: name }
}
```

When mapping over a list of records, the record fields are destructured into the function parameters. `{ name: "Alice", age: 30 }` passes `name = "Alice"` and `age = 30` to `formatUser`.

#### Expected output

```json
{
  "doubled": [
    { "val": 2 },
    { "val": 4 },
    { "val": 6 },
    { "val": 8 },
    { "val": 10 }
  ],
  "formatted": [
    { "label": "Alice (age 30)", "name": "Alice" },
    { "label": "Bob (age 25)", "name": "Bob" }
  ]
}
```

## for vs map: when to use each

| | `for` | `map` |
|---|---|---|
| **Purpose** | Side-effectful iteration | Pure transformation |
| **Tool calls** | Allowed (`call?`, `do`) | Not allowed |
| **Result** | List of returned values | List of transformed values |
| **Budget** | Counted by `maxIterations` and `maxToolCalls` | Counted by `maxIterations` |
| **Use when** | You need to call tools for each item | You need to transform data without side effects |

In general, prefer `map` when you only need to transform data, and use `for` when each iteration must interact with the outside world (file system, HTTP, shell).
