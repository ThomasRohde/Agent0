package lexer

import (
	"strings"
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/ast"
)

// helper to tokenize and fail on error
func mustTokenize(t *testing.T, source string) []Token {
	t.Helper()
	tokens, err := Tokenize(source, "test.a0")
	if err != nil {
		t.Fatalf("unexpected lex error: %v", err)
	}
	return tokens
}

// helper that strips the trailing EOF for easier assertions
func mustTokenizeNoEOF(t *testing.T, source string) []Token {
	t.Helper()
	tokens := mustTokenize(t, source)
	if len(tokens) == 0 {
		t.Fatal("expected at least one token (EOF)")
	}
	if tokens[len(tokens)-1].Type != TokEOF {
		t.Fatal("last token is not EOF")
	}
	return tokens[:len(tokens)-1]
}

// ---------------------------------------------------------------------------
// Test: empty input produces only EOF
// ---------------------------------------------------------------------------
func TestEmptyInput(t *testing.T) {
	tokens := mustTokenize(t, "")
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token (EOF), got %d", len(tokens))
	}
	if tokens[0].Type != TokEOF {
		t.Errorf("expected TokEOF, got %v", tokens[0].Type)
	}
}

// ---------------------------------------------------------------------------
// Test: all keywords
// ---------------------------------------------------------------------------
func TestKeywords(t *testing.T) {
	tests := []struct {
		keyword  string
		expected TokenType
	}{
		{"cap", TokCap},
		{"budget", TokBudget},
		{"import", TokImport},
		{"as", TokAs},
		{"let", TokLet},
		{"return", TokReturn},
		{"do", TokDo},
		{"assert", TokAssert},
		{"check", TokCheck},
		{"true", TokTrue},
		{"false", TokFalse},
		{"null", TokNull},
		{"if", TokIf},
		{"else", TokElse},
		{"for", TokFor},
		{"fn", TokFn},
		{"match", TokMatch},
		{"try", TokTry},
		{"catch", TokCatch},
		{"filter", TokFilter},
		{"loop", TokLoop},
	}

	for _, tt := range tests {
		t.Run(tt.keyword, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.keyword)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != tt.expected {
				t.Errorf("expected token type %d, got %d", tt.expected, tokens[0].Type)
			}
			if tokens[0].Value != tt.keyword {
				t.Errorf("expected value %q, got %q", tt.keyword, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: keyword vs identifier disambiguation
// ---------------------------------------------------------------------------
func TestKeywordVsIdentifier(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected TokenType
	}{
		{"cap keyword", "cap", TokCap},
		{"capital is ident", "capital", TokIdent},
		{"if keyword", "if", TokIf},
		{"iffy is ident", "iffy", TokIdent},
		{"for keyword", "for", TokFor},
		{"format is ident", "format", TokIdent},
		{"fn keyword", "fn", TokFn},
		{"fname is ident", "fname", TokIdent},
		{"do keyword", "do", TokDo},
		{"done is ident", "done", TokIdent},
		{"true keyword", "true", TokTrue},
		{"trueish is ident", "trueish", TokIdent},
		{"false keyword", "false", TokFalse},
		{"falsehood is ident", "falsehood", TokIdent},
		{"null keyword", "null", TokNull},
		{"nullable is ident", "nullable", TokIdent},
		{"match keyword", "match", TokMatch},
		{"matcher is ident", "matcher", TokIdent},
		{"loop keyword", "loop", TokLoop},
		{"loopy is ident", "loopy", TokIdent},
		{"filter keyword", "filter", TokFilter},
		{"filtered is ident", "filtered", TokIdent},
		{"try keyword", "try", TokTry},
		{"trying is ident", "trying", TokIdent},
		{"catch keyword", "catch", TokCatch},
		{"catcher is ident", "catcher", TokIdent},
		{"return keyword", "return", TokReturn},
		{"returns is ident", "returns", TokIdent},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != tt.expected {
				t.Errorf("expected type %d for %q, got %d", tt.expected, tt.input, tokens[0].Type)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: identifiers
// ---------------------------------------------------------------------------
func TestIdentifiers(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"x", "x"},
		{"foo", "foo"},
		{"myVar", "myVar"},
		{"_private", "_private"},
		{"name123", "name123"},
		{"_", "_"},
		{"__init__", "__init__"},
		{"camelCase", "camelCase"},
		{"PascalCase", "PascalCase"},
		{"a1b2c3", "a1b2c3"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokIdent {
				t.Errorf("expected TokIdent, got %d", tokens[0].Type)
			}
			if tokens[0].Value != tt.expected {
				t.Errorf("expected value %q, got %q", tt.expected, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: integer literals
// ---------------------------------------------------------------------------
func TestIntegerLiterals(t *testing.T) {
	tests := []struct {
		input string
		value string
	}{
		{"0", "0"},
		{"1", "1"},
		{"42", "42"},
		{"1234567890", "1234567890"},
		{"007", "007"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokIntLit {
				t.Errorf("expected TokIntLit, got %d", tokens[0].Type)
			}
			if tokens[0].Value != tt.value {
				t.Errorf("expected value %q, got %q", tt.value, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: float literals
// ---------------------------------------------------------------------------
func TestFloatLiterals(t *testing.T) {
	tests := []struct {
		input string
		value string
	}{
		{"3.14", "3.14"},
		{"0.5", "0.5"},
		{"100.0", "100.0"},
		{"1.23456789", "1.23456789"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokFloatLit {
				t.Errorf("expected TokFloatLit, got %d", tokens[0].Type)
			}
			if tokens[0].Value != tt.value {
				t.Errorf("expected value %q, got %q", tt.value, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: scientific notation (always produces TokFloatLit)
// ---------------------------------------------------------------------------
func TestScientificNotation(t *testing.T) {
	tests := []struct {
		input string
		value string
	}{
		{"1e3", "1e3"},
		{"1E3", "1E3"},
		{"1e+3", "1e+3"},
		{"1e-3", "1e-3"},
		{"1.5e2", "1.5e2"},
		{"1.5e-2", "1.5e-2"},
		{"1.5E+10", "1.5E+10"},
		{"42e0", "42e0"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokFloatLit {
				t.Errorf("expected TokFloatLit for scientific notation %q, got %d", tt.input, tokens[0].Type)
			}
			if tokens[0].Value != tt.value {
				t.Errorf("expected value %q, got %q", tt.value, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: number followed by dot-dot-dot should not consume the dots
// ---------------------------------------------------------------------------
func TestNumberBeforeDotDotDot(t *testing.T) {
	// "42..." should produce IntLit(42), DotDotDot
	tokens := mustTokenizeNoEOF(t, "42...")
	if len(tokens) != 2 {
		t.Fatalf("expected 2 tokens, got %d", len(tokens))
	}
	if tokens[0].Type != TokIntLit || tokens[0].Value != "42" {
		t.Errorf("expected IntLit(42), got type=%d value=%q", tokens[0].Type, tokens[0].Value)
	}
	if tokens[1].Type != TokDotDotDot {
		t.Errorf("expected DotDotDot, got type=%d", tokens[1].Type)
	}
}

// ---------------------------------------------------------------------------
// Test: string literals with various content
// ---------------------------------------------------------------------------
func TestStringLiterals(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty string", `""`, ""},
		{"simple", `"hello"`, "hello"},
		{"with spaces", `"hello world"`, "hello world"},
		{"with digits", `"abc123"`, "abc123"},
		{"single char", `"x"`, "x"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokStringLit {
				t.Errorf("expected TokStringLit, got %d", tokens[0].Type)
			}
			if tokens[0].Value != tt.expected {
				t.Errorf("expected value %q, got %q", tt.expected, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: string escape sequences
// ---------------------------------------------------------------------------
func TestStringEscapes(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"escaped quote", `"say \"hi\""`, `say "hi"`},
		{"escaped backslash", `"a\\b"`, `a\b`},
		{"escaped newline", `"line1\nline2"`, "line1\nline2"},
		{"escaped carriage return", `"a\rb"`, "a\rb"},
		{"escaped tab", `"a\tb"`, "a\tb"},
		{"escaped slash", `"a\/b"`, "a/b"},
		{"unicode escape", `"\u0041"`, "A"},
		{"unicode escape lowercase hex", `"\u004f"`, "O"},
		{"unicode null", `"\u0000"`, "\x00"},
		{"unicode heart", `"\u2764"`, "\u2764"},
		{"multiple escapes", `"a\nb\tc"`, "a\nb\tc"},
		{"escape at start", `"\nhello"`, "\nhello"},
		{"escape at end", `"hello\n"`, "hello\n"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokStringLit {
				t.Errorf("expected TokStringLit, got %d", tokens[0].Type)
			}
			if tokens[0].Value != tt.expected {
				t.Errorf("expected value %q, got %q", tt.expected, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: single-character punctuation and operators
// ---------------------------------------------------------------------------
func TestSingleCharTokens(t *testing.T) {
	tests := []struct {
		input    string
		expected TokenType
	}{
		{"{", TokLBrace},
		{"}", TokRBrace},
		{"[", TokLBracket},
		{"]", TokRBracket},
		{"(", TokLParen},
		{")", TokRParen},
		{":", TokColon},
		{",", TokComma},
		{"+", TokPlus},
		{"-", TokMinus},
		{"*", TokStar},
		{"/", TokSlash},
		{"%", TokPercent},
		{"=", TokEquals},
		{">", TokGt},
		{"<", TokLt},
		{".", TokDot},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != tt.expected {
				t.Errorf("expected type %d for %q, got %d", tt.expected, tt.input, tokens[0].Type)
			}
			if tokens[0].Value != tt.input {
				t.Errorf("expected value %q, got %q", tt.input, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: multi-character operators
// ---------------------------------------------------------------------------
func TestMultiCharOperators(t *testing.T) {
	tests := []struct {
		input    string
		expected TokenType
		value    string
	}{
		{"->", TokArrow, "->"},
		{"...", TokDotDotDot, "..."},
		{"==", TokEqEq, "=="},
		{"!=", TokBangEq, "!="},
		{">=", TokGtEq, ">="},
		{"<=", TokLtEq, "<="},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, tt.input)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != tt.expected {
				t.Errorf("expected type %d for %q, got %d", tt.expected, tt.input, tokens[0].Type)
			}
			if tokens[0].Value != tt.value {
				t.Errorf("expected value %q, got %q", tt.value, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: multi-char operators should not be greedily consumed beyond their length
// (e.g., "->" is arrow, not minus then gt)
// ---------------------------------------------------------------------------
func TestMultiCharOperatorDisambiguation(t *testing.T) {
	// "->" should be a single TokArrow, not TokMinus + TokGt
	tokens := mustTokenizeNoEOF(t, "->")
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token for '->', got %d", len(tokens))
	}
	if tokens[0].Type != TokArrow {
		t.Errorf("expected TokArrow, got %d", tokens[0].Type)
	}

	// "- >" should be TokMinus + TokGt
	tokens = mustTokenizeNoEOF(t, "- >")
	if len(tokens) != 2 {
		t.Fatalf("expected 2 tokens for '- >', got %d", len(tokens))
	}
	if tokens[0].Type != TokMinus {
		t.Errorf("expected TokMinus, got %d", tokens[0].Type)
	}
	if tokens[1].Type != TokGt {
		t.Errorf("expected TokGt, got %d", tokens[1].Type)
	}

	// "==" should be TokEqEq not TokEquals + TokEquals
	tokens = mustTokenizeNoEOF(t, "==")
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token for '==', got %d", len(tokens))
	}
	if tokens[0].Type != TokEqEq {
		t.Errorf("expected TokEqEq, got %d", tokens[0].Type)
	}

	// "= =" should be TokEquals + TokEquals
	tokens = mustTokenizeNoEOF(t, "= =")
	if len(tokens) != 2 {
		t.Fatalf("expected 2 tokens for '= =', got %d", len(tokens))
	}
	if tokens[0].Type != TokEquals || tokens[1].Type != TokEquals {
		t.Errorf("expected TokEquals + TokEquals, got %d + %d", tokens[0].Type, tokens[1].Type)
	}
}

// ---------------------------------------------------------------------------
// Test: call? as a single token
// ---------------------------------------------------------------------------
func TestCallQ(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, "call?")
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}
	if tokens[0].Type != TokCallQ {
		t.Errorf("expected TokCallQ, got %d", tokens[0].Type)
	}
	if tokens[0].Value != "call?" {
		t.Errorf("expected value %q, got %q", "call?", tokens[0].Value)
	}
}

// Test: "call" without "?" is an identifier
func TestCallWithoutQuestion(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, "call")
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}
	if tokens[0].Type != TokIdent {
		t.Errorf("expected TokIdent for 'call', got %d", tokens[0].Type)
	}
	if tokens[0].Value != "call" {
		t.Errorf("expected value %q, got %q", "call", tokens[0].Value)
	}
}

// Test: "call" followed by space then "?" should be ident + error
func TestCallSpaceQuestion(t *testing.T) {
	// "call ?" - "call" is ident, "?" is unexpected character
	_, err := Tokenize("call ?", "test.a0")
	if err == nil {
		// If no error, "call" should be ident (not call?)
		tokens := mustTokenizeNoEOF(t, "call")
		if tokens[0].Type != TokIdent {
			t.Errorf("expected TokIdent for standalone 'call', got %d", tokens[0].Type)
		}
	}
	// An error on '?' is also acceptable since '?' alone is invalid
}

// ---------------------------------------------------------------------------
// Test: comments
// ---------------------------------------------------------------------------
func TestComments(t *testing.T) {
	t.Run("comment only", func(t *testing.T) {
		tokens := mustTokenize(t, "# this is a comment")
		if len(tokens) != 1 || tokens[0].Type != TokEOF {
			t.Errorf("expected only EOF for comment-only input, got %d tokens", len(tokens))
		}
	})

	t.Run("comment after token", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "42 # the answer")
		if len(tokens) != 1 {
			t.Fatalf("expected 1 token, got %d", len(tokens))
		}
		if tokens[0].Type != TokIntLit || tokens[0].Value != "42" {
			t.Errorf("expected IntLit(42), got type=%d value=%q", tokens[0].Type, tokens[0].Value)
		}
	})

	t.Run("comment between tokens on separate lines", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let\n# comment\nx")
		if len(tokens) != 2 {
			t.Fatalf("expected 2 tokens, got %d", len(tokens))
		}
		if tokens[0].Type != TokLet {
			t.Errorf("expected TokLet, got %d", tokens[0].Type)
		}
		if tokens[1].Type != TokIdent || tokens[1].Value != "x" {
			t.Errorf("expected Ident(x), got type=%d value=%q", tokens[1].Type, tokens[1].Value)
		}
	})

	t.Run("multiple comment lines", func(t *testing.T) {
		input := "# first comment\n# second comment\n42"
		tokens := mustTokenizeNoEOF(t, input)
		if len(tokens) != 1 {
			t.Fatalf("expected 1 token, got %d", len(tokens))
		}
		if tokens[0].Type != TokIntLit {
			t.Errorf("expected TokIntLit, got %d", tokens[0].Type)
		}
	})

	t.Run("hash inside string is not comment", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, `"hello # world"`)
		if len(tokens) != 1 {
			t.Fatalf("expected 1 token, got %d", len(tokens))
		}
		if tokens[0].Type != TokStringLit {
			t.Errorf("expected TokStringLit, got %d", tokens[0].Type)
		}
		if tokens[0].Value != "hello # world" {
			t.Errorf("expected %q, got %q", "hello # world", tokens[0].Value)
		}
	})
}

// ---------------------------------------------------------------------------
// Test: whitespace handling
// ---------------------------------------------------------------------------
func TestWhitespace(t *testing.T) {
	t.Run("spaces between tokens", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let   x   =   42")
		if len(tokens) != 4 {
			t.Fatalf("expected 4 tokens, got %d", len(tokens))
		}
		expected := []TokenType{TokLet, TokIdent, TokEquals, TokIntLit}
		for i, e := range expected {
			if tokens[i].Type != e {
				t.Errorf("token %d: expected type %d, got %d", i, e, tokens[i].Type)
			}
		}
	})

	t.Run("tabs between tokens", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let\tx\t=\t42")
		if len(tokens) != 4 {
			t.Fatalf("expected 4 tokens, got %d", len(tokens))
		}
	})

	t.Run("newlines between tokens", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let\nx\n=\n42")
		if len(tokens) != 4 {
			t.Fatalf("expected 4 tokens, got %d", len(tokens))
		}
	})

	t.Run("carriage return and newline", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let\r\nx\r\n=\r\n42")
		if len(tokens) != 4 {
			t.Fatalf("expected 4 tokens, got %d", len(tokens))
		}
	})

	t.Run("mixed whitespace", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, " \t\n\r\n let \t x ")
		if len(tokens) != 2 {
			t.Fatalf("expected 2 tokens, got %d", len(tokens))
		}
		if tokens[0].Type != TokLet || tokens[1].Type != TokIdent {
			t.Errorf("expected let+ident, got %d+%d", tokens[0].Type, tokens[1].Type)
		}
	})

	t.Run("whitespace only", func(t *testing.T) {
		tokens := mustTokenize(t, "   \t\n  \r\n  ")
		if len(tokens) != 1 || tokens[0].Type != TokEOF {
			t.Errorf("expected only EOF for whitespace input")
		}
	})
}

// ---------------------------------------------------------------------------
// Test: span/position tracking
// ---------------------------------------------------------------------------
func TestSpanTracking(t *testing.T) {
	t.Run("first token on line 1 col 1", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let")
		if tokens[0].Span.StartLine != 1 || tokens[0].Span.StartCol != 1 {
			t.Errorf("expected start (1,1), got (%d,%d)",
				tokens[0].Span.StartLine, tokens[0].Span.StartCol)
		}
	})

	t.Run("second token on same line", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let x")
		// "let" is at col 1-4, then space, then "x" at col 5
		if tokens[1].Span.StartLine != 1 || tokens[1].Span.StartCol != 5 {
			t.Errorf("expected x at (1,5), got (%d,%d)",
				tokens[1].Span.StartLine, tokens[1].Span.StartCol)
		}
	})

	t.Run("token on second line", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let\nx")
		if tokens[1].Span.StartLine != 2 || tokens[1].Span.StartCol != 1 {
			t.Errorf("expected x at (2,1), got (%d,%d)",
				tokens[1].Span.StartLine, tokens[1].Span.StartCol)
		}
	})

	t.Run("multiple lines position tracking", func(t *testing.T) {
		input := "let x = 42\nreturn x"
		tokens := mustTokenizeNoEOF(t, input)
		// tokens: let(1,1) x(1,5) =(1,7) 42(1,9) return(2,1) x(2,8)
		expectations := []struct {
			tokType   TokenType
			value     string
			startLine int
			startCol  int
		}{
			{TokLet, "let", 1, 1},
			{TokIdent, "x", 1, 5},
			{TokEquals, "=", 1, 7},
			{TokIntLit, "42", 1, 9},
			{TokReturn, "return", 2, 1},
			{TokIdent, "x", 2, 8},
		}

		if len(tokens) != len(expectations) {
			t.Fatalf("expected %d tokens, got %d", len(expectations), len(tokens))
		}

		for i, exp := range expectations {
			tok := tokens[i]
			if tok.Type != exp.tokType {
				t.Errorf("token %d: expected type %d, got %d", i, exp.tokType, tok.Type)
			}
			if tok.Value != exp.value {
				t.Errorf("token %d: expected value %q, got %q", i, exp.value, tok.Value)
			}
			if tok.Span.StartLine != exp.startLine || tok.Span.StartCol != exp.startCol {
				t.Errorf("token %d (%q): expected start (%d,%d), got (%d,%d)",
					i, exp.value, exp.startLine, exp.startCol, tok.Span.StartLine, tok.Span.StartCol)
			}
		}
	})

	t.Run("filename propagated to span", func(t *testing.T) {
		tokens, err := Tokenize("42", "myfile.a0")
		if err != nil {
			t.Fatal(err)
		}
		if tokens[0].Span.File != "myfile.a0" {
			t.Errorf("expected file %q, got %q", "myfile.a0", tokens[0].Span.File)
		}
	})

	t.Run("end position tracking for multi-char tokens", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "return")
		// "return" is 6 chars, starts at col 1, end col should be 7 (one past)
		tok := tokens[0]
		if tok.Span.StartLine != 1 || tok.Span.StartCol != 1 {
			t.Errorf("expected start (1,1), got (%d,%d)", tok.Span.StartLine, tok.Span.StartCol)
		}
		if tok.Span.EndLine != 1 || tok.Span.EndCol != 7 {
			t.Errorf("expected end (1,7), got (%d,%d)", tok.Span.EndLine, tok.Span.EndCol)
		}
	})

	t.Run("CRLF line counting", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "a\r\nb\r\nc")
		// a at (1,1), b at (2,1), c at (3,1)
		if tokens[0].Span.StartLine != 1 {
			t.Errorf("expected a on line 1, got %d", tokens[0].Span.StartLine)
		}
		if tokens[1].Span.StartLine != 2 {
			t.Errorf("expected b on line 2, got %d", tokens[1].Span.StartLine)
		}
		if tokens[2].Span.StartLine != 3 {
			t.Errorf("expected c on line 3, got %d", tokens[2].Span.StartLine)
		}
	})

	t.Run("string literal span covers quotes", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, `"hello"`)
		tok := tokens[0]
		// Starts at col 1 (the opening quote), ends at col 8 (one past closing quote)
		if tok.Span.StartCol != 1 {
			t.Errorf("expected string start col 1, got %d", tok.Span.StartCol)
		}
		if tok.Span.EndCol != 8 {
			t.Errorf("expected string end col 8, got %d", tok.Span.EndCol)
		}
	})
}

// ---------------------------------------------------------------------------
// Test: error cases
// ---------------------------------------------------------------------------
func TestUnterminatedString(t *testing.T) {
	_, err := Tokenize(`"hello`, "test.a0")
	if err == nil {
		t.Fatal("expected error for unterminated string")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if lexErr.Diag.Code != "E_LEX" {
		t.Errorf("expected code E_LEX, got %q", lexErr.Diag.Code)
	}
	if !strings.Contains(lexErr.Diag.Message, "unterminated") {
		t.Errorf("expected 'unterminated' in message, got %q", lexErr.Diag.Message)
	}
}

func TestUnterminatedStringAtNewline(t *testing.T) {
	_, err := Tokenize("\"hello\nworld\"", "test.a0")
	if err == nil {
		t.Fatal("expected error for string containing newline")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if !strings.Contains(lexErr.Diag.Message, "unterminated") {
		t.Errorf("expected 'unterminated' in message, got %q", lexErr.Diag.Message)
	}
}

func TestInvalidCharacter(t *testing.T) {
	tests := []struct {
		name  string
		input string
		char  string
	}{
		{"at sign", "@", "@"},
		{"tilde", "~", "~"},
		{"backtick", "`", "`"},
		{"question mark", "?", "?"},
		{"ampersand", "&", "&"},
		{"pipe", "|", "|"},
		{"caret", "^", "^"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Tokenize(tt.input, "test.a0")
			if err == nil {
				t.Fatal("expected error for invalid character")
			}
			lexErr, ok := err.(*LexError)
			if !ok {
				t.Fatalf("expected *LexError, got %T", err)
			}
			if lexErr.Diag.Code != "E_LEX" {
				t.Errorf("expected code E_LEX, got %q", lexErr.Diag.Code)
			}
		})
	}
}

func TestBangWithoutEquals(t *testing.T) {
	_, err := Tokenize("!", "test.a0")
	if err == nil {
		t.Fatal("expected error for standalone '!'")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if !strings.Contains(lexErr.Diag.Message, "unexpected character '!'") {
		t.Errorf("expected message about '!', got %q", lexErr.Diag.Message)
	}
}

func TestInvalidStringEscape(t *testing.T) {
	_, err := Tokenize(`"hello\x"`, "test.a0")
	if err == nil {
		t.Fatal("expected error for invalid escape")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if !strings.Contains(lexErr.Diag.Message, "invalid escape") {
		t.Errorf("expected 'invalid escape' in message, got %q", lexErr.Diag.Message)
	}
}

func TestIncompleteUnicodeEscape(t *testing.T) {
	_, err := Tokenize(`"\u00"`, "test.a0")
	if err == nil {
		t.Fatal("expected error for incomplete unicode escape")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if !strings.Contains(lexErr.Diag.Message, "unicode") {
		t.Errorf("expected 'unicode' in message, got %q", lexErr.Diag.Message)
	}
}

func TestInvalidUnicodeHex(t *testing.T) {
	_, err := Tokenize(`"\uXYZW"`, "test.a0")
	if err == nil {
		t.Fatal("expected error for invalid unicode hex")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if !strings.Contains(lexErr.Diag.Message, "invalid unicode escape") {
		t.Errorf("expected 'invalid unicode escape' in message, got %q", lexErr.Diag.Message)
	}
}

func TestUnterminatedStringEscapeAtEOF(t *testing.T) {
	// String that ends with a backslash and nothing after
	_, err := Tokenize(`"\`, "test.a0")
	if err == nil {
		t.Fatal("expected error for escape at EOF")
	}
}

func TestErrorSpanPosition(t *testing.T) {
	// Error should include correct position
	_, err := Tokenize("let x\n@", "test.a0")
	if err == nil {
		t.Fatal("expected error")
	}
	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}
	if lexErr.Diag.Span == nil {
		t.Fatal("expected span in diagnostic")
	}
	if lexErr.Diag.Span.StartLine != 2 || lexErr.Diag.Span.StartCol != 1 {
		t.Errorf("expected error at (2,1), got (%d,%d)",
			lexErr.Diag.Span.StartLine, lexErr.Diag.Span.StartCol)
	}
}

// ---------------------------------------------------------------------------
// Test: complete token sequences (realistic A0 code)
// ---------------------------------------------------------------------------
func TestTokenizeLetStatement(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `let x = 42`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokLet, "let"},
		{TokIdent, "x"},
		{TokEquals, "="},
		{TokIntLit, "42"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeReturnRecord(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `return { ok: true, msg: "done" }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokReturn, "return"},
		{TokLBrace, "{"},
		{TokIdent, "ok"},
		{TokColon, ":"},
		{TokTrue, "true"},
		{TokComma, ","},
		{TokIdent, "msg"},
		{TokColon, ":"},
		{TokStringLit, "done"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeCallExpression(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `call? http.get { url: "https://example.com" }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokCallQ, "call?"},
		{TokIdent, "http"},
		{TokDot, "."},
		{TokIdent, "get"},
		{TokLBrace, "{"},
		{TokIdent, "url"},
		{TokColon, ":"},
		{TokStringLit, "https://example.com"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeSpreadSyntax(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `{ ...base, key: "val" }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokLBrace, "{"},
		{TokDotDotDot, "..."},
		{TokIdent, "base"},
		{TokComma, ","},
		{TokIdent, "key"},
		{TokColon, ":"},
		{TokStringLit, "val"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeArithmeticExpression(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `(a + b) * c - d / e % f`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokLParen, "("},
		{TokIdent, "a"},
		{TokPlus, "+"},
		{TokIdent, "b"},
		{TokRParen, ")"},
		{TokStar, "*"},
		{TokIdent, "c"},
		{TokMinus, "-"},
		{TokIdent, "d"},
		{TokSlash, "/"},
		{TokIdent, "e"},
		{TokPercent, "%"},
		{TokIdent, "f"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeComparisonExpression(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `a >= b != c <= d == e > f < g`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokIdent, "a"},
		{TokGtEq, ">="},
		{TokIdent, "b"},
		{TokBangEq, "!="},
		{TokIdent, "c"},
		{TokLtEq, "<="},
		{TokIdent, "d"},
		{TokEqEq, "=="},
		{TokIdent, "e"},
		{TokGt, ">"},
		{TokIdent, "f"},
		{TokLt, "<"},
		{TokIdent, "g"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeListExpression(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `[1, 2, 3]`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokLBracket, "["},
		{TokIntLit, "1"},
		{TokComma, ","},
		{TokIntLit, "2"},
		{TokComma, ","},
		{TokIntLit, "3"},
		{TokRBracket, "]"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeArrowBinding(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `do fs.read { path: "x" } -> result`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokDo, "do"},
		{TokIdent, "fs"},
		{TokDot, "."},
		{TokIdent, "read"},
		{TokLBrace, "{"},
		{TokIdent, "path"},
		{TokColon, ":"},
		{TokStringLit, "x"},
		{TokRBrace, "}"},
		{TokArrow, "->"},
		{TokIdent, "result"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeFnDecl(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, "fn add { a, b }\n{\n  return a + b\n}")
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokFn, "fn"},
		{TokIdent, "add"},
		{TokLBrace, "{"},
		{TokIdent, "a"},
		{TokComma, ","},
		{TokIdent, "b"},
		{TokRBrace, "}"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "a"},
		{TokPlus, "+"},
		{TokIdent, "b"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeCapBudgetHeaders(t *testing.T) {
	input := `cap { fs: "read" }
budget { timeMs: 5000 }`
	tokens := mustTokenizeNoEOF(t, input)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokCap, "cap"},
		{TokLBrace, "{"},
		{TokIdent, "fs"},
		{TokColon, ":"},
		{TokStringLit, "read"},
		{TokRBrace, "}"},
		{TokBudget, "budget"},
		{TokLBrace, "{"},
		{TokIdent, "timeMs"},
		{TokColon, ":"},
		{TokIntLit, "5000"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeImportAs(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `import "utils.a0" as utils`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokImport, "import"},
		{TokStringLit, "utils.a0"},
		{TokAs, "as"},
		{TokIdent, "utils"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeTryCatch(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `try { return null } catch e { return e }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokTry, "try"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokNull, "null"},
		{TokRBrace, "}"},
		{TokCatch, "catch"},
		{TokIdent, "e"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "e"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeIfElse(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `if x > 0 { return true } else { return false }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokIf, "if"},
		{TokIdent, "x"},
		{TokGt, ">"},
		{TokIntLit, "0"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokTrue, "true"},
		{TokRBrace, "}"},
		{TokElse, "else"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokFalse, "false"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeForExpression(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `for items as item { return item }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokFor, "for"},
		{TokIdent, "items"},
		{TokAs, "as"},
		{TokIdent, "item"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "item"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeFilterBlock(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `filter { in: items, as: "x" } { return true }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokFilter, "filter"},
		{TokLBrace, "{"},
		{TokIdent, "in"},
		{TokColon, ":"},
		{TokIdent, "items"},
		{TokComma, ","},
		{TokAs, "as"},
		{TokColon, ":"},
		{TokStringLit, "x"},
		{TokRBrace, "}"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokTrue, "true"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeLoopExpr(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `loop { in: 0, times: 10, as: "x" } { return x + 1 }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokLoop, "loop"},
		{TokLBrace, "{"},
		{TokIdent, "in"},
		{TokColon, ":"},
		{TokIntLit, "0"},
		{TokComma, ","},
		{TokIdent, "times"},
		{TokColon, ":"},
		{TokIntLit, "10"},
		{TokComma, ","},
		{TokAs, "as"},
		{TokColon, ":"},
		{TokStringLit, "x"},
		{TokRBrace, "}"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "x"},
		{TokPlus, "+"},
		{TokIntLit, "1"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeMatchExpr(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `match result { ok v { return v } err e { return e } }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokMatch, "match"},
		{TokIdent, "result"},
		{TokLBrace, "{"},
		{TokIdent, "ok"},
		{TokIdent, "v"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "v"},
		{TokRBrace, "}"},
		{TokIdent, "err"},
		{TokIdent, "e"},
		{TokLBrace, "{"},
		{TokReturn, "return"},
		{TokIdent, "e"},
		{TokRBrace, "}"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestTokenizeAssertCheck(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `assert { cond: x == 1, msg: "fail" }`)
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokAssert, "assert"},
		{TokLBrace, "{"},
		{TokIdent, "cond"},
		{TokColon, ":"},
		{TokIdent, "x"},
		{TokEqEq, "=="},
		{TokIntLit, "1"},
		{TokComma, ","},
		{TokIdent, "msg"},
		{TokColon, ":"},
		{TokStringLit, "fail"},
		{TokRBrace, "}"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

// ---------------------------------------------------------------------------
// Test: EOF token always present and last
// ---------------------------------------------------------------------------
func TestEOFAlwaysLast(t *testing.T) {
	inputs := []string{
		"",
		"42",
		"let x = 1",
		"# comment only",
		"   ",
	}
	for _, input := range inputs {
		tokens := mustTokenize(t, input)
		last := tokens[len(tokens)-1]
		if last.Type != TokEOF {
			t.Errorf("for input %q: expected last token to be EOF, got %d", input, last.Type)
		}
	}
}

// ---------------------------------------------------------------------------
// Test: dotted identifier path tokenization
// ---------------------------------------------------------------------------
func TestDottedIdentifiers(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, "http.get")
	expected := []struct {
		typ TokenType
		val string
	}{
		{TokIdent, "http"},
		{TokDot, "."},
		{TokIdent, "get"},
	}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d", len(expected), len(tokens))
	}
	for i, e := range expected {
		if tokens[i].Type != e.typ || tokens[i].Value != e.val {
			t.Errorf("token %d: expected (%d, %q), got (%d, %q)",
				i, e.typ, e.val, tokens[i].Type, tokens[i].Value)
		}
	}
}

func TestDotVsDotDotDot(t *testing.T) {
	// Single dot
	tokens := mustTokenizeNoEOF(t, ".")
	if len(tokens) != 1 || tokens[0].Type != TokDot {
		t.Errorf("expected TokDot, got %d", tokens[0].Type)
	}

	// Two dots should be two TokDot tokens
	tokens = mustTokenizeNoEOF(t, "..")
	if len(tokens) != 2 || tokens[0].Type != TokDot || tokens[1].Type != TokDot {
		t.Errorf("expected two TokDot for '..', got %d tokens", len(tokens))
	}

	// Three dots should be TokDotDotDot
	tokens = mustTokenizeNoEOF(t, "...")
	if len(tokens) != 1 || tokens[0].Type != TokDotDotDot {
		t.Errorf("expected TokDotDotDot for '...', got %d tokens type=%d", len(tokens), tokens[0].Type)
	}

	// Four dots should be TokDotDotDot + TokDot
	tokens = mustTokenizeNoEOF(t, "....")
	if len(tokens) != 2 {
		t.Fatalf("expected 2 tokens for '....', got %d", len(tokens))
	}
	if tokens[0].Type != TokDotDotDot {
		t.Errorf("expected first token TokDotDotDot, got %d", tokens[0].Type)
	}
	if tokens[1].Type != TokDot {
		t.Errorf("expected second token TokDot, got %d", tokens[1].Type)
	}
}

// ---------------------------------------------------------------------------
// Test: negative number is unary minus + literal
// ---------------------------------------------------------------------------
func TestNegativeNumber(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, "-42")
	if len(tokens) != 2 {
		t.Fatalf("expected 2 tokens, got %d", len(tokens))
	}
	if tokens[0].Type != TokMinus {
		t.Errorf("expected TokMinus, got %d", tokens[0].Type)
	}
	if tokens[1].Type != TokIntLit || tokens[1].Value != "42" {
		t.Errorf("expected IntLit(42), got type=%d value=%q", tokens[1].Type, tokens[1].Value)
	}
}

// ---------------------------------------------------------------------------
// Test: UTF-8 handling in strings
// ---------------------------------------------------------------------------
func TestUTF8InStrings(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `"hello 世界"`)
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}
	if tokens[0].Value != "hello 世界" {
		t.Errorf("expected %q, got %q", "hello 世界", tokens[0].Value)
	}
}

func TestEmojiInStrings(t *testing.T) {
	tokens := mustTokenizeNoEOF(t, `"hello 🌍"`)
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}
	if tokens[0].Value != "hello 🌍" {
		t.Errorf("expected %q, got %q", "hello 🌍", tokens[0].Value)
	}
}

// ---------------------------------------------------------------------------
// Test: LexError implements error interface and has proper diagnostic
// ---------------------------------------------------------------------------
func TestLexErrorInterface(t *testing.T) {
	_, err := Tokenize("@", "test.a0")
	if err == nil {
		t.Fatal("expected error")
	}

	lexErr, ok := err.(*LexError)
	if !ok {
		t.Fatalf("expected *LexError, got %T", err)
	}

	// Check Error() method returns the message
	if lexErr.Error() == "" {
		t.Error("expected non-empty error message")
	}

	// Check diagnostic fields
	if lexErr.Diag.Code != "E_LEX" {
		t.Errorf("expected code E_LEX, got %q", lexErr.Diag.Code)
	}
	if lexErr.Diag.Span == nil {
		t.Error("expected span in diagnostic")
	}
	if lexErr.Diag.Span.File != "test.a0" {
		t.Errorf("expected file test.a0, got %q", lexErr.Diag.Span.File)
	}
}

// ---------------------------------------------------------------------------
// Test: span endLine/endCol computation
// ---------------------------------------------------------------------------
func TestSpanEndPositions(t *testing.T) {
	t.Run("single char token", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "+")
		tok := tokens[0]
		// "+" is 1 char at col 1, after advance col becomes 2
		if tok.Span != (ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 2}) {
			t.Errorf("unexpected span for '+': %+v", tok.Span)
		}
	})

	t.Run("two char token", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "->")
		tok := tokens[0]
		if tok.Span != (ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 3}) {
			t.Errorf("unexpected span for '->': %+v", tok.Span)
		}
	})

	t.Run("three char token", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "...")
		tok := tokens[0]
		if tok.Span != (ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 4}) {
			t.Errorf("unexpected span for '...': %+v", tok.Span)
		}
	})

	t.Run("keyword token", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "let")
		tok := tokens[0]
		if tok.Span != (ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 4}) {
			t.Errorf("unexpected span for 'let': %+v", tok.Span)
		}
	})

	t.Run("integer literal", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "12345")
		tok := tokens[0]
		if tok.Span != (ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 6}) {
			t.Errorf("unexpected span for '12345': %+v", tok.Span)
		}
	})
}

// ---------------------------------------------------------------------------
// Test: adjacent tokens without whitespace
// ---------------------------------------------------------------------------
func TestAdjacentTokens(t *testing.T) {
	t.Run("parens around ident", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "(x)")
		if len(tokens) != 3 {
			t.Fatalf("expected 3 tokens, got %d", len(tokens))
		}
		if tokens[0].Type != TokLParen || tokens[1].Type != TokIdent || tokens[2].Type != TokRParen {
			t.Errorf("unexpected types: %d %d %d", tokens[0].Type, tokens[1].Type, tokens[2].Type)
		}
	})

	t.Run("braces around colon", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "{x:1}")
		if len(tokens) != 5 {
			t.Fatalf("expected 5 tokens, got %d", len(tokens))
		}
		expected := []TokenType{TokLBrace, TokIdent, TokColon, TokIntLit, TokRBrace}
		for i, e := range expected {
			if tokens[i].Type != e {
				t.Errorf("token %d: expected type %d, got %d", i, e, tokens[i].Type)
			}
		}
	})

	t.Run("brackets around comma-separated", func(t *testing.T) {
		tokens := mustTokenizeNoEOF(t, "[1,2]")
		if len(tokens) != 5 {
			t.Fatalf("expected 5 tokens, got %d", len(tokens))
		}
		expected := []TokenType{TokLBracket, TokIntLit, TokComma, TokIntLit, TokRBracket}
		for i, e := range expected {
			if tokens[i].Type != e {
				t.Errorf("token %d: expected type %d, got %d", i, e, tokens[i].Type)
			}
		}
	})
}

// ---------------------------------------------------------------------------
// Test: full A0 program tokenization
// ---------------------------------------------------------------------------
func TestFullProgram(t *testing.T) {
	input := `# A simple A0 program
cap { fs: "read" }
budget { timeMs: 5000 }

let path = "/tmp/data.txt"
do fs.read { path: path } -> content
let count = 42 + 3.14

if count > 0 {
  return { ok: true, data: content }
} else {
  return { ok: false }
}
`
	tokens, err := Tokenize(input, "program.a0")
	if err != nil {
		t.Fatalf("unexpected error tokenizing full program: %v", err)
	}

	// Just verify it tokenizes without error and has a reasonable number of tokens
	if len(tokens) < 30 {
		t.Errorf("expected at least 30 tokens for full program, got %d", len(tokens))
	}

	// Last token should be EOF
	if tokens[len(tokens)-1].Type != TokEOF {
		t.Error("expected last token to be EOF")
	}

	// Verify file name in all tokens
	for i, tok := range tokens {
		if tok.Span.File != "program.a0" {
			t.Errorf("token %d: expected file 'program.a0', got %q", i, tok.Span.File)
		}
	}
}

// ---------------------------------------------------------------------------
// Test: tokens that are close in spelling to keywords are identifiers
// ---------------------------------------------------------------------------
func TestNonKeywordIdentifiers(t *testing.T) {
	// These are identifiers in A0 (not keywords): ok, err, in, cond, then
	tests := []string{"ok", "err", "in", "cond", "then", "of", "from", "with", "type", "var"}
	for _, id := range tests {
		t.Run(id, func(t *testing.T) {
			tokens := mustTokenizeNoEOF(t, id)
			if len(tokens) != 1 {
				t.Fatalf("expected 1 token, got %d", len(tokens))
			}
			if tokens[0].Type != TokIdent {
				t.Errorf("expected %q to be TokIdent, got type %d", id, tokens[0].Type)
			}
			if tokens[0].Value != id {
				t.Errorf("expected value %q, got %q", id, tokens[0].Value)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Test: TokenType values are distinct (sanity check)
// ---------------------------------------------------------------------------
func TestTokenTypesAreDistinct(t *testing.T) {
	seen := make(map[TokenType]string)
	types := map[string]TokenType{
		"TokCap":      TokCap,
		"TokBudget":   TokBudget,
		"TokImport":   TokImport,
		"TokAs":       TokAs,
		"TokLet":      TokLet,
		"TokReturn":   TokReturn,
		"TokCallQ":    TokCallQ,
		"TokDo":       TokDo,
		"TokAssert":   TokAssert,
		"TokCheck":    TokCheck,
		"TokTrue":     TokTrue,
		"TokFalse":    TokFalse,
		"TokNull":     TokNull,
		"TokIf":       TokIf,
		"TokElse":     TokElse,
		"TokFor":      TokFor,
		"TokFn":       TokFn,
		"TokMatch":    TokMatch,
		"TokTry":      TokTry,
		"TokCatch":    TokCatch,
		"TokFilter":   TokFilter,
		"TokLoop":     TokLoop,
		"TokIntLit":   TokIntLit,
		"TokFloatLit": TokFloatLit,
		"TokStringLit": TokStringLit,
		"TokIdent":    TokIdent,
		"TokLBrace":   TokLBrace,
		"TokRBrace":   TokRBrace,
		"TokLBracket": TokLBracket,
		"TokRBracket": TokRBracket,
		"TokLParen":   TokLParen,
		"TokRParen":   TokRParen,
		"TokColon":    TokColon,
		"TokComma":    TokComma,
		"TokDotDotDot": TokDotDotDot,
		"TokDot":      TokDot,
		"TokArrow":    TokArrow,
		"TokEquals":   TokEquals,
		"TokGtEq":     TokGtEq,
		"TokLtEq":     TokLtEq,
		"TokEqEq":     TokEqEq,
		"TokBangEq":   TokBangEq,
		"TokGt":       TokGt,
		"TokLt":       TokLt,
		"TokPlus":     TokPlus,
		"TokMinus":    TokMinus,
		"TokStar":     TokStar,
		"TokSlash":    TokSlash,
		"TokPercent":  TokPercent,
		"TokEOF":      TokEOF,
	}

	for name, val := range types {
		if existing, ok := seen[val]; ok {
			t.Errorf("TokenType collision: %s and %s both have value %d", name, existing, val)
		}
		seen[val] = name
	}
}
