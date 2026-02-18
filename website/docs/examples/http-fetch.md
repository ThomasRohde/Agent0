---
sidebar_position: 3
---

# HTTP Fetch and Transform

This example fetches JSON from an HTTP API, extracts a field, and writes the result to a file. It demonstrates capability declarations, the difference between `call?` and `do`, JSON parsing, path access, and the `->` binding.

## Source: fetch-transform.a0

```a0
# fetch-transform.a0 - Fetch JSON from HTTP, transform it, write to file
cap { http.get: true, fs.write: true }

call? http.get { url: "https://jsonplaceholder.typicode.com/todos/1" } -> response
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }
let output = { fetched_title: title, status: response.status }
do fs.write { path: "output.json", data: output, format: "json" } -> artifact

return { artifact: artifact, output: output }
```

## Line-by-line walkthrough

### Line 2: Capability declaration

```a0
cap { http.get: true, fs.write: true }
```

`cap` declares which capabilities (tools) the program intends to use. A0 uses deny-by-default capability gating: unless a capability is declared here **and** allowed by the policy file, the tool call will be denied at runtime (exit 3, `E_CAP_DENIED`). The validator also checks that declared capabilities match the tools actually used in the program (`E_UNDECLARED_CAP`).

### Line 4: Read-mode tool call with `call?`

```a0
call? http.get { url: "https://jsonplaceholder.typicode.com/todos/1" } -> response
```

`call?` is used for **read-mode** tools -- tools that observe but do not modify the world. `http.get` is a read-mode tool. The `-> response` binding captures the tool's return value.

The `response` record from `http.get` includes fields like `status` (HTTP status code) and `body` (response body as a string).

### Line 5: Parsing JSON

```a0
let body = parse.json { in: response.body }
```

`parse.json` is a stdlib function that parses a JSON string into an A0 value (record, list, string, number, boolean, or null). The `in` field is the string to parse.

### Line 6: Path access

```a0
let title = get { in: body, path: "title" }
```

`get` extracts a value from a nested structure using a dot-separated path. Here it extracts the `title` field from the parsed JSON body. For nested paths, use dot notation: `"user.address.city"`.

### Line 7: Building a record

```a0
let output = { fetched_title: title, status: response.status }
```

Constructs a new record from previously bound values. Field access uses dot notation (`response.status`).

### Line 8: Effect tool call with `do`

```a0
do fs.write { path: "output.json", data: output, format: "json" } -> artifact
```

`do` is used for **effect-mode** tools -- tools that modify the world (write files, execute commands). `fs.write` writes data to a file. The `format: "json"` argument tells it to serialize the data as JSON.

The `-> artifact` binding captures the tool's return value, which includes metadata about what was written.

### Line 10: Return

```a0
return { artifact: artifact, output: output }
```

Returns both the artifact metadata and the transformed output.

## Running it

```bash
a0 run --unsafe-allow-all examples/fetch-transform.a0
```

## Key takeaways

- `cap` declares required capabilities up front
- `call?` is for read-mode tools, `do` is for effect-mode tools
- Using the wrong statement for a tool mode is a compile-time error (`E_CALL_EFFECT`)
- `parse.json` converts strings to structured data
- `get` navigates nested structures with dot paths
- `->` binds tool results to names for later use
