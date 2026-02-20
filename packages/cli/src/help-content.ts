/**
 * A0 CLI Help Content
 * Dense, progressive-discovery language reference for terminal output.
 */

export const QUICKREF = `
A0 QUICK REFERENCE (v0.5)
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
  call? fs.read   { path }                -> str
  do    fs.write  { path, data, format? } -> { kind, path, bytes, sha256 }
  call? fs.list   { path }                -> [{ name, type }]
  call? fs.exists { path }                -> bool
  call? http.get  { url, headers? }       -> { status, headers, body }
  do    sh.exec   { cmd, cwd?, env?, timeoutMs? } -> { exitCode, stdout, stderr, durationMs }
  call? = read-only        do = side-effect
  Note: fs.list and fs.exists share the fs.read capability

STDLIB (pure, no cap needed)
  parse.json { in }             -> parsed value
  get  { in, path }             -> value at dotted path ("a.b[0]")
  put  { in, path, value }      -> new record
  patch { in, ops }             -> patched record (RFC 6902)
  eq { a, b } -> bool           contains { in, value } -> bool
  not { in }  -> bool           and { a, b } / or { a, b } -> bool
  coalesce { in, default } -> non-null value  typeof { in } -> type string
  pluck { in, key } -> list       flat { in } -> flattened list
  entries { in } -> [{ key, value }]
  str.template { in, vars } -> interpolated string

CONTROL FLOW
  let x = if { cond: expr, then: val, else: val }
  let results = for { in: list, as: "item" } { ... return { } }
  fn name { params } { ... return { } }    # define before use
  let x = match ident { ok {v} { return {} } err {e} { return {} } }
  let out = map { in: list, fn: "fnName" } # apply fn to each element
  let val = reduce { in: list, fn: "fnName", init: { val: 0 } } # accumulate
  let f = filter { in: list, fn: "pred" }  # predicate filter; fn returns { ok: bool }

EVIDENCE
  assert { that: bool_expr, msg?: "..." }  # fatal: false -> exit 5, halts immediately
  check  { that: bool_expr, msg?: "..." }  # non-fatal: records evidence, continues; exit 5 if any failed
  msg is optional; omitted msg becomes ""

REFERENCE CHEAT SHEET
  CAPS: fs.read  fs.write  http.get  sh.exec
  BUDGET: timeMs  maxToolCalls  maxBytesWritten  maxIterations
  EXIT CODES: 0=ok  1=cli-usage/help  2=parse/validate  3=cap-denied  4=runtime  5=assert/check
  PROPERTY ACCESS: resp.body  result.exitCode  data.items

MINIMAL EXAMPLE                        HTTP EXAMPLE
  let data = { name: "a0", v: 1 }       cap { http.get: true }
  return { result: data }               call? http.get { url: "https://x.co/api" } -> r
                                         let body = parse.json { in: r.body }
                                         return { data: body }

HELP TOPICS
  a0 help syntax
  a0 help types
  a0 help tools
  a0 help stdlib
  a0 help caps
  a0 help budget
  a0 help flow
  a0 help diagnostics
  a0 help examples
  a0 help stdlib --index    # compact full stdlib index
`.trimStart();

export const TOPICS: Record<string, string> = {

// ─── SYNTAX ─────────────────────────────────────────────────────────────────
syntax: `
A0 SYNTAX REFERENCE
====================

COMMENTS
  # single-line comment (own line or end of line)

PROGRAM HEADERS (must appear before any statements, any order)
  cap { capability.name: true, ... }     # declare required capabilities (value must be true)
  budget { field: value, ... }           # declare resource limits
  import "path" as alias                 # reserved for future use (currently E_IMPORT_UNSUPPORTED)

STATEMENTS
  let name = expr                        # bind a value
  call? tool.name { args } [-> name]     # read-only tool call, optional bind
  do tool.name { args } [-> name]        # effectful tool call, optional bind
  fn name { params } { body }            # define a function
  assert { that: expr, msg?: "str" }     # fatal: halt immediately if falsy (exit 5)
  check { that: expr, msg?: "str" }      # non-fatal: record evidence, continue; exit 5 if any failed
  return { key: val, ... }              # required, must be last statement

EXPRESSIONS
  42  3.14  true  false  null  "str"     # literals
  { key: val, k2: v2 }                  # record literal
  [1, 2, 3]                             # list literal
  name                                   # variable reference
  name.field                             # property access (dot notation)
  if { cond: x, then: y, else: z }      # conditional (lazy evaluation)
  for { in: list, as: "v" } { body }    # iteration (produces list)
  match ident { ok {v} {body} err {e} {body} }  # ok/err discrimination
  match ( expr ) { ok {v} {body} err {e} {body} }  # match on expression
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
  - Top-level: cap/budget headers must come first; fn and other statements may be interleaved
  - fn/for/match bodies have their own scope (parent-chained)
  - Functions use lexical scope (definition-site), not caller scope
  - No variable reassignment in the same scope — each let/-> creates a new binding
  - Shadowing is allowed in nested scopes (for/fn/match bodies)
  - fn params and for loop variables are scoped to their body
`.trimStart(),

// ─── TYPES ──────────────────────────────────────────────────────────────────
types: `
A0 TYPE SYSTEM
==============

PRIMITIVES
  Type    Literals              Notes
  int     42, -1, 0             64-bit double (JavaScript number)
  float   3.14, -0.5            64-bit double (JavaScript number)
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

fs.list — List directory contents
  Mode: read (call?)    Cap: fs.read
  Args:   { path: str }
  Return: [{ name: str, type: str }]   type: "file", "directory", or "other"
  Example:
    call? fs.list { path: "packages" } -> entries

fs.exists — Check if path exists
  Mode: read (call?)    Cap: fs.read
  Args:   { path: str }
  Return: bool
  Example:
    call? fs.exists { path: "config.json" } -> exists

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
  Unknown tool name   -> E_UNKNOWN_TOOL (usually exit 2 from validation; runtime exit 4 is rare)
  Note: fs.list and fs.exists share the fs.read capability

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
    str:    substring check (value must be a string; returns false otherwise)
    list:   element membership (deep equality)
    record: key existence (value must be a string; returns false otherwise)
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

  coalesce { in: any, default: any } -> any
    Returns 'in' if not null, else 'default'. Strictly null-checking (NOT truthiness).
    0, false, "" are preserved — only null triggers fallback.
    Example: let name = coalesce { in: user.name, default: "anonymous" }

  typeof { in: any } -> str
    Returns the A0 type name: "null", "boolean", "number", "string", "list", "record".
    Example: let t = typeof { in: data }

LIST FUNCTIONS

  len { in: list|str|record } -> int
    Length of a list, string, or record (number of keys).

  append { in: list, value: any } -> list
    Return new list with value added at end.

  concat { a: list, b: list } -> list
    Concatenate two lists.

  sort { in: list, by?: str|list } -> list
    Sort a list (by record field or multiple fields for multi-key sort).
    Multi-key: sort { in: items, by: ["group", "name"] }

  filter { in: list, by: str } -> list
    Keep record elements where element[by] is truthy.
  filter { in: list, fn: "fnName" } -> list
    Keep elements where user-defined predicate returns truthy.
    The predicate returns { ok: bool_expr } — filter checks the first value.
    The original item is kept (not the fn return value).
    Shares maxIterations budget with for/map/reduce.
    Example:
      fn isActive { item } { return { ok: item.active } }
      let active = filter { in: items, fn: "isActive" }

  pluck { in: list, key: str } -> list
    Extract a single field from each record in the list.
    Non-record elements yield null.
    Example: let names = pluck { in: users, key: "name" }

  find { in: list, key: str, value: any } -> any|null
    Return first record element where element[key] deeply equals value.

  range { from: int, to: int } -> list
    Generate a list of integers from 'from' (inclusive) to 'to' (exclusive).

  join { in: list, sep?: str } -> str
    Join list elements into a string. Default sep: "" (empty string).

  map { in: list, fn: "fnName" } -> list
    Apply a named user-defined function to each element, return results list.
    The fn must be defined with fn before use. Single-param fn gets each item;
    multi-param fn destructures record items by key.
    Shares maxIterations budget with for loops and reduce.
    Example:
      fn double { x } { return { val: x * 2 } }
      let nums = [1, 2, 3]
      let doubled = map { in: nums, fn: "double" }

  reduce { in: list, fn: "fnName", init: any } -> any
    Accumulate a list into a single value via a 2-param function.
    The fn must accept (accumulator, item). Shares maxIterations budget.
    Example:
      fn addScore { acc, item } { return { val: acc.val + item.score } }
      let result = reduce { in: scores, fn: "addScore", init: { val: 0 } }

  unique { in: list } -> list
    Remove duplicates using deep equality. Preserves first-occurrence order.

  flat { in: list } -> list
    Flatten one level of nesting. Non-list elements preserved as-is.
    Example: let all = flat { in: [[1, 2], [3, 4]] }  # -> [1, 2, 3, 4]

MATH FUNCTIONS

  math.max { in: list } -> number
    Maximum of a numeric list. Throws on empty list or non-numbers.

  math.min { in: list } -> number
    Minimum of a numeric list. Throws on empty list or non-numbers.

STRING FUNCTIONS

  str.concat { parts: list } -> str
    Concatenate a list of values into a string.

  str.split { in: str, sep: str } -> list
    Split a string by separator.

  str.starts { in: str, value: str } -> bool
    Test whether string starts with value.

  str.ends { in: str, value: str } -> bool
    Test whether string ends with value.

  str.replace { in: str, from: str, to: str } -> str
    Replace all occurrences of substring.

  str.template { in: str, vars: record } -> str
    Replace {key} placeholders with values from vars record.
    Unmatched placeholders are left as-is for debugging visibility.
    Example: let p = str.template { in: "packages/{name}/pkg.json", vars: { name: dir } }

RECORD FUNCTIONS

  keys { in: record } -> list
    Return list of record keys.

  values { in: record } -> list
    Return list of record values.

  merge { a: record, b: record } -> record
    Shallow-merge two records (b overwrites a).

  entries { in: record } -> list
    Return list of { key, value } pairs from a record.
    Example: let pairs = entries { in: config }
    # -> [{ key: "a", value: 1 }, { key: "b", value: 2 }]
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
  # capability values must be literal true

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
  E_CAP_VALUE      — capability value is not true
  E_UNDECLARED_CAP — tool used but cap not declared (a0 check catches this)
  E_CAP_DENIED     — policy denies the capability at runtime (exit 3)

RULES
  - Only declare capabilities the program actually uses
  - Capability values must be literal true
  - cap must appear before any statements
  - Missing cap for a tool used -> E_UNDECLARED_CAP at validation time
  - cap declared but denied by policy -> E_CAP_DENIED at runtime
`.trimStart(),

// ─── BUDGET ─────────────────────────────────────────────────────────────────
budget: `
A0 BUDGET SYSTEM
=================

Declare resource limits before statements. Exceeding any limit
stops execution with E_BUDGET (exit 4).

DECLARATION
  budget { timeMs: 30000, maxToolCalls: 10, maxBytesWritten: 65536, maxIterations: 100 }

FIELDS
  Field             Type   Meaning
  timeMs            int    Maximum wall-clock time in milliseconds
  maxToolCalls      int    Maximum number of tool invocations
  maxBytesWritten   int    Maximum bytes written via fs.write
  maxIterations     int    Maximum for/map/filter(fn:)/reduce iterations (cumulative)

RULES
  - Only declare fields the program needs
  - Declare at most one budget header (E_DUP_BUDGET)
  - Unknown fields produce E_UNKNOWN_BUDGET at validation time (exit 2)
  - Budget fields must be integer literals (E_BUDGET_TYPE)
  - timeMs is enforced during expression and statement evaluation
  - maxToolCalls/maxIterations are checked during tool calls and for/map/filter(fn:)/reduce iterations
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
  - Lexical scoping: fn reads outer bindings from where it was defined (not from caller scope)
  - Direct recursion allowed
  - Duplicate fn names produce E_FN_DUP
  Example:
    fn greet { name, greeting } {
      return { msg: greeting, who: name }
    }
    let result = greet { name: "world", greeting: "hello" }

match — ok/err discrimination
  Syntax: match ident { ok {var} { body } err {var} { body } }
          match ( expr ) { ok {var} { body } err {var} { body } }
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

map — Higher-order list transformation
  Syntax: map { in: list_expr, fn: "fnName" }
  - Calls the named user-defined function on each list element
  - Returns a new list of results
  - fn must be defined before use (with fn keyword)
  - Single-param fn receives each item directly
  - Multi-param fn destructures record items by key name
  - Non-record items with multi-param fn produce E_TYPE
  - Shares maxIterations budget with for/filter(fn:)/reduce (cumulative)
  - E_TYPE if in: is not a list, fn: is not a string, or a multi-param item is not a record
  - E_UNKNOWN_FN if the named function doesn't exist
  Example:
    fn double { x } {
      return { val: x * 2 }
    }
    let nums = [1, 2, 3]
    let doubled = map { in: nums, fn: "double" }

filter — Predicate-based list filtering (with fn:)
  Syntax: filter { in: list_expr, fn: "fnName" }
  - Calls the named user-defined function on each list element
  - The predicate returns { ok: bool_expr } — filter checks the first value
  - Keeps the original item when the first value in the result is truthy
  - fn must be defined before use (with fn keyword)
  - Single-param fn receives each item directly
  - Multi-param fn destructures record items by key name
  - Shares maxIterations budget with for/map/reduce (cumulative counter)
  - Backward compatible: filter { in: list, by: "key" } still works
  Example:
    fn isActive { item } {
      return { ok: item.active }
    }
    let active = filter { in: items, fn: "isActive" }

reduce — Accumulate a list to a single value
  Syntax: reduce { in: list_expr, fn: "fnName", init: value }
  - Calls the named 2-param function with (accumulator, item) for each element
  - Returns the final accumulator value
  - fn must be defined before use and must accept exactly 2 parameters
  - Shares maxIterations budget with for/map/filter(fn:) (cumulative)
  - E_TYPE if fn doesn't have 2 params, in: is not a list, or fn: is not a string
  - E_UNKNOWN_FN if the named function doesn't exist
  Example:
    fn addScore { acc, item } {
      return { val: acc.val + item.score }
    }
    let result = reduce { in: scores, fn: "addScore", init: { val: 0 } }
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
  E_AST             AST construction failed (rare)   Report bug with minimal repro
  E_NO_RETURN       Missing return                  Add return { ... } as last stmt
  E_RETURN_NOT_LAST Statements after return          Move return to end
  E_UNKNOWN_CAP     Invalid capability name          Caps: fs.read fs.write http.get sh.exec
  E_IMPORT_UNSUPPORTED Import declarations are reserved Remove import headers for now
  E_CAP_VALUE       Capability value not true        Use capability declarations like fs.read: true
  E_UNDECLARED_CAP  Tool used without cap            Add capability to cap { ... }
  E_DUP_BUDGET      Multiple budget headers          Merge fields into one budget { ... }
  E_UNKNOWN_BUDGET  Invalid budget field             Use: timeMs maxToolCalls maxBytesWritten maxIterations
  E_BUDGET_TYPE     Budget value not int literal     Use integer literals in budget { ... }
  E_DUP_BINDING     Duplicate let name               Rename one binding
  E_UNBOUND         Undefined variable               Bind with let or -> first
  E_CALL_EFFECT     call? on effect tool              Use do for fs.write, sh.exec
  E_FN_DUP          Duplicate fn name                Rename one function
  E_UNKNOWN_FN      Unknown function name            Define function before use / fix spelling
  E_UNKNOWN_TOOL    Unknown tool name                Tools: fs.read fs.write fs.list fs.exists http.get sh.exec

RUNTIME ERRORS (exit 3/4/5)
  Code              Exit  Cause                      Fix
  E_CAP_DENIED      3     Policy denies capability   Update cap {} or policy file
  E_IO              4     CLI I/O error               Check file paths and permissions
  E_TRACE           4     Invalid trace input          Use valid single-run JSONL with at least one event
  E_UNKNOWN_TOOL    4     Unknown tool at runtime (rare) Usually caught by validation (exit 2)
  E_TOOL_ARGS       4     Invalid tool arguments     Check args match tool schema
  E_TOOL            4     Tool execution failed       Check args, paths, URLs, perms
  E_RUNTIME         4     Unexpected runtime error    Report bug with repro; inspect trace/output context
  E_BUDGET          4     Budget limit exceeded       Increase limit or reduce usage
  E_UNKNOWN_FN      4     Unknown function at runtime (rare) Check: parse.json get put patch eq contains not and or
                                                     coalesce typeof len append concat sort filter find range join
                                                     map reduce unique pluck flat str.concat str.split str.starts
                                                     str.ends str.replace str.template keys values merge entries
                                                     math.max math.min  (or user-defined fn names)
  E_FN              4     Stdlib function threw        Check function args (e.g. invalid JSON)
  E_PATH            4     Dot-access on non-record   Verify variable holds a record
  E_TYPE            4     Type mismatch at runtime   Check arg types (e.g. map in:/fn: types)
  E_FOR_NOT_LIST    4     for in: is not a list      Ensure in: evaluates to [...]
  E_MATCH_NOT_RECORD 4    match on non-record         Ensure subject is { ok: ... } or { err: ... }
  E_MATCH_NO_ARM    4     No ok/err key in subject   Subject must have ok or err key
  E_ASSERT          5     assert condition false (fatal, halts)        Fix condition or upstream data
  check failed      5     non-fatal evidence failure                    Fix condition or upstream data; exit 5 after run

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

8. MAP — HIGHER-ORDER LIST TRANSFORM
  fn double { x } {
    return { val: x * 2 }
  }
  let nums = [1, 2, 3, 4, 5]
  let doubled = map { in: nums, fn: "double" }
  return { doubled: doubled }

9. MATCH OK/ERR
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

10. DYNAMIC FILE DISCOVERY + STR.TEMPLATE + COALESCE + FILTER FN:
  cap { fs.read: true, fs.write: true }
  call? fs.list { path: "packages" } -> entries
  fn isDir { item } {
    return { ok: eq { a: item.type, b: "directory" } }
  }
  let dirs = filter { in: entries, fn: "isDir" }
  let packages = for { in: dirs, as: "d" } {
    let path = str.template { in: "packages/{name}/package.json", vars: { name: d.name } }
    call? fs.read { path: path } -> raw
    let pkg = parse.json { in: raw }
    let version = coalesce { in: pkg.version, default: "0.0.0" }
    let t = typeof { in: pkg.dependencies }
    let depNames = if { cond: eq { a: t, b: "record" }, then: keys { in: pkg.dependencies }, else: [] }
    return { name: pkg.name, version: version, deps: depNames }
  }
  let names = pluck { in: packages, key: "name" }
  do fs.write { path: "summary.json", data: { packages: packages, names: names }, format: "json" } -> out
  return { artifact: out }

CLI USAGE
  a0 run file.a0                        # execute (deny-by-default)
  a0 run file.a0 --debug-parse          # show raw parser internals on parse errors
  a0 run file.a0 --unsafe-allow-all     # bypass caps (dev only)
  a0 run file.a0 --trace t.jsonl        # emit execution trace
  a0 run file.a0 --pretty               # human-readable errors
  a0 check file.a0                      # validate without running (prints [])
  a0 check file.a0 --stable-json        # validate with stable machine success schema
  a0 check file.a0 --debug-parse        # show raw parser internals on parse errors
  a0 fmt file.a0                        # format to stdout
  a0 fmt file.a0 --write                # format in place
  a0 trace t.jsonl                      # summarize trace file
  a0 policy                             # show effective policy resolution
  a0 policy --json                      # policy as JSON
  a0 help stdlib --index                # compact full stdlib index
`.trimStart(),

};

export const TOPIC_LIST = Object.keys(TOPICS);
