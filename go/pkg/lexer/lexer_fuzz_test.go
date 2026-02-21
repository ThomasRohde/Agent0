package lexer

import (
	"testing"
)

// FuzzTokenize feeds random inputs to the lexer to catch panics.
// The lexer should never panic — it should return an error for invalid input.
func FuzzTokenize(f *testing.F) {
	// Seed corpus with valid tokens and edge cases
	seeds := []string{
		// Keywords
		`cap budget import as let return`,
		`call? do assert check`,
		`true false null`,
		`if else for fn match try catch filter loop`,
		// Literals
		`42 3.14 -1 0`,
		`"hello" "with\nescape" "quote\""`,
		// Operators
		`+ - * / % > < >= <= == !=`,
		// Delimiters
		`{ } [ ] ( ) : , . -> ...`,
		// Identifiers
		`x foo bar_baz myVar`,
		// Dotted identifiers
		`fs.read http.get str.concat`,
		// Comments
		`# this is a comment`,
		// Mixed
		`let x = 42`,
		`return { a: 1, b: "hello" }`,
		// Edge cases
		``,
		`   `,
		"\t\n\r",
		`"unterminated`,
		`"""`,
		`@#$^&`,
		`\x00`,
		`..`,
		`->`,
		`...`,
		// Numbers
		`0 00 0.0 .5 1e10`,
		// Unicode
		`"unicode: \u0041"`,
		// Long input
		`let aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa = 1`,
	}

	for _, s := range seeds {
		f.Add(s)
	}

	f.Fuzz(func(t *testing.T, input string) {
		// Tokenize should never panic, regardless of input.
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("Tokenize panicked on input %q: %v", input, r)
				}
			}()
			Tokenize(input, "fuzz.a0")
		}()
	})
}
