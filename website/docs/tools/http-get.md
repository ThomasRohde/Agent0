---
sidebar_position: 4
---

# http.get

Fetch a URL via HTTP GET.

- **Mode:** read (`call?`)
- **Capability:** `http.get`

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `str` | Yes | The URL to fetch |
| `headers` | `rec` | No | Custom request headers as a record of string key-value pairs |

## Returns

A record with the HTTP response:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `int` | HTTP status code (e.g. 200, 404) |
| `headers` | `rec` | Response headers as a record |
| `body` | `str` | Response body as a string |

The `body` is always returned as a raw string. To work with JSON APIs, pipe the body through [`parse.json`](../stdlib/data-functions.md).

## Example

Fetch a JSON API and extract data:

```a0
cap { http.get: true }

call? http.get { url: "https://api.example.com/data" } -> resp
let data = parse.json { in: resp.body }
let items = get { in: data, path: "results" }

return { items: items }
```

Fetch with custom headers:

```a0
cap { http.get: true }

call? http.get {
  url: "https://api.example.com/private",
  headers: { Authorization: "Bearer tok_abc123" }
} -> resp

return { status: resp.status }
```

## Errors

- **`E_TOOL_ARGS`** (exit 4) -- Missing or invalid arguments (e.g. no `url`).
- **`E_TOOL`** (exit 4) -- Network error, DNS failure, or request timeout.
- **`E_CAP_DENIED`** (exit 3) -- The active policy denied `http.get`.
- **`E_UNDECLARED_CAP`** (exit 2) -- Program used `http.get` without declaring `cap { http.get: true }`.

## See Also

- [parse.json](../stdlib/data-functions.md) -- Parse JSON response bodies
- [Tools Overview](./overview.md) -- All built-in tools
