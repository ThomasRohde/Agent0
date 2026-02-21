# Plan: Write Missing Tests for v0.5 Features

## Analysis of Existing Tests

After reviewing all three test files, I found that the existing tests already have **substantial coverage** for v0.5 features. Here's what already exists:

### Evaluator Tests (evaluator.test.ts) - Already Covered:
- **Bare returns**: integer, string, boolean, null, list, expression, record backward compat, for body, fn body, filter fn predicate
- **Filter blocks**: basic inline predicate, filter records by field, empty list, budget enforcement, trace events, backward compat (by: key, fn: pred)
- **Loop**: 0 iterations, simple counter, complex state (record accumulator), budget enforcement, non-integer times error, negative times error, trace events, nested loops
- **Spread**: basic spread, later keys override, multiple spreads, E_TYPE on non-record, E_TYPE on null
- **Try/catch**: no error path, catches tool failure, catches stdlib error, nested try/catch
- **Block if/else**: true condition, false condition, tool calls in branches, variable scoping, record-style backward compat

### Parser Tests (parser.test.ts) - Already Covered:
- Basic parsing, binary expressions, comparison operators, parenthesized expressions, match parsing, unary expressions
- **Missing**: No parser tests for filter block, loop, spread, try/catch, block if/else, bare returns

### Formatter Tests (formatter.test.ts) - Already Covered:
- Bare returns: integer, string, expression, list, idempotent
- Filter block: formatting, idempotent
- Loop: formatting, idempotent
- **Missing**: No formatter tests for spread, try/catch, block if/else

## Plan: Missing Tests to Add

### 1. Parser Tests (`packages/core/src/parser.test.ts`)

Add parser-level AST structure tests for all v0.5 features:

**Filter Block Parsing:**
- `parses filter block expression` - verify AST structure (FilterBlockExpr kind, binding, body)
- `reports E_PARSE for filter block missing 'as' field`
- `reports E_PARSE for filter block missing 'in' field`

**Loop Parsing:**
- `parses loop expression` - verify AST structure (LoopExpr kind, init, times, binding, body)
- `reports E_PARSE for loop missing required fields`

**Spread Parsing:**
- `parses record spread syntax` - verify SpreadPair in record pairs
- `parses multiple spreads in a record`
- `parses spread mixed with normal keys`

**Try/Catch Parsing:**
- `parses try/catch expression` - verify TryExpr kind, tryBody, catchBinding, catchBody
- `parses nested try/catch`

**Block If/Else Parsing:**
- `parses block if/else expression` - verify IfBlockExpr kind, cond, thenBody, elseBody
- `parses block if without else still works` (if supported; or error if not)

**Bare Return Parsing:**
- `parses bare integer return` - verify ReturnStmt with IntLiteral value
- `parses bare string return`
- `parses bare expression return` - verify ReturnStmt with BinaryExpr value
- `parses bare list return`
- `parses bare variable return` - verify ReturnStmt with IdentPath value

### 2. Formatter Tests (`packages/core/src/formatter.test.ts`)

**Record Spread Formatting:**
- `formats record spread` - verify `{ ...base, key: val }` output
- `formats multiple record spreads`
- `spread formatting is idempotent` - parse -> format -> parse -> format should be identical

**Try/Catch Formatting:**
- `formats try/catch expression`
- `try/catch formatting is idempotent`

**Block If/Else Formatting:**
- `formats block if/else expression`
- `block if/else formatting is idempotent`

### 3. Evaluator Tests (`packages/core/src/evaluator.test.ts`)

The evaluator already has extensive coverage. Add targeted edge-case tests:

**Filter Block Edge Cases:**
- `filter block: multi-statement body with let bindings`
- `filter block: E_TYPE when 'in' is not a list` (for inline filter block, not fn-style)
- `filter block: access outer scope variables`

**Loop Edge Cases:**
- `loop: E_TYPE for string times value`
- `loop: access outer scope variables`
- `loop: body with multiple statements and let bindings`
- `loop: with stdlib calls in body`

**Spread Edge Cases:**
- `record spread: empty record spread`
- `record spread: spread with expression value (not just ident)`

**Try/Catch Edge Cases:**
- `try/catch: catches assert failure`
- `try/catch: emits try_start/try_end trace events`
- `try/catch: catch body can access outer scope variables`

**Bare Return Edge Cases:**
- `bare return: float literal`
- `bare return: variable identifier`
- `bare return: match body with bare return`
- `bare return: block if/else body with bare return`

## Verification Steps

1. `npm run build` - must succeed
2. `npm run test -w packages/core` - all tests must pass
3. `npm install -g ./packages/cli` - reinstall CLI globally
