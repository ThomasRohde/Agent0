---
sidebar_position: 5
---

# String Operations

Functions for building, splitting, and transforming strings.

## str.concat

Concatenate a list of parts into a single string. All parts are coerced to strings.

**Signature:** `str.concat { parts: list }` returns `str`.

```a0
let greeting = str.concat { parts: ["Hello, ", "world", "!"] }
# -> "Hello, world!"

let mixed = str.concat { parts: ["Count: ", 42] }
# -> "Count: 42"

let url = str.concat { parts: ["https://api.example.com/users/", 123] }
# -> "https://api.example.com/users/123"

return { greeting: greeting }
```

## str.split

Split a string by a separator. Returns a list of substrings.

**Signature:** `str.split { in: str, sep: str }` returns `list`.

```a0
let parts = str.split { in: "a,b,c", sep: "," }
# -> ["a", "b", "c"]

let words = str.split { in: "hello world", sep: " " }
# -> ["hello", "world"]

let lines = str.split { in: "line1\nline2\nline3", sep: "\n" }
# -> ["line1", "line2", "line3"]

return { parts: parts }
```

## str.starts

Check if a string starts with a given prefix.

**Signature:** `str.starts { in: str, value: str }` returns `bool`.

```a0
let yes = str.starts { in: "hello world", value: "hello" }
# -> true

let no = str.starts { in: "hello world", value: "world" }
# -> false

return { yes: yes }
```

## str.ends

Check if a string ends with a given suffix.

**Signature:** `str.ends { in: str, value: str }` returns `bool`.

```a0
let yes = str.ends { in: "hello world", value: "world" }
# -> true

let no = str.ends { in: "hello world", value: "hello" }
# -> false

return { yes: yes }
```

## str.replace

Replace all occurrences of a substring.

**Signature:** `str.replace { in: str, from: str, to: str }` returns `str`.

```a0
let result = str.replace { in: "foo bar foo", from: "foo", to: "baz" }
# -> "baz bar baz"

let cleaned = str.replace { in: "hello   world", from: "   ", to: " " }
# -> "hello world"

let removed = str.replace { in: "a.b.c", from: ".", to: "/" }
# -> "a/b/c"

return { result: result }
```

All occurrences are replaced, not just the first.

## See Also

- [List Operations](./list-operations.md) -- join for the reverse of split
- [Predicates](./predicates.md) -- contains for substring checks
