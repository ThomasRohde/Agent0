// Package lexer implements the A0 language tokenizer.
package lexer

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
)

// TokenType identifies the type of a lexer token.
type TokenType int

const (
	// Keywords
	TokCap TokenType = iota
	TokBudget
	TokImport
	TokAs
	TokLet
	TokReturn
	TokCallQ // call?
	TokDo
	TokAssert
	TokCheck
	TokTrue
	TokFalse
	TokNull
	TokIf
	TokElse
	TokFor
	TokFn
	TokMatch
	TokTry
	TokCatch
	TokFilter
	TokLoop

	// Literals
	TokIntLit
	TokFloatLit
	TokStringLit

	// Identifiers
	TokIdent

	// Punctuation
	TokLBrace    // {
	TokRBrace    // }
	TokLBracket  // [
	TokRBracket  // ]
	TokLParen    // (
	TokRParen    // )
	TokColon     // :
	TokComma     // ,
	TokDotDotDot // ...
	TokDot       // .
	TokArrow     // ->
	TokEquals    // =

	// Comparison operators
	TokGtEq   // >=
	TokLtEq   // <=
	TokEqEq   // ==
	TokBangEq // !=
	TokGt     // >
	TokLt     // <

	// Arithmetic operators
	TokPlus    // +
	TokMinus   // -
	TokStar    // *
	TokSlash   // /
	TokPercent // %

	// Special
	TokEOF
)

// Token represents a single lexer token.
type Token struct {
	Type  TokenType
	Value string
	Span  ast.Span
}

var keywords = map[string]TokenType{
	"cap":    TokCap,
	"budget": TokBudget,
	"import": TokImport,
	"as":     TokAs,
	"let":    TokLet,
	"return": TokReturn,
	"do":     TokDo,
	"assert": TokAssert,
	"check":  TokCheck,
	"true":   TokTrue,
	"false":  TokFalse,
	"null":   TokNull,
	"if":     TokIf,
	"else":   TokElse,
	"for":    TokFor,
	"fn":     TokFn,
	"match":  TokMatch,
	"try":    TokTry,
	"catch":  TokCatch,
	"filter": TokFilter,
	"loop":   TokLoop,
}

type scanner struct {
	source   string
	filename string
	pos      int
	line     int
	col      int
}

func newScanner(source, filename string) *scanner {
	return &scanner{
		source:   source,
		filename: filename,
		pos:      0,
		line:     1,
		col:      1,
	}
}

func (s *scanner) atEnd() bool {
	return s.pos >= len(s.source)
}

func (s *scanner) peek() byte {
	if s.atEnd() {
		return 0
	}
	return s.source[s.pos]
}

func (s *scanner) peekAt(offset int) byte {
	p := s.pos + offset
	if p >= len(s.source) {
		return 0
	}
	return s.source[p]
}

func (s *scanner) advance() byte {
	ch := s.source[s.pos]
	s.pos++
	if ch == '\n' {
		s.line++
		s.col = 1
	} else {
		s.col++
	}
	return ch
}

func (s *scanner) span(startLine, startCol int) ast.Span {
	return ast.Span{
		File:      s.filename,
		StartLine: startLine,
		StartCol:  startCol,
		EndLine:   s.line,
		EndCol:    s.col,
	}
}

func (s *scanner) skipWhitespaceAndComments() {
	for !s.atEnd() {
		ch := s.peek()
		if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
			s.advance()
		} else if ch == '#' {
			// Skip comment to end of line
			for !s.atEnd() && s.peek() != '\n' {
				s.advance()
			}
		} else {
			break
		}
	}
}

func isAlpha(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_'
}

func isDigit(ch byte) bool {
	return ch >= '0' && ch <= '9'
}

func isAlphaNumeric(ch byte) bool {
	return isAlpha(ch) || isDigit(ch)
}

func (s *scanner) scanString() (Token, error) {
	startLine, startCol := s.line, s.col
	s.advance() // consume opening "

	var buf strings.Builder
	for !s.atEnd() {
		ch := s.peek()
		if ch == '"' {
			s.advance() // consume closing "
			return Token{
				Type:  TokStringLit,
				Value: buf.String(),
				Span:  s.span(startLine, startCol),
			}, nil
		}
		if ch == '\\' {
			s.advance() // consume backslash
			if s.atEnd() {
				return Token{}, s.lexError(startLine, startCol, "unterminated string escape")
			}
			esc := s.advance()
			switch esc {
			case '"':
				buf.WriteByte('"')
			case '\\':
				buf.WriteByte('\\')
			case 'n':
				buf.WriteByte('\n')
			case 'r':
				buf.WriteByte('\r')
			case 't':
				buf.WriteByte('\t')
			case '/':
				buf.WriteByte('/')
			case 'u':
				// \uXXXX
				if s.pos+4 > len(s.source) {
					return Token{}, s.lexError(startLine, startCol, "incomplete unicode escape")
				}
				hexStr := s.source[s.pos : s.pos+4]
				codepoint, err := strconv.ParseUint(hexStr, 16, 32)
				if err != nil {
					return Token{}, s.lexError(startLine, startCol, fmt.Sprintf("invalid unicode escape: \\u%s", hexStr))
				}
				buf.WriteRune(rune(codepoint))
				for i := 0; i < 4; i++ {
					s.advance()
				}
			default:
				return Token{}, s.lexError(startLine, startCol, fmt.Sprintf("invalid escape character: \\%c", esc))
			}
		} else if ch == '\n' {
			return Token{}, s.lexError(startLine, startCol, "unterminated string literal")
		} else {
			// Handle multi-byte UTF-8 characters
			r, size := utf8.DecodeRuneInString(s.source[s.pos:])
			if r == utf8.RuneError && size == 1 {
				return Token{}, s.lexError(startLine, startCol, "invalid UTF-8 character in string")
			}
			buf.WriteRune(r)
			for i := 0; i < size; i++ {
				s.advance()
			}
		}
	}
	return Token{}, s.lexError(startLine, startCol, "unterminated string literal")
}

func (s *scanner) scanNumber() Token {
	startLine, startCol := s.line, s.col
	startPos := s.pos
	isFloat := false

	// Scan integer part
	for !s.atEnd() && isDigit(s.peek()) {
		s.advance()
	}

	// Optional fractional part
	if !s.atEnd() && s.peek() == '.' && s.peekAt(1) != '.' {
		// Check it's not `..` (part of `...`)
		if s.pos+1 < len(s.source) && isDigit(s.peekAt(1)) {
			isFloat = true
			s.advance() // consume '.'
			for !s.atEnd() && isDigit(s.peek()) {
				s.advance()
			}
		}
	}

	// Optional exponent
	if !s.atEnd() && (s.peek() == 'e' || s.peek() == 'E') {
		isFloat = true
		s.advance() // consume e/E
		if !s.atEnd() && (s.peek() == '+' || s.peek() == '-') {
			s.advance()
		}
		for !s.atEnd() && isDigit(s.peek()) {
			s.advance()
		}
	}

	text := s.source[startPos:s.pos]
	tokType := TokIntLit
	if isFloat {
		tokType = TokFloatLit
	}

	return Token{
		Type:  tokType,
		Value: text,
		Span:  s.span(startLine, startCol),
	}
}

func (s *scanner) scanIdentOrKeyword() Token {
	startLine, startCol := s.line, s.col
	startPos := s.pos

	for !s.atEnd() && isAlphaNumeric(s.peek()) {
		s.advance()
	}

	text := s.source[startPos:s.pos]

	// Special case: "call" followed by "?" → TokCallQ
	if text == "call" && !s.atEnd() && s.peek() == '?' {
		s.advance() // consume '?'
		return Token{
			Type:  TokCallQ,
			Value: "call?",
			Span:  s.span(startLine, startCol),
		}
	}

	if tokType, ok := keywords[text]; ok {
		return Token{
			Type:  tokType,
			Value: text,
			Span:  s.span(startLine, startCol),
		}
	}

	return Token{
		Type:  TokIdent,
		Value: text,
		Span:  s.span(startLine, startCol),
	}
}

func (s *scanner) lexError(line, col int, msg string) error {
	diag := diagnostics.MakeDiag(
		diagnostics.ELex,
		msg,
		&ast.Span{File: s.filename, StartLine: line, StartCol: col, EndLine: line, EndCol: col + 1},
		"",
	)
	return &LexError{Diag: diag}
}

// LexError wraps a diagnostic for lex errors.
type LexError struct {
	Diag diagnostics.Diagnostic
}

func (e *LexError) Error() string {
	return e.Diag.Message
}

func (s *scanner) nextToken() (Token, error) {
	s.skipWhitespaceAndComments()

	if s.atEnd() {
		return Token{
			Type:  TokEOF,
			Value: "",
			Span:  s.span(s.line, s.col),
		}, nil
	}

	ch := s.peek()
	startLine, startCol := s.line, s.col

	// Single-char tokens
	switch ch {
	case '{':
		s.advance()
		return Token{Type: TokLBrace, Value: "{", Span: s.span(startLine, startCol)}, nil
	case '}':
		s.advance()
		return Token{Type: TokRBrace, Value: "}", Span: s.span(startLine, startCol)}, nil
	case '[':
		s.advance()
		return Token{Type: TokLBracket, Value: "[", Span: s.span(startLine, startCol)}, nil
	case ']':
		s.advance()
		return Token{Type: TokRBracket, Value: "]", Span: s.span(startLine, startCol)}, nil
	case '(':
		s.advance()
		return Token{Type: TokLParen, Value: "(", Span: s.span(startLine, startCol)}, nil
	case ')':
		s.advance()
		return Token{Type: TokRParen, Value: ")", Span: s.span(startLine, startCol)}, nil
	case ':':
		s.advance()
		return Token{Type: TokColon, Value: ":", Span: s.span(startLine, startCol)}, nil
	case ',':
		s.advance()
		return Token{Type: TokComma, Value: ",", Span: s.span(startLine, startCol)}, nil
	case '+':
		s.advance()
		return Token{Type: TokPlus, Value: "+", Span: s.span(startLine, startCol)}, nil
	case '*':
		s.advance()
		return Token{Type: TokStar, Value: "*", Span: s.span(startLine, startCol)}, nil
	case '%':
		s.advance()
		return Token{Type: TokPercent, Value: "%", Span: s.span(startLine, startCol)}, nil
	case '/':
		s.advance()
		return Token{Type: TokSlash, Value: "/", Span: s.span(startLine, startCol)}, nil
	}

	// Multi-char tokens
	switch ch {
	case '-':
		s.advance()
		if !s.atEnd() && s.peek() == '>' {
			s.advance()
			return Token{Type: TokArrow, Value: "->", Span: s.span(startLine, startCol)}, nil
		}
		return Token{Type: TokMinus, Value: "-", Span: s.span(startLine, startCol)}, nil

	case '.':
		if s.peekAt(1) == '.' && s.peekAt(2) == '.' {
			s.advance()
			s.advance()
			s.advance()
			return Token{Type: TokDotDotDot, Value: "...", Span: s.span(startLine, startCol)}, nil
		}
		s.advance()
		return Token{Type: TokDot, Value: ".", Span: s.span(startLine, startCol)}, nil

	case '=':
		s.advance()
		if !s.atEnd() && s.peek() == '=' {
			s.advance()
			return Token{Type: TokEqEq, Value: "==", Span: s.span(startLine, startCol)}, nil
		}
		return Token{Type: TokEquals, Value: "=", Span: s.span(startLine, startCol)}, nil

	case '!':
		s.advance()
		if !s.atEnd() && s.peek() == '=' {
			s.advance()
			return Token{Type: TokBangEq, Value: "!=", Span: s.span(startLine, startCol)}, nil
		}
		return Token{}, s.lexError(startLine, startCol, "unexpected character '!'")

	case '>':
		s.advance()
		if !s.atEnd() && s.peek() == '=' {
			s.advance()
			return Token{Type: TokGtEq, Value: ">=", Span: s.span(startLine, startCol)}, nil
		}
		return Token{Type: TokGt, Value: ">", Span: s.span(startLine, startCol)}, nil

	case '<':
		s.advance()
		if !s.atEnd() && s.peek() == '=' {
			s.advance()
			return Token{Type: TokLtEq, Value: "<=", Span: s.span(startLine, startCol)}, nil
		}
		return Token{Type: TokLt, Value: "<", Span: s.span(startLine, startCol)}, nil
	}

	// Numbers
	if isDigit(ch) {
		return s.scanNumber(), nil
	}

	// Strings
	if ch == '"' {
		return s.scanString()
	}

	// Identifiers and keywords
	if isAlpha(ch) {
		return s.scanIdentOrKeyword(), nil
	}

	s.advance()
	return Token{}, s.lexError(startLine, startCol, fmt.Sprintf("unexpected character '%c'", ch))
}

// Tokenize breaks source code into a slice of tokens.
func Tokenize(source, filename string) ([]Token, error) {
	s := newScanner(source, filename)
	var tokens []Token

	for {
		tok, err := s.nextToken()
		if err != nil {
			return nil, err
		}
		tokens = append(tokens, tok)
		if tok.Type == TokEOF {
			break
		}
	}

	return tokens, nil
}
