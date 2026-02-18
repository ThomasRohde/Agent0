---
sidebar_position: 4
---

# a0 fmt

Canonically format an A0 source file. Normalizes indentation, spacing, and line structure to produce consistent, readable code.

## Usage

```bash
a0 fmt <file> [options]
```

## Flags

| Flag | Description |
|------|-------------|
| `--write` | Overwrite the source file in place |

Without `--write`, the formatted output is printed to stdout. The original file is not modified.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Formatting succeeded |
| 2 | Parse error (file cannot be formatted) |

## What It Does

The formatter parses the source file into an AST and then prints it back using canonical rules:

- Consistent indentation (2 spaces)
- Normalized spacing around operators and keywords
- One statement per line
- Canonical record and list formatting

The formatter requires a syntactically valid program. If the file has parse errors, `a0 fmt` exits with code 2 and reports the errors.

:::note
Comments (lines starting with `#`) are not preserved by the formatter. The formatter will print a warning if the source contains comments that will be stripped.
:::

## Examples

### Preview Formatted Output

Print the formatted version to stdout without modifying the file:

```bash
a0 fmt program.a0
```

### Format in Place

Overwrite the file with its formatted version:

```bash
a0 fmt program.a0 --write
```

### Before and After

Given `messy.a0`:

```a0
let   x={name:"hello",  count:42}
let y =   [1,2,   3]
return {x:x,y:y}
```

After running `a0 fmt messy.a0`:

```a0
let x = { name: "hello", count: 42 }
let y = [1, 2, 3]
return { x: x, y: y }
```

### Format a Complex Program

Given a program with headers and tool calls:

```a0
cap {http.get:true,fs.write:true}
budget {maxToolCalls:5}
call? http.get {url:"https://example.com"} -> response
let body=parse.json {in:response.body}
do fs.write {path:"out.json",data:body,format:"json"} -> artifact
return {artifact:artifact}
```

After formatting:

```a0
cap { http.get: true, fs.write: true }
budget { maxToolCalls: 5 }

call? http.get { url: "https://example.com" } -> response
let body = parse.json { in: response.body }
do fs.write { path: "out.json", data: body, format: "json" } -> artifact
return { artifact: artifact }
```

### Pipe to Diff

Compare the formatted version with the original:

```bash
a0 fmt program.a0 | diff program.a0 -
```

## Workflow Integration

Use `a0 fmt --write` as part of your editing workflow to keep A0 files consistently formatted:

```bash
# Format, then validate
a0 fmt program.a0 --write
a0 check program.a0
```
