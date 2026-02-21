package parser_test

import (
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/parser"
)

// FuzzParse feeds random inputs to the parser to catch panics.
// The parser should never panic — it should return diagnostics for invalid input.
func FuzzParse(f *testing.F) {
	// Seed corpus with valid and edge-case A0 programs
	seeds := []string{
		// Minimal valid program
		`return 42`,
		// With let binding
		`let x = 1
return x`,
		// Record literal
		`return { a: 1, b: "hello" }`,
		// List literal
		`return [1, 2, 3]`,
		// Cap header
		`cap { fs.read: true }
return null`,
		// Budget header
		`budget { timeMs: 1000 }
return null`,
		// If expression
		`let x = if { cond: true, then: 1, else: 2 }
return x`,
		// For loop
		`let r = for { in: [1, 2], as: "x" } { return x }
return r`,
		// Fn definition
		`fn add { a, b } { return a }
let r = add { a: 1, b: 2 }
return r`,
		// Match expression
		`let r = { ok: 42 }
let v = match r { ok { x } { return x } err { e } { return e } }
return v`,
		// Tool calls
		`cap { fs.read: true }
call? fs.read { path: "x" } -> r
return r`,
		// Do statement
		`cap { sh.exec: true }
do sh.exec { cmd: "echo hi" } -> r
return r`,
		// Assert/check
		`assert { that: true, msg: "ok" }
return null`,
		// Try/catch
		`let r = try { let x = 1 return x } catch { e } { return e }
return r`,
		// Filter block
		`let r = filter { in: [1, 2, 3], as: "x" } { return true }
return r`,
		// Loop
		`let r = loop { in: 0, times: 3, as: "x" } { return x }
return r`,
		// Nested records
		`return { a: { b: { c: 1 } } }`,
		// Arithmetic
		`return 1 + 2 * 3`,
		// Comparison
		`return 1 > 2`,
		// String
		`return "hello\nworld"`,
		// Comments
		`# comment
return 42`,
		// Empty program
		``,
		// Just whitespace
		`   `,
		// Unclosed brace
		`return {`,
		// Unclosed bracket
		`return [1, 2`,
		// Unterminated string
		`return "hello`,
		// Multiple statements
		`let a = 1
let b = 2
return a`,
		// Map/reduce
		`fn f { x } { return x }
let r = map { in: [1], fn: "f" }
return r`,
		// Spread
		`let a = { x: 1 }
return { ...a, y: 2 }`,
		// Unary minus
		`return -42`,
		// Property access
		`let r = { a: 1 }
return r.a`,
		// Pipe binding
		`cap { fs.read: true }
call? fs.read { path: "x" } -> data
return data`,
	}

	for _, s := range seeds {
		f.Add(s)
	}

	f.Fuzz(func(t *testing.T, input string) {
		// parser.Parse should never panic, regardless of input.
		// It may return diagnostics or a nil program, but should not crash.
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("parser.Parse panicked on input %q: %v", input, r)
				}
			}()
			parser.Parse(input, "fuzz.a0")
		}()
	})
}
