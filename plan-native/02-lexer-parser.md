# 02 - Lexer and Parser Design

## Overview

This document specifies the design for the A0 lexer (tokenizer) and parser in Go, targeting compilation to both native binaries and WebAssembly. The design must faithfully reproduce the behavior of the TypeScript reference implementation (`packages/core/src/lexer.ts`, `packages/core/src/parser.ts`, `packages/core/src/ast.ts`) while leveraging Go's strengths: simple value types, exhaustive switches, and zero-dependency compilation.

**Recommendation:** Hand-written lexer and recursive-descent parser. This gives us full control over token ordering, error messages, span tracking, and WASM binary size -- all critical requirements.

---

## 1. Lexer Design

### 1.1 Approach: Hand-Written Scanner

The TypeScript implementation uses Chevrotain, a parser combinator library that handles token ordering, keyword/identifier disambiguation, and longest-match semantics. For Go, a hand-written scanner is the right choice because:

| Factor | Hand-Written | Generated (ANTLR4/participle/pigeon) |
|---|---|---|
| Binary size | Minimal (~20KB code) | Large runtime (ANTLR4 Go: ~500KB+) |
| WASM compatibility | No runtime dependencies | May require reflection, goroutines |
| Token ordering control | Explicit, deterministic | Implicit via grammar rules |
| Error messages | Fully customizable | Generic, framework-dependent |
| Performance | Optimal (single pass) | Comparable but with overhead |
| Maintenance | Must handle edge cases manually | Grammar-driven updates |

### 1.2 Token Types

All token types map directly from the Chevrotain definitions in `lexer.ts`. The Go implementation uses `iota` constants:

```go
package lexer

// TokenType represents the type of a lexical token.
type TokenType int

const (
    // Special
    TokenEOF TokenType = iota
    TokenIllegal

    // Keywords (22 keywords total)
    TokenCap       // cap
    TokenBudget    // budget
    TokenImport    // import
    TokenAs        // as
    TokenLet       // let
    TokenReturn    // return
    TokenCallQ     // call?
    TokenDo        // do
    TokenAssert    // assert
    TokenCheck     // check
    TokenTrue      // true
    TokenFalse     // false
    TokenNull      // null
    TokenIf        // if
    TokenElse      // else
    TokenFor       // for
    TokenFn        // fn
    TokenMatch     // match
    TokenTry       // try
    TokenCatch     // catch
    TokenFilter    // filter
    TokenLoop      // loop

    // Literals
    TokenIntLit    // 0, 1, 42, 100
    TokenFloatLit  // 3.14, 1.0e10
    TokenStringLit // "hello"

    // Identifiers
    TokenIdent     // user-defined names

    // Punctuation
    TokenLBrace    // {
    TokenRBrace    // }
    TokenLBracket  // [
    TokenRBracket  // ]
    TokenLParen    // (
    TokenRParen    // )
    TokenColon     // :
    TokenComma     // ,
    TokenDotDotDot // ...
    TokenDot       // .
    TokenArrow     // ->
    TokenEquals    // =

    // Comparison operators
    TokenGtEq      // >=
    TokenLtEq      // <=
    TokenEqEq      // ==
    TokenBangEq    // !=
    TokenGt        // >
    TokenLt        // <

    // Arithmetic operators
    TokenPlus      // +
    TokenMinus     // -
    TokenStar      // *
    TokenSlash     // /
    TokenPercent   // %
)
```

### 1.3 Token Structure

```go
// Token represents a single lexical token with its position.
type Token struct {
    Type    TokenType
    Literal string // raw text of the token
    Line    int    // 1-based line number
    Col     int    // 1-based column number
    EndLine int    // end position line
    EndCol  int    // end position column (exclusive)
    Offset  int    // byte offset in source (for fast slicing)
}
```

### 1.4 Keyword Table

The Chevrotain implementation uses `LONGER_ALT` to ensure keywords don't greedily consume prefixes of identifiers (e.g., `capture` must lex as `Ident("capture")`, not `Cap` + `Ident("ture")`). In Go, we implement this by:

1. Scanning the full identifier string (`[A-Za-z_][A-Za-z0-9_]*`)
2. Looking up the result in a keyword map
3. If found, returning the keyword token; otherwise returning `TokenIdent`

```go
var keywords = map[string]TokenType{
    "cap":    TokenCap,
    "budget": TokenBudget,
    "import": TokenImport,
    "as":     TokenAs,
    "let":    TokenLet,
    "return": TokenReturn,
    "do":     TokenDo,
    "assert": TokenAssert,
    "check":  TokenCheck,
    "true":   TokenTrue,
    "false":  TokenFalse,
    "null":   TokenNull,
    "if":     TokenIf,
    "else":   TokenElse,
    "for":    TokenFor,
    "fn":     TokenFn,
    "match":  TokenMatch,
    "try":    TokenTry,
    "catch":  TokenCatch,
    "filter": TokenFilter,
    "loop":   TokenLoop,
}
```

Note: `call?` is special. It cannot be a simple keyword lookup because it contains a non-identifier character (`?`). The lexer must handle it as a two-character sequence: when it encounters the identifier `call`, it peeks at the next character. If it is `?`, it consumes both and returns `TokenCallQ`. Otherwise it returns `TokenIdent("call")`.

```go
func (l *Lexer) scanIdentOrKeyword() Token {
    start := l.offset
    startLine, startCol := l.line, l.col

    for l.offset < len(l.source) && isIdentChar(l.source[l.offset]) {
        l.advance()
    }

    literal := l.source[start:l.offset]

    // Special case: "call" followed by "?" -> TokenCallQ
    if literal == "call" && l.offset < len(l.source) && l.source[l.offset] == '?' {
        l.advance()
        return Token{
            Type:    TokenCallQ,
            Literal: "call?",
            Line:    startLine,
            Col:     startCol,
            EndLine: l.line,
            EndCol:  l.col,
            Offset:  start,
        }
    }

    tt := TokenIdent
    if kw, ok := keywords[literal]; ok {
        tt = kw
    }

    return Token{
        Type:    tt,
        Literal: literal,
        Line:    startLine,
        Col:     startCol,
        EndLine: l.line,
        EndCol:  l.col,
        Offset:  start,
    }
}
```

### 1.5 Token Ordering (Critical Disambiguation Rules)

The Chevrotain `allTokens` array order is critical for correct tokenization. In a hand-written lexer, we handle these cases explicitly in the main `NextToken()` switch:

**Multi-character operators before single-character operators:**

```go
func (l *Lexer) NextToken() Token {
    l.skipWhitespaceAndComments()

    if l.offset >= len(l.source) {
        return l.makeToken(TokenEOF, "")
    }

    ch := l.source[l.offset]

    switch ch {
    // Multi-char operators: peek ahead to disambiguate
    case '-':
        if l.peek() == '>' {
            return l.scanTwo(TokenArrow, "->")
        }
        return l.scanOne(TokenMinus, "-")

    case '>':
        if l.peek() == '=' {
            return l.scanTwo(TokenGtEq, ">=")
        }
        return l.scanOne(TokenGt, ">")

    case '<':
        if l.peek() == '=' {
            return l.scanTwo(TokenLtEq, "<=")
        }
        return l.scanOne(TokenLt, "<")

    case '=':
        if l.peek() == '=' {
            return l.scanTwo(TokenEqEq, "==")
        }
        return l.scanOne(TokenEquals, "=")

    case '!':
        if l.peek() == '=' {
            return l.scanTwo(TokenBangEq, "!=")
        }
        return l.makeError("unexpected character '!'")

    case '.':
        if l.peekN(1) == '.' && l.peekN(2) == '.' {
            return l.scanN(3, TokenDotDotDot, "...")
        }
        return l.scanOne(TokenDot, ".")

    // Single-char punctuation
    case '{': return l.scanOne(TokenLBrace, "{")
    case '}': return l.scanOne(TokenRBrace, "}")
    case '[': return l.scanOne(TokenLBracket, "[")
    case ']': return l.scanOne(TokenRBracket, "]")
    case '(': return l.scanOne(TokenLParen, "(")
    case ')': return l.scanOne(TokenRParen, ")")
    case ':': return l.scanOne(TokenColon, ":")
    case ',': return l.scanOne(TokenComma, ",")
    case '+': return l.scanOne(TokenPlus, "+")
    case '*': return l.scanOne(TokenStar, "*")
    case '/': return l.scanOne(TokenSlash, "/")
    case '%': return l.scanOne(TokenPercent, "%")

    // String literals
    case '"':
        return l.scanString()

    default:
        // Numbers: FloatLit before IntLit (handled by scanNumber)
        if isDigit(ch) {
            return l.scanNumber()
        }
        // Identifiers and keywords
        if isIdentStart(ch) {
            return l.scanIdentOrKeyword()
        }

        return l.makeError(fmt.Sprintf("unexpected character '%c'", ch))
    }
}
```

**FloatLit before IntLit:**

The Chevrotain implementation requires `FloatLit` to appear before `IntLit` in the `allTokens` array because both start with digits. Chevrotain tries patterns in order and uses first match. In a hand-written scanner, we handle this in `scanNumber()`:

```go
func (l *Lexer) scanNumber() Token {
    start := l.offset
    startLine, startCol := l.line, l.col

    // Scan integer part: 0 | [1-9][0-9]*
    if l.source[l.offset] == '0' {
        l.advance()
    } else {
        l.advance() // first digit [1-9]
        for l.offset < len(l.source) && isDigit(l.source[l.offset]) {
            l.advance()
        }
    }

    isFloat := false

    // Check for decimal point (but not "..." spread)
    if l.offset < len(l.source) && l.source[l.offset] == '.' {
        // Peek: must be followed by a digit to be a float
        if l.offset+1 < len(l.source) && isDigit(l.source[l.offset+1]) {
            isFloat = true
            l.advance() // consume '.'
            for l.offset < len(l.source) && isDigit(l.source[l.offset]) {
                l.advance()
            }
        }
    }

    // Check for exponent
    if l.offset < len(l.source) && (l.source[l.offset] == 'e' || l.source[l.offset] == 'E') {
        isFloat = true
        l.advance()
        if l.offset < len(l.source) && (l.source[l.offset] == '+' || l.source[l.offset] == '-') {
            l.advance()
        }
        for l.offset < len(l.source) && isDigit(l.source[l.offset]) {
            l.advance()
        }
    }

    // IntLit negative lookahead: reject if followed by '.', digit, 'e', or 'E'
    // (Reference: /(?:0|[1-9]\d*)(?![.\deE])/ in lexer.ts)
    if !isFloat && l.offset < len(l.source) {
        next := l.source[l.offset]
        if next == '.' || isDigit(next) || next == 'e' || next == 'E' {
            // This shouldn't happen given the scanning above,
            // but acts as a safety check
            return l.makeError("invalid number literal")
        }
    }

    literal := l.source[start:l.offset]
    tt := TokenIntLit
    if isFloat {
        tt = TokenFloatLit
    }

    return Token{
        Type:    tt,
        Literal: literal,
        Line:    startLine,
        Col:     startCol,
        EndLine: l.line,
        EndCol:  l.col,
        Offset:  start,
    }
}
```

### 1.6 String Literal Scanning

The reference regex: `/"(?:[^"\\]|\\["\\\/bfnrt]|\\u[0-9a-fA-F]{4})*"/`

This is JSON-compatible string syntax. The Go scanner must handle:
- Regular characters (not `"` or `\`)
- Escape sequences: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`
- Unicode escapes: `\uXXXX`
- Reject unclosed strings and invalid escapes

```go
func (l *Lexer) scanString() Token {
    start := l.offset
    startLine, startCol := l.line, l.col

    l.advance() // consume opening '"'

    for l.offset < len(l.source) {
        ch := l.source[l.offset]
        if ch == '"' {
            l.advance() // consume closing '"'
            literal := l.source[start:l.offset]
            return Token{
                Type:    TokenStringLit,
                Literal: literal,
                Line:    startLine,
                Col:     startCol,
                EndLine: l.line,
                EndCol:  l.col,
                Offset:  start,
            }
        }
        if ch == '\\' {
            l.advance()
            if l.offset >= len(l.source) {
                return l.makeError("unterminated string: unexpected end after backslash")
            }
            esc := l.source[l.offset]
            switch esc {
            case '"', '\\', '/', 'b', 'f', 'n', 'r', 't':
                l.advance()
            case 'u':
                l.advance()
                for i := 0; i < 4; i++ {
                    if l.offset >= len(l.source) || !isHexDigit(l.source[l.offset]) {
                        return l.makeError("invalid unicode escape in string")
                    }
                    l.advance()
                }
            default:
                return l.makeError(fmt.Sprintf("invalid escape character '\\%c'", esc))
            }
            continue
        }
        if ch == '\n' || ch == '\r' {
            return l.makeError("unterminated string: newline in string literal")
        }
        l.advance()
    }

    return l.makeError("unterminated string literal")
}
```

### 1.7 Whitespace and Comments

Whitespace (spaces, tabs) and newlines are skipped. Comments start with `#` and extend to end of line.

```go
func (l *Lexer) skipWhitespaceAndComments() {
    for l.offset < len(l.source) {
        ch := l.source[l.offset]
        switch {
        case ch == ' ' || ch == '\t':
            l.advance()
        case ch == '\n':
            l.advanceNewline()
        case ch == '\r':
            l.advance()
            if l.offset < len(l.source) && l.source[l.offset] == '\n' {
                l.advance()
            }
            l.line++
            l.col = 1
        case ch == '#':
            // Comment: skip to end of line
            for l.offset < len(l.source) && l.source[l.offset] != '\n' && l.source[l.offset] != '\r' {
                l.advance()
            }
        default:
            return
        }
    }
}
```

### 1.8 Lexer Structure

```go
// Lexer tokenizes A0 source code.
type Lexer struct {
    source string
    offset int
    line   int
    col    int
    file   string
    errors []Diagnostic
}

// NewLexer creates a new lexer for the given source.
func NewLexer(source, file string) *Lexer {
    return &Lexer{
        source: source,
        offset: 0,
        line:   1,
        col:    1,
        file:   file,
    }
}

// Tokenize produces all tokens from the source.
// Returns tokens and any lexer errors.
func (l *Lexer) Tokenize() ([]Token, []Diagnostic) {
    var tokens []Token
    for {
        tok := l.NextToken()
        if tok.Type == TokenIllegal {
            // Error already recorded
            continue
        }
        tokens = append(tokens, tok)
        if tok.Type == TokenEOF {
            break
        }
    }
    return tokens, l.errors
}
```

### 1.9 Diagnostic Integration

```go
// Diagnostic represents a compiler error or warning.
type Diagnostic struct {
    Code    string
    Message string
    Span    *Span
    Hint    string
}

// Span tracks source location.
type Span struct {
    File     string
    StartLine int
    StartCol  int
    EndLine   int
    EndCol    int  // exclusive
}
```

Lex errors emit `E_LEX` diagnostics matching the reference implementation behavior.

---

## 2. Parser Design

### 2.1 Approach: Recursive Descent

The Chevrotain parser is a hand-built recursive descent parser (Chevrotain CstParser is essentially a structured framework for recursive descent). Converting to Go recursive descent is a natural 1:1 mapping:

| Chevrotain Pattern | Go Equivalent |
|---|---|
| `this.RULE("name", () => { ... })` | `func (p *Parser) parseName() Node { ... }` |
| `this.CONSUME(TokenType)` | `p.expect(TokenType)` |
| `this.SUBRULE(this.rule)` | `p.parseRule()` |
| `this.OR([{ALT: ...}, ...])` | `switch p.peek() { case ... }` |
| `this.MANY(() => { ... })` | `for p.peek() == X { ... }` |
| `this.OPTION(() => { ... })` | `if p.peek() == X { ... }` |

### 2.2 AST Node Types

The AST types map directly from `ast.ts`. In Go, we use a sum type pattern with interfaces:

```go
package ast

// Node is the base interface for all AST nodes.
type Node interface {
    nodeKind() string
    GetSpan() Span
}

// Span tracks the source location of a node.
type Span struct {
    File      string
    StartLine int
    StartCol  int
    EndLine   int
    EndCol    int // exclusive, matching TypeScript convention
}

// baseNode provides common fields.
type baseNode struct {
    Span Span
}

func (b baseNode) GetSpan() Span { return b.Span }
```

#### Expressions

```go
// Expr is the interface for all expression nodes.
type Expr interface {
    Node
    exprNode() // marker method
}

// --- Literals ---

type IntLiteral struct {
    baseNode
    Value int64
}
func (n *IntLiteral) nodeKind() string { return "IntLiteral" }
func (n *IntLiteral) exprNode()        {}

type FloatLiteral struct {
    baseNode
    Value float64
}
func (n *FloatLiteral) nodeKind() string { return "FloatLiteral" }
func (n *FloatLiteral) exprNode()        {}

type BoolLiteral struct {
    baseNode
    Value bool
}
func (n *BoolLiteral) nodeKind() string { return "BoolLiteral" }
func (n *BoolLiteral) exprNode()        {}

type StrLiteral struct {
    baseNode
    Value string // unescaped string value
}
func (n *StrLiteral) nodeKind() string { return "StrLiteral" }
func (n *StrLiteral) exprNode()        {}

type NullLiteral struct {
    baseNode
}
func (n *NullLiteral) nodeKind() string { return "NullLiteral" }
func (n *NullLiteral) exprNode()        {}

// --- Identifiers ---

type IdentPath struct {
    baseNode
    Parts []string // e.g., ["fs", "read"] for fs.read
}
func (n *IdentPath) nodeKind() string { return "IdentPath" }
func (n *IdentPath) exprNode()        {}

// --- Collections ---

// RecordPair is a key-value pair in a record.
type RecordPair struct {
    baseNode
    Key   string
    Value Expr
}
func (n *RecordPair) nodeKind() string { return "RecordPair" }

// SpreadPair is a spread entry in a record: { ...expr }
type SpreadPair struct {
    baseNode
    Expr Expr
}
func (n *SpreadPair) nodeKind() string { return "SpreadPair" }

// RecordEntry is either a RecordPair or SpreadPair.
type RecordEntry interface {
    Node
    recordEntry() // marker
}
func (n *RecordPair) recordEntry()  {}
func (n *SpreadPair) recordEntry() {}

type RecordExpr struct {
    baseNode
    Pairs []RecordEntry
}
func (n *RecordExpr) nodeKind() string { return "RecordExpr" }
func (n *RecordExpr) exprNode()        {}

type ListExpr struct {
    baseNode
    Elements []Expr
}
func (n *ListExpr) nodeKind() string { return "ListExpr" }
func (n *ListExpr) exprNode()        {}

// --- Tool Calls ---

type CallExpr struct {
    baseNode
    Tool *IdentPath
    Args *RecordExpr
}
func (n *CallExpr) nodeKind() string { return "CallExpr" }
func (n *CallExpr) exprNode()        {}

type DoExpr struct {
    baseNode
    Tool *IdentPath
    Args *RecordExpr
}
func (n *DoExpr) nodeKind() string { return "DoExpr" }
func (n *DoExpr) exprNode()        {}

// --- Assert/Check ---

type AssertExpr struct {
    baseNode
    Args *RecordExpr
}
func (n *AssertExpr) nodeKind() string { return "AssertExpr" }
func (n *AssertExpr) exprNode()        {}

type CheckExpr struct {
    baseNode
    Args *RecordExpr
}
func (n *CheckExpr) nodeKind() string { return "CheckExpr" }
func (n *CheckExpr) exprNode()        {}

// --- Function Calls ---

type FnCallExpr struct {
    baseNode
    Name *IdentPath
    Args *RecordExpr
}
func (n *FnCallExpr) nodeKind() string { return "FnCallExpr" }
func (n *FnCallExpr) exprNode()        {}

// --- Control Flow ---

type IfExpr struct {
    baseNode
    Cond Expr
    Then Expr
    Else Expr
}
func (n *IfExpr) nodeKind() string { return "IfExpr" }
func (n *IfExpr) exprNode()        {}

type IfBlockExpr struct {
    baseNode
    Cond     Expr
    ThenBody []Stmt
    ElseBody []Stmt
}
func (n *IfBlockExpr) nodeKind() string { return "IfBlockExpr" }
func (n *IfBlockExpr) exprNode()        {}

type ForExpr struct {
    baseNode
    List    Expr
    Binding string
    Body    []Stmt
}
func (n *ForExpr) nodeKind() string { return "ForExpr" }
func (n *ForExpr) exprNode()        {}

type MatchArm struct {
    baseNode
    Tag     string // "ok" or "err"
    Binding string
    Body    []Stmt
}
func (n *MatchArm) nodeKind() string { return "MatchArm" }

type MatchExpr struct {
    baseNode
    Subject Expr
    OkArm   *MatchArm
    ErrArm  *MatchArm
}
func (n *MatchExpr) nodeKind() string { return "MatchExpr" }
func (n *MatchExpr) exprNode()        {}

type TryExpr struct {
    baseNode
    TryBody      []Stmt
    CatchBinding string
    CatchBody    []Stmt
}
func (n *TryExpr) nodeKind() string { return "TryExpr" }
func (n *TryExpr) exprNode()        {}

type FilterBlockExpr struct {
    baseNode
    List    Expr
    Binding string
    Body    []Stmt
}
func (n *FilterBlockExpr) nodeKind() string { return "FilterBlockExpr" }
func (n *FilterBlockExpr) exprNode()        {}

type LoopExpr struct {
    baseNode
    Init    Expr
    Times   Expr
    Binding string
    Body    []Stmt
}
func (n *LoopExpr) nodeKind() string { return "LoopExpr" }
func (n *LoopExpr) exprNode()        {}

// --- Arithmetic/Comparison ---

type BinaryOp string
const (
    OpAdd  BinaryOp = "+"
    OpSub  BinaryOp = "-"
    OpMul  BinaryOp = "*"
    OpDiv  BinaryOp = "/"
    OpMod  BinaryOp = "%"
    OpGt   BinaryOp = ">"
    OpLt   BinaryOp = "<"
    OpGtEq BinaryOp = ">="
    OpLtEq BinaryOp = "<="
    OpEqEq BinaryOp = "=="
    OpNeq  BinaryOp = "!="
)

type BinaryExpr struct {
    baseNode
    Op    BinaryOp
    Left  Expr
    Right Expr
}
func (n *BinaryExpr) nodeKind() string { return "BinaryExpr" }
func (n *BinaryExpr) exprNode()        {}

type UnaryOp string
const OpNeg UnaryOp = "-"

type UnaryExpr struct {
    baseNode
    Op      UnaryOp
    Operand Expr
}
func (n *UnaryExpr) nodeKind() string { return "UnaryExpr" }
func (n *UnaryExpr) exprNode()        {}
```

#### Statements

```go
// Stmt is the interface for all statement nodes.
type Stmt interface {
    Node
    stmtNode() // marker
}

type LetStmt struct {
    baseNode
    Name  string
    Value Expr
}
func (n *LetStmt) nodeKind() string { return "LetStmt" }
func (n *LetStmt) stmtNode()       {}

type ExprStmt struct {
    baseNode
    Expr   Expr
    Target *IdentPath // optional -> target
}
func (n *ExprStmt) nodeKind() string { return "ExprStmt" }
func (n *ExprStmt) stmtNode()       {}

type ReturnStmt struct {
    baseNode
    Value Expr
}
func (n *ReturnStmt) nodeKind() string { return "ReturnStmt" }
func (n *ReturnStmt) stmtNode()       {}

type FnDecl struct {
    baseNode
    Name   string
    Params []string
    Body   []Stmt
}
func (n *FnDecl) nodeKind() string { return "FnDecl" }
func (n *FnDecl) stmtNode()       {}
```

#### Headers and Program

```go
// Header is the interface for declaration headers.
type Header interface {
    Node
    headerNode() // marker
}

type CapDecl struct {
    baseNode
    Capabilities *RecordExpr
}
func (n *CapDecl) nodeKind() string  { return "CapDecl" }
func (n *CapDecl) headerNode()      {}

type BudgetDecl struct {
    baseNode
    Budget *RecordExpr
}
func (n *BudgetDecl) nodeKind() string  { return "BudgetDecl" }
func (n *BudgetDecl) headerNode()      {}

type ImportDecl struct {
    baseNode
    Path  string
    Alias string
}
func (n *ImportDecl) nodeKind() string  { return "ImportDecl" }
func (n *ImportDecl) headerNode()      {}

// Program is the top-level AST node.
type Program struct {
    baseNode
    Headers    []Header
    Statements []Stmt
}
func (n *Program) nodeKind() string { return "Program" }
```

### 2.3 Parser Structure

```go
package parser

import (
    "a0/ast"
    "a0/lexer"
)

// Parser converts a token stream into an AST.
type Parser struct {
    tokens  []lexer.Token
    pos     int
    file    string
    errors  []Diagnostic
}

// Parse tokenizes and parses the source, returning the program AST
// and any diagnostics.
func Parse(source, file string) (*ast.Program, []Diagnostic) {
    lex := lexer.NewLexer(source, file)
    tokens, lexErrors := lex.Tokenize()

    if len(lexErrors) > 0 {
        return nil, lexErrors
    }

    p := &Parser{
        tokens: tokens,
        pos:    0,
        file:   file,
    }

    program := p.parseProgram()

    if len(p.errors) > 0 {
        return nil, p.errors
    }

    return program, nil
}
```

### 2.4 Parser Helper Methods

```go
// peek returns the current token without consuming it.
func (p *Parser) peek() lexer.TokenType {
    if p.pos >= len(p.tokens) {
        return lexer.TokenEOF
    }
    return p.tokens[p.pos].Type
}

// current returns the current token.
func (p *Parser) current() lexer.Token {
    if p.pos >= len(p.tokens) {
        return lexer.Token{Type: lexer.TokenEOF}
    }
    return p.tokens[p.pos]
}

// advance consumes the current token and returns it.
func (p *Parser) advance() lexer.Token {
    tok := p.current()
    if tok.Type != lexer.TokenEOF {
        p.pos++
    }
    return tok
}

// expect consumes a token of the expected type, or records an error.
func (p *Parser) expect(tt lexer.TokenType) lexer.Token {
    tok := p.current()
    if tok.Type != tt {
        p.addError(fmt.Sprintf(
            "Expected %s but found '%s'.",
            tokenName(tt), tok.Literal,
        ), tok)
        return tok
    }
    return p.advance()
}

// tokenSpan creates a Span from a single token.
func (p *Parser) tokenSpan(tok lexer.Token) ast.Span {
    return ast.Span{
        File:      p.file,
        StartLine: tok.Line,
        StartCol:  tok.Col,
        EndLine:   tok.EndLine,
        EndCol:    tok.EndCol,
    }
}

// spanFrom creates a Span from a start token to the previous token.
func (p *Parser) spanFrom(start lexer.Token) ast.Span {
    end := p.tokens[p.pos-1] // last consumed token
    return ast.Span{
        File:      p.file,
        StartLine: start.Line,
        StartCol:  start.Col,
        EndLine:   end.EndLine,
        EndCol:    end.EndCol,
    }
}
```

### 2.5 Grammar Rules

The parser implements the grammar structure from `parser.ts`. Here are the key production rules:

#### Program and Headers

```go
// program = header* stmt*
func (p *Parser) parseProgram() *ast.Program {
    start := p.current()
    var headers []ast.Header
    var stmts []ast.Stmt

    // Parse headers (cap, budget, import)
    for p.peek() == lexer.TokenCap ||
        p.peek() == lexer.TokenBudget ||
        p.peek() == lexer.TokenImport {
        headers = append(headers, p.parseHeader())
    }

    // Parse statements
    for p.peek() != lexer.TokenEOF {
        stmts = append(stmts, p.parseStmt())
    }

    return &ast.Program{
        baseNode:   ast.baseNode{Span: p.spanFrom(start)},
        Headers:    headers,
        Statements: stmts,
    }
}

// header = capDecl | budgetDecl | importDecl
func (p *Parser) parseHeader() ast.Header {
    switch p.peek() {
    case lexer.TokenCap:
        return p.parseCapDecl()
    case lexer.TokenBudget:
        return p.parseBudgetDecl()
    case lexer.TokenImport:
        return p.parseImportDecl()
    default:
        p.addError("Expected header declaration", p.current())
        return nil
    }
}
```

#### Statements

```go
// stmt = fnDecl | letStmt | returnStmt | exprStmt
func (p *Parser) parseStmt() ast.Stmt {
    switch p.peek() {
    case lexer.TokenFn:
        return p.parseFnDecl()
    case lexer.TokenLet:
        return p.parseLetStmt()
    case lexer.TokenReturn:
        return p.parseReturnStmt()
    default:
        return p.parseExprStmt()
    }
}

// letStmt = "let" Ident "=" expr
func (p *Parser) parseLetStmt() *ast.LetStmt {
    start := p.expect(lexer.TokenLet)
    name := p.expect(lexer.TokenIdent)
    p.expect(lexer.TokenEquals)
    value := p.parseExpr()
    return &ast.LetStmt{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Name:     name.Literal,
        Value:    value,
    }
}

// returnStmt = "return" expr
func (p *Parser) parseReturnStmt() *ast.ReturnStmt {
    start := p.expect(lexer.TokenReturn)
    value := p.parseExpr()
    return &ast.ReturnStmt{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Value:    value,
    }
}

// exprStmt = expr ("->" identPath)?
func (p *Parser) parseExprStmt() *ast.ExprStmt {
    start := p.current()
    expr := p.parseExpr()
    var target *ast.IdentPath
    if p.peek() == lexer.TokenArrow {
        p.advance()
        target = p.parseIdentPath()
    }
    return &ast.ExprStmt{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Expr:     expr,
        Target:   target,
    }
}
```

### 2.6 Expression Parsing with Operator Precedence

The parser implements the same precedence-climbing approach as the TypeScript parser:

```
expr           -> if | for | match | call? | do | assert | check | try | filter | loop | comparison
comparison     -> additive ((> | < | >= | <= | == | !=) additive)?
additive       -> multiplicative ((+ | -) multiplicative)*
multiplicative -> unaryExpr ((* | / | %) unaryExpr)*
unaryExpr      -> "-" unaryExpr | primary
primary        -> "(" expr ")" | record | list | literal | identOrFnCall
```

```go
// expr = ifBlockExpr | ifExpr | forExpr | matchExpr | callExpr | doExpr
//      | assertExpr | checkExpr | tryExpr | filterExpr | loopExpr | comparison
func (p *Parser) parseExpr() ast.Expr {
    switch p.peek() {
    case lexer.TokenIf:
        return p.parseIfExpr() // disambiguates block vs inline
    case lexer.TokenFor:
        return p.parseForExpr()
    case lexer.TokenMatch:
        return p.parseMatchExpr()
    case lexer.TokenCallQ:
        return p.parseCallExpr()
    case lexer.TokenDo:
        return p.parseDoExpr()
    case lexer.TokenAssert:
        return p.parseAssertExpr()
    case lexer.TokenCheck:
        return p.parseCheckExpr()
    case lexer.TokenTry:
        return p.parseTryExpr()
    case lexer.TokenFilter:
        return p.parseFilterExpr()
    case lexer.TokenLoop:
        return p.parseLoopExpr()
    default:
        return p.parseComparison()
    }
}

// comparison = additive ((> | < | >= | <= | == | !=) additive)?
func (p *Parser) parseComparison() ast.Expr {
    start := p.current()
    left := p.parseAdditive()

    if isComparisonOp(p.peek()) {
        op := p.advance()
        right := p.parseAdditive()
        return &ast.BinaryExpr{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Op:       tokenToBinaryOp(op.Type),
            Left:     left,
            Right:    right,
        }
    }

    return left
}

// additive = multiplicative ((+ | -) multiplicative)*
func (p *Parser) parseAdditive() ast.Expr {
    start := p.current()
    left := p.parseMultiplicative()

    for p.peek() == lexer.TokenPlus || p.peek() == lexer.TokenMinus {
        op := p.advance()
        right := p.parseMultiplicative()
        left = &ast.BinaryExpr{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Op:       tokenToBinaryOp(op.Type),
            Left:     left,
            Right:    right,
        }
    }

    return left
}

// multiplicative = unaryExpr ((* | / | %) unaryExpr)*
func (p *Parser) parseMultiplicative() ast.Expr {
    start := p.current()
    left := p.parseUnaryExpr()

    for p.peek() == lexer.TokenStar || p.peek() == lexer.TokenSlash || p.peek() == lexer.TokenPercent {
        op := p.advance()
        right := p.parseUnaryExpr()
        left = &ast.BinaryExpr{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Op:       tokenToBinaryOp(op.Type),
            Left:     left,
            Right:    right,
        }
    }

    return left
}

// unaryExpr = "-" unaryExpr | primary
func (p *Parser) parseUnaryExpr() ast.Expr {
    if p.peek() == lexer.TokenMinus {
        start := p.advance()
        operand := p.parseUnaryExpr()
        return &ast.UnaryExpr{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Op:       ast.OpNeg,
            Operand:  operand,
        }
    }
    return p.parsePrimary()
}
```

### 2.7 Primary Expressions and If Disambiguation

The if expression has two forms that must be disambiguated:
- **Inline if:** `if { cond: ..., then: ..., else: ... }` (if followed by `{`)
- **Block if:** `if (cond) { body } else { body }` (if followed by `(`)

```go
func (p *Parser) parseIfExpr() ast.Expr {
    // Both forms start with "if"; disambiguate by next token
    if p.peekN(1) == lexer.TokenLParen {
        return p.parseIfBlockExpr()
    }
    return p.parseIfInlineExpr()
}

// ifBlockExpr = "if" "(" expr ")" block "else" block
func (p *Parser) parseIfBlockExpr() *ast.IfBlockExpr {
    start := p.expect(lexer.TokenIf)
    p.expect(lexer.TokenLParen)
    cond := p.parseExpr()
    p.expect(lexer.TokenRParen)
    thenBody := p.parseBlock()
    p.expect(lexer.TokenElse)
    elseBody := p.parseBlock()
    return &ast.IfBlockExpr{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Cond:     cond,
        ThenBody: thenBody,
        ElseBody: elseBody,
    }
}

// ifExpr = "if" record  (record must have cond, then, else keys)
func (p *Parser) parseIfInlineExpr() *ast.IfExpr {
    start := p.expect(lexer.TokenIf)
    rec := p.parseRecord()
    // Extract cond, then, else from record pairs
    var cond, thenExpr, elseExpr ast.Expr
    for _, entry := range rec.Pairs {
        pair, ok := entry.(*ast.RecordPair)
        if !ok { continue }
        switch pair.Key {
        case "cond": cond = pair.Value
        case "then": thenExpr = pair.Value
        case "else": elseExpr = pair.Value
        }
    }
    if cond == nil || thenExpr == nil || elseExpr == nil {
        p.addError("if expression requires cond, then, and else fields", start)
    }
    return &ast.IfExpr{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Cond:     cond,
        Then:     thenExpr,
        Else:     elseExpr,
    }
}
```

### 2.8 Record Parsing with Spread Support

Records support both regular key-value pairs and spread entries (`...expr`):

```go
// record = "{" (pairOrSpread ("," pairOrSpread)* ","?)? "}"
func (p *Parser) parseRecord() *ast.RecordExpr {
    start := p.expect(lexer.TokenLBrace)
    var pairs []ast.RecordEntry

    if p.peek() != lexer.TokenRBrace {
        pairs = append(pairs, p.parsePairOrSpread())
        for p.peek() == lexer.TokenComma {
            p.advance() // consume comma
            if p.peek() == lexer.TokenRBrace {
                break // trailing comma
            }
            pairs = append(pairs, p.parsePairOrSpread())
        }
    }

    p.expect(lexer.TokenRBrace)
    return &ast.RecordExpr{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Pairs:    pairs,
    }
}

func (p *Parser) parsePairOrSpread() ast.RecordEntry {
    if p.peek() == lexer.TokenDotDotDot {
        start := p.advance() // consume "..."
        expr := p.parseExpr()
        return &ast.SpreadPair{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Expr:     expr,
        }
    }
    return p.parsePair()
}

// pair = pairKey ":" expr
// pairKey = identOrKeyword ("." identOrKeyword)*
func (p *Parser) parsePair() *ast.RecordPair {
    start := p.current()
    key := p.parsePairKey()
    p.expect(lexer.TokenColon)
    value := p.parseExpr()
    return &ast.RecordPair{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Key:      key,
        Value:    value,
    }
}
```

### 2.9 Identifier Path and Keyword-as-Key

Record keys and identifier paths can contain keywords (e.g., `fs.read` where `read` is not a keyword but in principle any keyword can appear as a dotted segment). The reference implementation's `identOrKeyword` rule accepts any keyword token as well as `Ident`:

```go
// identOrKeyword returns the string image of an Ident or keyword token.
func (p *Parser) parseIdentOrKeyword() string {
    tok := p.current()
    if tok.Type == lexer.TokenIdent || isKeyword(tok.Type) {
        p.advance()
        return tok.Literal
    }
    p.addError("Expected identifier", tok)
    return ""
}

// isKeyword returns true if the token type is a keyword.
func isKeyword(tt lexer.TokenType) bool {
    switch tt {
    case lexer.TokenCap, lexer.TokenBudget, lexer.TokenImport,
        lexer.TokenAs, lexer.TokenLet, lexer.TokenReturn,
        lexer.TokenDo, lexer.TokenAssert, lexer.TokenCheck,
        lexer.TokenIf, lexer.TokenElse, lexer.TokenFor,
        lexer.TokenFn, lexer.TokenMatch, lexer.TokenTry,
        lexer.TokenCatch, lexer.TokenFilter, lexer.TokenLoop:
        return true
    default:
        return false
    }
}

// identPath = Ident ("." identOrKeyword)*
// Note: first segment must be a plain Ident, not a keyword
func (p *Parser) parseIdentPath() *ast.IdentPath {
    start := p.current()
    first := p.expect(lexer.TokenIdent)
    parts := []string{first.Literal}

    for p.peek() == lexer.TokenDot {
        p.advance()
        parts = append(parts, p.parseIdentOrKeyword())
    }

    return &ast.IdentPath{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        Parts:    parts,
    }
}
```

### 2.10 Filter Expression (Dual Form)

The filter keyword supports two forms:
1. **Function-call form:** `filter { in: list, by: "key" }` -- no block, desugars to `FnCallExpr`
2. **Block form:** `filter { in: list, as: "x" } { body }` -- has a block, produces `FilterBlockExpr`

```go
func (p *Parser) parseFilterExpr() ast.Expr {
    start := p.expect(lexer.TokenFilter)
    rec := p.parseRecord()

    // If no block follows, emit FnCallExpr (stdlib filter)
    if p.peek() != lexer.TokenLBrace {
        return &ast.FnCallExpr{
            baseNode: ast.baseNode{Span: p.spanFrom(start)},
            Name: &ast.IdentPath{
                baseNode: ast.baseNode{Span: p.spanFrom(start)},
                Parts:    []string{"filter"},
            },
            Args: rec,
        }
    }

    // Block form: extract in and as fields, parse body
    body := p.parseBlock()
    list, binding := extractInAs(rec)
    if list == nil || binding == "" {
        p.addError("filter block requires 'in' and 'as' fields", start)
    }

    return &ast.FilterBlockExpr{
        baseNode: ast.baseNode{Span: p.spanFrom(start)},
        List:     list,
        Binding:  binding,
        Body:     body,
    }
}
```

### 2.11 Error Recovery Strategy

The reference implementation uses `recoveryEnabled: false` in Chevrotain, meaning it does not attempt error recovery. The Go parser follows the same approach:

1. **Fail fast:** On the first parse error, record it and attempt to continue parsing only at statement boundaries
2. **Synchronization points:** After an error, skip tokens until a statement-starting token is found (`let`, `return`, `fn`, `call?`, `do`, `assert`, `check`, `if`, `for`, `match`, `try`, `filter`, `loop`, or `}`)
3. **Multiple diagnostics:** Collect all errors and return them together

```go
func (p *Parser) synchronize() {
    for p.peek() != lexer.TokenEOF {
        switch p.peek() {
        case lexer.TokenLet, lexer.TokenReturn, lexer.TokenFn,
            lexer.TokenCallQ, lexer.TokenDo, lexer.TokenAssert,
            lexer.TokenCheck, lexer.TokenIf, lexer.TokenFor,
            lexer.TokenMatch, lexer.TokenTry, lexer.TokenFilter,
            lexer.TokenLoop, lexer.TokenRBrace:
            return
        }
        p.advance()
    }
}
```

---

## 3. Error Messages

Error messages should match the reference implementation's normalized format:

- `E_LEX`: `"Check for invalid characters or unclosed strings."`
- `E_PARSE`: `"Expected <TokenType> but found '<literal>'."` or `"Unexpected token '<literal>'."`
- `E_AST`: CST-to-AST conversion errors (e.g., missing required record fields in `if`, `for`, `loop`)

The `normalizeParseMessage` function from `parser.ts:1159-1173` should be replicated for consistency with test expectations.

---

## 4. File Organization

```
a0-go/
  lexer/
    token.go       -- TokenType constants, Token struct
    lexer.go       -- Lexer struct, NextToken(), Tokenize()
    lexer_test.go  -- Comprehensive token-level tests
  ast/
    ast.go         -- All AST node types, Span, interfaces
  parser/
    parser.go      -- Parser struct, Parse(), helper methods
    expr.go        -- Expression parsing (precedence climbing)
    stmt.go        -- Statement parsing
    header.go      -- Header parsing
    record.go      -- Record/list/literal parsing
    parser_test.go -- AST-level parse tests
  diagnostic/
    diagnostic.go  -- Diagnostic struct, formatting
```

---

## 5. Conformance Testing Strategy

The Go lexer and parser must produce identical results to the TypeScript reference. The testing approach:

1. **Golden token tests:** Run the TypeScript lexer on sample inputs, serialize the token stream to JSON, and verify the Go lexer produces the same token types and positions
2. **Golden AST tests:** Parse sample programs with both implementations, serialize ASTs to JSON, and compare
3. **Error diagnostic tests:** Verify that malformed inputs produce the same diagnostic codes and similar messages
4. **Roundtrip tests:** Parse, format (via a Go formatter), re-parse, and verify the ASTs are structurally identical

Key edge cases to test:
- `call?` vs `call` as identifier
- `...` (spread) vs `.` (dot) vs `..` (error)
- `>=` vs `>` followed by `=`
- `->` vs `-` followed by `>`
- Keywords used as record keys (e.g., `{ as: "x", for: 1 }`)
- FloatLit vs IntLit disambiguation (`1.0` vs `1`)
- IntLit negative lookahead (`1e5` should lex as `FloatLit`, not `IntLit` + `Ident("e5")`)
- Nested string escapes (`"hello \"world\""`)
- Unicode escapes (`"\u0041"`)
- Comments (`# this is a comment`)
- Trailing commas in records and lists

---

## 6. Comparison: Hand-Written vs Generated Parser

| Criterion | Hand-Written (Recommended) | ANTLR4 Go Target | participle | pigeon (PEG) |
|---|---|---|---|---|
| WASM size | ~50KB | ~800KB+ | ~200KB | ~150KB |
| Build dependency | None | ANTLR4 tool + runtime | reflect-heavy | Code generator |
| Error messages | Full control | Template-based | Limited | Limited |
| Span tracking | Native | Via listener | Via struct tags | Via actions |
| Performance | Optimal | Good | Moderate | Good |
| CST vs AST | Direct AST | CST (needs visitor) | Direct AST | Direct AST |
| Maintenance | Manual updates | Grammar-driven | Grammar-driven | Grammar-driven |
| Learning curve | Moderate | Low (for grammar) | Low | Moderate |

**Decision: Hand-written.** The A0 grammar is small enough (~30 rules) that a hand-written parser is straightforward to maintain. The benefits in WASM binary size, error message quality, and zero dependencies outweigh the modest maintenance cost. The grammar is also stable enough that the cost of manual updates is low.

---

## 7. Implementation Notes

### 7.1 String Value Decoding

The lexer stores the raw literal (including quotes). The parser (or a shared utility) must decode the string value by:
- Removing surrounding quotes
- Processing escape sequences (`\n` -> newline, `\t` -> tab, etc.)
- Processing unicode escapes (`\u0041` -> `A`)

This mirrors the TypeScript `JSON.parse(t.image)` call used in `visitLiteral`.

```go
// DecodeStringLiteral converts a raw string token (e.g., `"hello\nworld"`)
// into its unescaped Go string value.
func DecodeStringLiteral(raw string) (string, error) {
    // Leverage Go's json.Unmarshal for JSON-compatible string decoding
    var s string
    if err := json.Unmarshal([]byte(raw), &s); err != nil {
        return "", fmt.Errorf("invalid string literal: %w", err)
    }
    return s, nil
}
```

### 7.2 Number Parsing

```go
// ParseInt converts a raw integer literal to int64.
func ParseInt(raw string) (int64, error) {
    return strconv.ParseInt(raw, 10, 64)
}

// ParseFloat converts a raw float literal to float64.
func ParseFloat(raw string) (float64, error) {
    return strconv.ParseFloat(raw, 64)
}
```

### 7.3 WASM Considerations

The lexer and parser are pure computation with no I/O, goroutines, or OS dependencies. They compile cleanly to WASM with no special considerations. The `string` type in Go maps efficiently to WASM linear memory, and all operations are single-threaded.
