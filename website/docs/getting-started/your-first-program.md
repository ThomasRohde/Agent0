---
sidebar_position: 3
---

# Your First Program

This tutorial walks through a real-world A0 program that fetches data from the internet, transforms it, and writes the result to a file.

## The Program

Create a file called `fetch-transform.a0`:

```a0
cap { http.get: true, fs.write: true }

call? http.get { url: "https://jsonplaceholder.typicode.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
let output = { fetched_title: title, status: response.status }
do fs.write { path: "output.json", data: output, format: "json" } -> artifact

return { artifact: artifact, output: output }
```

## Running It

Because this program performs side effects (HTTP request, file write), you need to allow capabilities. For development, use the `--unsafe-allow-all` flag:

```bash
a0 run fetch-transform.a0 --unsafe-allow-all
```

This produces output like:

```json
{
  "artifact": { "path": "output.json", "bytesWritten": 62 },
  "output": { "fetched_title": "delectus aut autem", "status": 200 }
}
```

And writes `output.json` to disk with the transformed data.

## Line-by-Line Breakdown

### Capability Declaration

```a0
cap { http.get: true, fs.write: true }
```

The `cap` block declares what side effects this program needs. A0 uses **deny-by-default** security: if a program tries to use a tool without declaring it, execution fails before any side effect occurs.

This program needs two capabilities:
- `http.get` -- to fetch data from a URL
- `fs.write` -- to write a file to disk

The four available capabilities are: `fs.read`, `fs.write`, `http.get`, and `sh.exec`.

### Reading Data with `call?`

```a0
call? http.get { url: "https://jsonplaceholder.typicode.com/todos/1" } -> response
```

`call?` invokes a **read-only** tool. The `http.get` tool takes a record with a `url` field. The `-> response` syntax binds the tool's return value to the name `response`.

The response is a record with fields like `status`, `body`, and `headers`. The `body` field is a raw string -- it needs to be parsed before you can access its fields.

### Transforming Data with Stdlib

```a0
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
```

A0 includes a standard library of pure functions that require no capabilities:

- `parse.json` takes a string and returns the parsed value. Here it converts the HTTP response body into a record.
- `get` reads a value at a nested path. The `path` field uses dot notation and bracket syntax for arrays (e.g., `"items[0].name"`).

### Building the Output

```a0
let output = { fetched_title: title, status: response.status }
```

This creates a new record using **property access** (`response.status`) and the previously bound `title`. A0 uses dot notation to access fields on records.

### Writing Data with `do`

```a0
do fs.write { path: "output.json", data: output, format: "json" } -> artifact
```

`do` invokes an **effectful** tool -- one that changes the outside world. The `fs.write` tool writes data to a file. The `format: "json"` argument tells it to serialize the data as formatted JSON.

Using `call?` on an effect tool like `fs.write` is a compile-time error (`E_CALL_EFFECT`). This distinction makes it clear which operations have side effects.

### Return

```a0
return { artifact: artifact, output: output }
```

The program returns both the write artifact (containing metadata like bytes written) and the transformed output.

## `call?` vs `do`

A0 enforces a clear distinction between reading and writing:

| Keyword | Mode | Tools | Purpose |
|---------|------|-------|---------|
| `call?` | read | `fs.read`, `http.get` | Read data without side effects |
| `do` | effect | `fs.write`, `sh.exec` | Perform side effects |

Using the wrong keyword is a **compile-time error**, caught by `a0 check` before any code runs.

## Checking Before Running

Always validate your program first:

```bash
a0 check fetch-transform.a0
```

This catches syntax errors, undeclared capabilities, wrong tool keywords, and other issues -- without executing anything or making real HTTP requests.

## Capability Policies

In production, instead of `--unsafe-allow-all`, you configure policy files that control which capabilities are allowed:

1. `.a0policy.json` in the project directory (project-level)
2. `~/.a0/policy.json` (user-level)
3. Deny-all default

This ensures programs cannot perform unauthorized side effects.

## Next Steps

You now understand the core mechanics of A0: capabilities, tool calls, stdlib functions, and structured output. Explore the language reference to learn more:

- [Data Types](../language/data-types.md) -- all the value types in A0
- [Bindings](../language/bindings.md) -- how variables work
- [Expressions](../language/expressions.md) -- arithmetic and comparisons
- [Control Flow](../language/control-flow.md) -- conditionals, loops, and pattern matching
- [Functions](../language/functions.md) -- user-defined functions and map
