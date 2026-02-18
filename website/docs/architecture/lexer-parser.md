---
sidebar_position: 2
---

# Lexer and Parser

The lexer and parser are both implemented using [Chevrotain](https://chevrotain.io/), a high-performance parser building toolkit for JavaScript.

## Lexer

**Source**: `packages/core/src/lexer.ts`

The lexer (tokenizer) converts source text into a stream of tokens. It is built with Chevrotain's `createToken` and `Lexer` APIs.

### Token ordering

Token order in the `allTokens` array matters for Chevrotain:

1. **Keywords before `Ident`** -- Keywords like `let`, `return`, `fn` must be defined before the general `Ident` token, otherwise identifiers would match first. Each keyword token uses `LONGER_ALT = Ident` so that `letter` matches as an identifier, not as `let` followed by `ter`.

2. **`FloatLit` before `IntLit`** -- `3.14` must match as a float, not as the integer `3` followed by `.14`. The float pattern is listed first so it takes priority.

### Reserved keywords

The following are reserved keywords and cannot be used as identifiers:

```
cap  budget  import  as  let  return  call?  do
assert  check  true  false  null  if  for  fn  match
```

Note that `ok`, `err`, `in`, `cond`, `then`, and `else` are **not** keywords. They are parsed as regular identifiers or record keys.

### Literals

| Token | Pattern | Examples |
|-------|---------|----------|
| `IntLit` | `0` or `[1-9]\d*` (no leading zeros) | `0`, `42`, `100` |
| `FloatLit` | Integer part `.` decimal part (optional exponent) | `3.14`, `1.0e10` |
| `StringLit` | Double-quoted with JSON escape sequences | `"hello"`, `"line\n"` |

### Operators

| Token | Symbol | Token | Symbol |
|-------|--------|-------|--------|
| `Plus` | `+` | `GtEq` | `>=` |
| `Minus` | `-` | `LtEq` | `<=` |
| `Star` | `*` | `EqEq` | `==` |
| `Slash` | `/` | `BangEq` | `!=` |
| `Percent` | `%` | `Gt` | `>` |
| | | `Lt` | `<` |

Multi-character operators (`>=`, `<=`, `==`, `!=`) are defined before their single-character counterparts (`>`, `<`, `=`) to ensure correct matching.

### Punctuation

`{` `}` `[` `]` `(` `)` `:` `,` `.` `->` `=`

## Parser

**Source**: `packages/core/src/parser.ts`

The parser is a Chevrotain CST (Concrete Syntax Tree) parser that produces an AST (Abstract Syntax Tree) via visitor functions.

### CST to AST

Chevrotain parsers produce a CST, which is a direct representation of the grammar rules applied. The parser includes visitor functions that walk the CST and produce typed AST nodes defined in `packages/core/src/ast.ts`.

### Expression grammar

Arithmetic and comparison expressions use precedence climbing to implement standard mathematical precedence:

```
expression
  -> comparisonExpr
    -> additiveExpr (( > | < | >= | <= | == | != ) additiveExpr)?
      -> multiplicativeExpr (( + | - ) multiplicativeExpr)*
        -> unaryExpr
          -> - unaryExpr | primaryExpr
            -> literal | identifier | ( expression ) | functionCall
```

This ensures:
- Unary `-` binds tightest
- `*`, `/`, `%` bind tighter than `+`, `-`
- Arithmetic binds tighter than comparisons (`>`, `<`, `>=`, `<=`, `==`, `!=`)
- Parentheses `( )` override any precedence

### AST node types for expressions

| Node | Operators | Example |
|------|-----------|---------|
| `BinaryExpr` | `+`, `-`, `*`, `/`, `%`, `>`, `<`, `>=`, `<=`, `==`, `!=` | `x + 1`, `a > b` |
| `UnaryExpr` | `-` (negation) | `-x` |

### Statement parsing

The parser recognizes these top-level constructs:

- **Headers**: `cap { ... }`, `budget { ... }`, `import ... as ...`
- **Statements**: `let`, `return`, `call?`, `do`, `assert`, `check`
- **Definitions**: `fn name { params } { body }`
- **Control flow**: `for { in, as } { body }`, `match expr { arms }`
- **Expressions**: Inline `if { cond, then, else }`, stdlib calls, arithmetic

### Error recovery

The parser is configured with `recoveryEnabled: false`. Parse errors produce `E_PARSE` diagnostics and halt immediately. This design choice favors precise error messages over partial AST recovery.
