/**
 * A0 CLI Help Content
 * Dense, progressive-discovery language reference for terminal output.
 */

export const QUICKREF = `
A0 QUICK REFERENCE (v0.3)
=========================

PROGRAM STRUCTURE
  cap { fs.read: true, sh.exec: true }      # declare capabilities (top)
  budget { timeMs: 30000, maxToolCalls: 10 } # resource limits (optional)
  let x = expr                               # bind value
  expr -> name                               # bind result of statement
  return { key: val }                        # required, must be last

TYPES
  int: 42   float: 3.14   bool: true/false   str: "hello"   null
  record: { key: value, nested: { a: 1 } }  list: [1, 2, "x"]

TOOLS (require cap + policy)
  call? fs.read  { path }                -> str
  do    fs.write { path, data, format? } -> { kind, path, bytes, sha256 }
  call? http.get { url, headers? }       -> { status, headers, body }
  do    sh.exec  { cmd, cwd?, env?, timeoutMs? } -> { exitCode, stdout, stderr, durationMs }
  call? = read-only        do = side-effect

STDLIB (pure, no cap needed)
  parse.json { in }             -> parsed value
  get  { in, path }             -> value at dotted path ("a.b[0]")
  put  { in, path, value }      -> new record
  patch { in, ops }             -> patched record (RFC 6902)
  eq { a, b } -> bool           contains { in, value } -> bool
  not { in }  -> bool           and { a, b } / or { a, b } -> bool

CONTROL FLOW
  let x = if { cond: expr, then: val, else: val }
  let results = for { in: list, as: "item" } { ... return { } }
  fn name { params } { ... return { } }    # define before use
  let x = match expr { ok {v} { return {} } err {e} { return {} } }

EVIDENCE
  assert { that: bool_expr, msg: "..." }   # false -> exit 5, stops execution
  check  { that: bool_expr, msg: "..." }   # false -> exit 5, stops execution

CAPS: fs.read  fs.write  http.get  sh.exec
BUDGET: timeMs  maxToolCalls  maxBytesWritten  maxIterations
EXIT CODES: 0=ok  2=parse/validate  3=cap-denied  4=runtime  5=assert
PROPERTY ACCESS: resp.body  result.exitCode  data.items

MINIMAL EXAMPLE                        HTTP EXAMPLE
  let data = { name: "a0", v: 1 }       cap { http.get: true }
  return { result: data }               call? http.get { url: "https://x.co/api" } -> r
                                         let body = parse.json { in: r.body }
                                         return { data: body }

Topics: a0 help syntax|types|tools|stdlib|caps|budget|flow|diagnostics|examples
`.trimStart();

export const TOPICS: Record<string, string> = {

// ─── SYNTAX ─────────────────────────────────────────────────────────────────
syntax: `
A0 SYNTAX REFERENCE
====================

COMMENTS
  # single-line comment (own line or end of line)

PROGRAM HEADERS (must appear before any statements, any order)
  cap { capability.name: true, ... }     # declare required capabilities
  budget { field: value, ... }           # declare resource limits

STATEMENTS
  let name = expr                        # bind a value
  call? tool.name { args } -> name       # read-only tool call, bind result
  do tool.name { args } -> name          # effectful tool call, bind result
  fn name { params } { body }            # define a function
  assert { that: expr, msg: "str" }      # halt if falsy (exit 5)
  check { that: expr, msg: "str" }       # record evidence (exit 5 if falsy)
  return { key: val, ... }              # required, must be last statement

EXPRESSIONS
  42  3.14  true  false  null  "str"     # literals
  { key: val, k2: v2 }                  # record literal
  [1, 2, 3]                             # list literal
  name                                   # variable reference
  name.field                             # property access (dot notation)
  if { cond: x, then: y, else: z }      # conditional (lazy evaluation)
  for { in: list, as: "v" } { body }    # iteration (produces list)
  match expr { ok {v} {body} err {e} {body} }  # ok/err discrimination
  fn_name { key: val }                   # function/stdlib call

BINDING FORMS
  let x = expr                           # standard binding
  expr -> x                              # pipe binding (tool calls, stmts)

RESERVED KEYWORDS (cannot be used as variable names)
  cap  budget  import  as  let  return  call?  do
  assert  check  true  false  null  if  for  fn  match

LINE RULES
  - Statements are typically one per line; multiple per line work
  - Records/lists may span lines (braces/brackets keep context open)
  - No semicolons, no statement separators
  - Strings are double-quoted only, with JSON escapes: \\" \\\\ \\n \\t

SCOPING
  - Top-level: cap, budget, fn definitions, then statements
  - fn/for/match bodies have their own scope (parent-chained)
  - No variable reassignment — each let/-> creates a new binding
  - fn params and for loop variables are scoped to their body
`.trimStart(),

// ─── TYPES ──────────────────────────────────────────────────────────────────
types: `
A0 TYPE SYSTEM
==============

PRIMITIVES
  Type    Literals              Notes
  int     42, -1, 0             arbitrary precision integer
  float   3.14, -0.5            IEEE 754 double
  bool    true, false
  str     "hello", "a\\nb"      double-quoted, JSON escapes
  null    null

RECORDS
  { key: value }                         # simple record
  { key: value, another: value }         # multiple fields
  { nested: { a: 1 } }                  # nested records
  { fs.read: true }                     # dotted keys (capability style)
  Records are unordered key-value maps. Keys are identifiers or dotted names.

LISTS
  [1, 2, 3]                             # homogeneous list
  [1, "two", true, null]                # heterogeneous list
  [{ a: 1 }, { a: 2 }]                  # list of records
  Lists are ordered, zero-indexed sequences.

STRING ESCAPES
  \\"   double quote
  \\\\   backslash
  \\n   newline
  \\t   tab

TRUTHINESS (used by if, assert, check, predicates)
  Falsy: false, null, 0, ""
  Truthy: everything else (including empty records {}, empty lists [], non-zero numbers)

PROPERTY ACCESS
  let x = record.field                   # dot access on bound variables
  let y = record.nested.deep             # chained access
  Accessing a field on a non-record value produces E_PATH (exit 4).
  Missing fields return null (not an error).

NO TYPE ANNOTATIONS
  A0 is dynamically typed. Types are checked at runtime.
  Tool args are validated against Zod schemas at call time (E_TOOL_ARGS).
`.trimStart(),

// ─── TOOLS ──────────────────────────────────────────────────────────────────
tools: `
A0 TOOLS REFERENCE
===================

All tool args are records { ... }. Never positional.
Read tools use call?, effect tools use do.
Each tool requires its matching capability declared in cap { ... }.

fs.read — Read a file
  Mode: read (call?)    Cap: fs.read
  Args:   { path: str, encoding?: str }
  Return: str (file contents)
  Example:
    call? fs.read { path: "config.json" } -> content
    let data = parse.json { in: content }

fs.write — Write data to file
  Mode: effect (do)     Cap: fs.write
  Args:   { path: str, data: any, format?: str }
          format: "json" serializes data as JSON
  Return: { kind: "file", path: str, bytes: int, sha256: str }
  Example:
    do fs.write { path: "out.json", data: result, format: "json" } -> artifact

http.get — HTTP GET request
  Mode: read (call?)    Cap: http.get
  Args:   { url: str, headers?: record }
  Return: { status: int, headers: record, body: str }
          body is always a string — use parse.json to get structured data
  Example:
    call? http.get { url: "https://api.example.com/data" } -> resp
    let body = parse.json { in: resp.body }

sh.exec — Execute shell command
  Mode: effect (do)     Cap: sh.exec
  Args:   { cmd: str, cwd?: str, env?: record, timeoutMs?: int }
  Return: { exitCode: int, stdout: str, stderr: str, durationMs: int }
  Example:
    do sh.exec { cmd: "ls -la", timeoutMs: 10000 } -> result

KEYWORD RULES
  call? on effect tool -> E_CALL_EFFECT (exit 2, caught at check time)
  do on read tool     -> allowed but unconventional (prefer call?)
  Invalid tool args   -> E_TOOL_ARGS (exit 4, runtime schema validation)
  Unknown tool name   -> E_UNKNOWN_TOOL (exit 4)

PATH RESOLUTION
  File paths (fs.read, fs.write) resolve relative to the process
  working directory (cwd), not the script file's directory.
`.trimStart(),

// ─── STDLIB ─────────────────────────────────────────────────────────────────
stdlib: `
A0 STDLIB REFERENCE
====================

Pure functions — no capability needed. Called as: name { args }

DATA FUNCTIONS

  parse.json { in: str } -> any
    Parse a JSON string into a structured value.
    Error: E_FN if string is not valid JSON.
    Example: let data = parse.json { in: "{\\"key\\": 42}" }

  get { in: record, path: str } -> any
    Read value at a dotted/bracketed path. Returns null if not found.
    Path syntax: "a.b[0].c"
    Example: let val = get { in: data, path: "users[0].name" }

  put { in: record, path: str, value: any } -> record
    Return new record with value set at path. Creates intermediate records.
    Example: let updated = put { in: cfg, path: "meta.version", value: 2 }

  patch { in: record, ops: list } -> record
    Apply JSON Patch (RFC 6902) operations.
    Each op: { op: "add"|"remove"|"replace"|"copy"|"move"|"test", path: str, value?: any, from?: str }
    Example:
      let result = patch { in: doc, ops: [
        { op: "replace", path: "/name", value: "Bob" },
        { op: "add", path: "/email", value: "bob@x.com" }
      ] }

PREDICATE FUNCTIONS (use A0 truthiness: false/null/0/"" are falsy)

  eq { a: any, b: any } -> bool
    Deep equality (JSON-based comparison).
    Example: let same = eq { a: actual, b: expected }

  contains { in: str|list|record, value: any } -> bool
    str:    substring check (value coerced to string)
    list:   element membership (deep equality)
    record: key existence (value coerced to string)
    Example: let has = contains { in: config, value: "name" }

  not { in: any } -> bool
    Boolean negation with truthiness coercion.
    Example: let empty = not { in: result }

  and { a: any, b: any } -> bool
    Logical AND with truthiness coercion.
    Example: let both = and { a: has_name, b: has_email }

  or { a: any, b: any } -> bool
    Logical OR with truthiness coercion.
    Example: let either = or { a: cached, b: fetched }
`.trimStart(),

// ─── CAPS ───────────────────────────────────────────────────────────────────
caps: `
A0 CAPABILITY SYSTEM
=====================

A0 uses deny-by-default capabilities. Two requirements for tool use:

  1. Program declares the capability:  cap { fs.read: true }
  2. Host policy allows it

VALID CAPABILITIES
  fs.read    fs.write    http.get    sh.exec

DECLARATION
  cap { fs.read: true, http.get: true }    # at top of file, before statements

POLICY LOADING ORDER (first match wins)
  1. .a0policy.json       (project directory)
  2. ~/.a0/policy.json    (user home)
  3. deny-all default

POLICY FILE FORMAT
  {
    "allow": ["fs.read", "http.get"],
    "deny": ["sh.exec"]
  }

DEV OVERRIDE
  a0 run file.a0 --unsafe-allow-all       # bypasses all policy checks

COMMON ERRORS
  E_UNKNOWN_CAP    — invalid capability name in cap { ... }
  E_UNDECLARED_CAP — tool used but cap not declared (a0 check catches this)
  E_CAP_DENIED     — policy denies the capability at runtime (exit 3)

RULES
  - Only declare capabilities the program actually uses
  - cap must appear before any statements
  - Missing cap for a tool used -> E_UNDECLARED_CAP at validation time
  - cap declared but denied by policy -> E_CAP_DENIED at runtime
`.trimStart(),

// ─── BUDGET ─────────────────────────────────────────────────────────────────
budget: `
A0 BUDGET SYSTEM
=================

Declare resource limits after cap (before statements). Exceeding any limit
stops execution with E_BUDGET (exit 4).

DECLARATION
  budget { timeMs: 30000, maxToolCalls: 10, maxBytesWritten: 65536, maxIterations: 100 }

FIELDS
  Field             Type   Meaning
  timeMs            int    Maximum wall-clock time in milliseconds
  maxToolCalls      int    Maximum number of tool invocations
  maxBytesWritten   int    Maximum bytes written via fs.write
  maxIterations     int    Maximum for-loop iterations (cumulative across all loops)

RULES
  - Only declare fields the program needs
  - Unknown fields produce E_UNKNOWN_BUDGET at validation time (exit 2)
  - Budget is enforced at runtime — checked after each tool call / iteration
  - maxBytesWritten is enforced after each write completes (post-effect);
    the write side effect occurs before the limit is checked
  - budget can appear before or after cap, but both must precede statements

EXAMPLE
  cap { http.get: true, fs.write: true }
  budget { timeMs: 10000, maxToolCalls: 3, maxBytesWritten: 65536 }
  call? http.get { url: "https://api.example.com/data" } -> resp
  let body = parse.json { in: resp.body }
  do fs.write { path: "out.json", data: body, format: "json" } -> artifact
  return { artifact: artifact }
`.trimStart(),

// ─── FLOW ───────────────────────────────────────────────────────────────────
flow: `
A0 CONTROL FLOW
================

if — Conditional expression
  Syntax: if { cond: expr, then: val, else: val }
  - Lazy evaluation: only the taken branch evaluates
  - Uses A0 truthiness (false/null/0/"" are falsy)
  - Returns the value of the taken branch
  Example:
    let msg = if { cond: ok, then: "success", else: "failure" }
    let safe = if { cond: data, then: data, else: { default: true } }

for — List iteration
  Syntax: for { in: list_expr, as: "var_name" } { body }
  - Iterates each element, producing a list of results
  - Loop variable is scoped to the body
  - Body MUST end with return { ... }
  - Subject to maxIterations budget (cumulative)
  - E_FOR_NOT_LIST if in: value is not a list
  Example:
    let results = for { in: items, as: "item" } {
      let parsed = parse.json { in: item }
      return { data: parsed }
    }

fn — User-defined functions
  Syntax: fn name { param1, param2 } { body }
  - Must be defined BEFORE use (no hoisting)
  - Called with record-style args: name { param1: val, param2: val }
  - Params are destructured from caller's record
  - Missing params default to null
  - Body MUST end with return { ... }
  - Direct recursion allowed, no closures
  - Duplicate fn names produce E_FN_DUP
  Example:
    fn greet { name, greeting } {
      return { msg: greeting, who: name }
    }
    let result = greet { name: "world", greeting: "hello" }

match — ok/err discrimination
  Syntax: match expr { ok {var} { body } err {var} { body } }
  - Subject must be a record with an ok or err key
  - The inner value is bound to the named variable
  - Both arms MUST end with return { ... }
  - E_MATCH_NOT_RECORD if subject is not a record
  - E_MATCH_NO_ARM if subject has neither ok nor err key
  Example:
    let output = match result {
      ok { val } {
        return { data: val }
      }
      err { e } {
        return { error: e }
      }
    }
`.trimStart(),

// ─── DIAGNOSTICS ────────────────────────────────────────────────────────────
diagnostics: `
A0 DIAGNOSTICS REFERENCE
=========================

DIAGNOSTIC FORMAT
  error[E_CODE]: Message
    --> file.a0:line:col
    hint: Suggested fix

COMPILE-TIME ERRORS (exit 2) — caught by a0 check
  Code              Cause                           Fix
  E_LEX             Invalid token                   Check quotes, escapes, special chars
  E_PARSE           Syntax error                    Verify statement structure, braces
  E_AST             AST construction failed          Simplify expression
  E_NO_RETURN       Missing return                  Add return { ... } as last stmt
  E_RETURN_NOT_LAST Statements after return          Move return to end
  E_UNKNOWN_CAP     Invalid capability name          Use: fs.read fs.write http.get sh.exec
  E_UNDECLARED_CAP  Tool used without cap            Add capability to cap { ... }
  E_UNKNOWN_BUDGET  Invalid budget field             Use: timeMs maxToolCalls maxBytesWritten maxIterations
  E_DUP_BINDING     Duplicate let name               Rename one binding
  E_UNBOUND         Undefined variable               Bind with let or -> first
  E_CALL_EFFECT     call? on effect tool              Use do for fs.write, sh.exec
  E_FN_DUP          Duplicate fn name                Rename one function

RUNTIME ERRORS (exit 3/4/5)
  Code              Exit  Cause                      Fix
  E_CAP_DENIED      3     Policy denies capability   Update cap {} or policy file
  E_UNKNOWN_TOOL    4     Unknown tool name           Check spelling: fs.read fs.write http.get sh.exec
  E_TOOL_ARGS       4     Invalid tool arguments     Check args match tool schema
  E_TOOL            4     Tool execution failed       Check args, paths, URLs, perms
  E_BUDGET          4     Budget limit exceeded       Increase limit or reduce usage
  E_UNKNOWN_FN      4     Unknown stdlib function     Check: parse.json get put patch eq contains not and or
  E_FN              4     Stdlib function threw        Check function args (e.g. invalid JSON)
  E_PATH            4     Dot-access on non-record   Verify variable holds a record
  E_FOR_NOT_LIST    4     for in: is not a list      Ensure in: evaluates to [...]
  E_MATCH_NOT_RECORD 4    match on non-record         Ensure subject is { ok: ... } or { err: ... }
  E_MATCH_NO_ARM    4     No ok/err key in subject   Subject must have ok or err key
  E_ASSERT          5     assert condition false      Fix condition or upstream data
  E_CHECK           5     check condition false       Fix condition or upstream data

DEBUGGING WORKFLOW
  1. a0 check file.a0              # catch compile-time errors first
  2. Read error code + line:col    # look up in table above
  3. Apply hint if present         # hints give direct fix
  4. a0 run file.a0 --trace t.jsonl --unsafe-allow-all   # for runtime issues
  5. a0 trace t.jsonl              # inspect execution events
  6. a0 fmt file.a0 --write        # normalize after fixing

COMMON PITFALLS
  - http.get body is a string — must parse.json before dot access
  - fs.read returns a string — must parse.json if file is JSON
  - sh.exec returns { exitCode, stdout, stderr } — check exitCode
  - No reassignment — each let binding must have a unique name
`.trimStart(),

// ─── EXAMPLES ───────────────────────────────────────────────────────────────
examples: `
A0 EXAMPLE PROGRAMS
====================

1. MINIMAL — Pure data, no capabilities
  let data = { name: "example", version: 1 }
  return { result: data }

2. HTTP FETCH + TRANSFORM
  cap { http.get: true, fs.write: true }
  call? http.get { url: "https://api.example.com/todos/1" } -> response
  let body = parse.json { in: response.body }
  let title = get { in: body, path: "title" }
  do fs.write { path: "output.json", data: { title: title }, format: "json" } -> artifact
  return { artifact: artifact }

3. FILE READ + TRANSFORM + WRITE
  cap { fs.read: true, fs.write: true }
  call? fs.read { path: "config.json" } -> raw
  let config = parse.json { in: raw }
  let updated = put { in: config, path: "version", value: 2 }
  do fs.write { path: "config.json", data: updated, format: "json" } -> artifact
  return { artifact: artifact }

4. SHELL COMMAND
  cap { sh.exec: true }
  do sh.exec { cmd: "git log --oneline -5", timeoutMs: 10000 } -> result
  let ok = eq { a: result.exitCode, b: 0 }
  assert { that: ok, msg: "git command succeeded" }
  return { log: result.stdout }

5. VALIDATION WITH PREDICATES
  cap { fs.read: true }
  call? fs.read { path: "data.json" } -> raw
  let data = parse.json { in: raw }
  let has_name = contains { in: data, value: "name" }
  assert { that: has_name, msg: "must have name field" }
  let name = get { in: data, path: "name" }
  let not_empty = not { in: eq { a: name, b: "" } }
  assert { that: not_empty, msg: "name must not be empty" }
  return { valid: true, name: name }

6. FOR LOOP + FUNCTION
  fn double { n } {
    let result = patch { in: { val: n }, ops: [{ op: "replace", path: "/val", value: n }] }
    return { doubled: n }
  }
  let items = [1, 2, 3, 4, 5]
  let results = for { in: items, as: "item" } {
    let d = double { n: item }
    return { value: d }
  }
  return { results: results }

7. BUDGET-CONSTRAINED
  cap { http.get: true, fs.write: true }
  budget { timeMs: 10000, maxToolCalls: 3, maxBytesWritten: 65536 }
  call? http.get { url: "https://api.example.com/data" } -> resp
  let body = parse.json { in: resp.body }
  let ok = eq { a: resp.status, b: 200 }
  assert { that: ok, msg: "HTTP request succeeded" }
  do fs.write { path: "result.json", data: body, format: "json" } -> artifact
  return { artifact: artifact }

8. MATCH OK/ERR
  let result = { ok: { name: "Alice", score: 95 } }
  let output = match result {
    ok { val } {
      let name = get { in: val, path: "name" }
      return { status: "success", name: name }
    }
    err { e } {
      return { status: "error", message: e }
    }
  }
  return { output: output }

CLI USAGE
  a0 run file.a0                        # execute (deny-by-default)
  a0 run file.a0 --unsafe-allow-all     # bypass caps (dev only)
  a0 run file.a0 --trace t.jsonl        # emit execution trace
  a0 run file.a0 --pretty               # human-readable errors
  a0 check file.a0                      # validate without running
  a0 fmt file.a0                        # format to stdout
  a0 fmt file.a0 --write                # format in place
  a0 trace t.jsonl                      # summarize trace file
`.trimStart(),

};

export const TOPIC_LIST = Object.keys(TOPICS);
