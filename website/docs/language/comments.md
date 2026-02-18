---
sidebar_position: 6
---

# Comments

A0 supports line comments using the `#` character.

## Syntax

A comment starts with `#` and extends to the end of the line:

```a0
# This is a comment
let x = 42
```

## Usage

Comments can appear on their own line to document sections of a program:

```a0
# Fetch the latest data from the API
cap { http.get: true }

# Make the request
call? http.get { url: "https://api.example.com/data" } -> response

# Parse and extract the relevant field
let body = parse.json { in: response.body }
let title = get { in: body, path: "title" }

# Return the result
return { title: title }
```

## Block Comments

A0 does not have block comments or multi-line comment syntax. Use multiple `#` lines instead:

```a0
# This program demonstrates a multi-step
# data pipeline with error checking
# and structured output
cap { http.get: true, fs.write: true }
```

## Conventions

- Use comments to explain **why**, not **what** -- the code should be self-explanatory for the what
- Add a header comment with the filename and purpose for non-trivial programs
- Comment capability declarations to explain why each capability is needed

```a0
# package-report.a0 - Generate a summary of installed npm packages
cap { sh.exec: true }     # needed to run npm commands
budget { timeMs: 30000, maxToolCalls: 5 }
```
