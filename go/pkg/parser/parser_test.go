package parser_test

import (
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/ast"
	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/parser"
)

// helper: parse source and assert no diagnostics
func mustParse(t *testing.T, source string) *ast.Program {
	t.Helper()
	prog, diags := parser.Parse(source, "test.a0")
	if len(diags) > 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if prog == nil {
		t.Fatal("expected non-nil program")
	}
	return prog
}

// helper: parse source and assert diagnostics are returned (or a panic occurs)
func mustFail(t *testing.T, source string) {
	t.Helper()
	var prog *ast.Program
	var diags []diagnostics.Diagnostic
	panicked := false

	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		prog, diags = parser.Parse(source, "test.a0")
	}()

	if !panicked && len(diags) == 0 && prog != nil {
		t.Fatal("expected parse to fail with diagnostics, but it succeeded")
	}
}

// helper: extract the single statement from a program, assert it is an ExprStmt, return its Expr
func singleExpr(t *testing.T, source string) ast.Expr {
	t.Helper()
	prog := mustParse(t, source)
	if len(prog.Statements) != 1 {
		t.Fatalf("expected 1 statement, got %d", len(prog.Statements))
	}
	es, ok := prog.Statements[0].(*ast.ExprStmt)
	if !ok {
		t.Fatalf("expected ExprStmt, got %T", prog.Statements[0])
	}
	return es.Expr
}

// helper: wrap an expression in a return statement so the source is a valid program body
func wrapReturn(expr string) string {
	return "return " + expr
}

// ---- 1. Literal Expressions ----

func TestIntLiteral(t *testing.T) {
	tests := []struct {
		source string
		want   int64
	}{
		{"return 0", 0},
		{"return 42", 42},
		{"return 1000000", 1000000},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			ret := prog.Statements[0].(*ast.ReturnStmt)
			lit, ok := ret.Value.(*ast.IntLiteral)
			if !ok {
				t.Fatalf("expected IntLiteral, got %T", ret.Value)
			}
			if lit.Value != tt.want {
				t.Errorf("got %d, want %d", lit.Value, tt.want)
			}
		})
	}
}

func TestFloatLiteral(t *testing.T) {
	tests := []struct {
		source string
		want   float64
	}{
		{"return 3.14", 3.14},
		{"return 0.5", 0.5},
		{"return 1.0e2", 100.0},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			ret := prog.Statements[0].(*ast.ReturnStmt)
			lit, ok := ret.Value.(*ast.FloatLiteral)
			if !ok {
				t.Fatalf("expected FloatLiteral, got %T", ret.Value)
			}
			if lit.Value != tt.want {
				t.Errorf("got %f, want %f", lit.Value, tt.want)
			}
		})
	}
}

func TestStringLiteral(t *testing.T) {
	tests := []struct {
		source string
		want   string
	}{
		{`return "hello"`, "hello"},
		{`return ""`, ""},
		{`return "foo bar"`, "foo bar"},
		{`return "line\nnewline"`, "line\nnewline"},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			ret := prog.Statements[0].(*ast.ReturnStmt)
			lit, ok := ret.Value.(*ast.StrLiteral)
			if !ok {
				t.Fatalf("expected StrLiteral, got %T", ret.Value)
			}
			if lit.Value != tt.want {
				t.Errorf("got %q, want %q", lit.Value, tt.want)
			}
		})
	}
}

func TestBoolLiteral(t *testing.T) {
	tests := []struct {
		source string
		want   bool
	}{
		{"return true", true},
		{"return false", false},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			ret := prog.Statements[0].(*ast.ReturnStmt)
			lit, ok := ret.Value.(*ast.BoolLiteral)
			if !ok {
				t.Fatalf("expected BoolLiteral, got %T", ret.Value)
			}
			if lit.Value != tt.want {
				t.Errorf("got %v, want %v", lit.Value, tt.want)
			}
		})
	}
}

func TestNullLiteral(t *testing.T) {
	prog := mustParse(t, "return null")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	_, ok := ret.Value.(*ast.NullLiteral)
	if !ok {
		t.Fatalf("expected NullLiteral, got %T", ret.Value)
	}
}

// ---- 2. Record Expressions ----

func TestRecordEmpty(t *testing.T) {
	prog := mustParse(t, "return {}")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec, ok := ret.Value.(*ast.RecordExpr)
	if !ok {
		t.Fatalf("expected RecordExpr, got %T", ret.Value)
	}
	if len(rec.Pairs) != 0 {
		t.Errorf("expected 0 pairs, got %d", len(rec.Pairs))
	}
}

func TestRecordSinglePair(t *testing.T) {
	prog := mustParse(t, `return { key: "value" }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec, ok := ret.Value.(*ast.RecordExpr)
	if !ok {
		t.Fatalf("expected RecordExpr, got %T", ret.Value)
	}
	if len(rec.Pairs) != 1 {
		t.Fatalf("expected 1 pair, got %d", len(rec.Pairs))
	}
	pair, ok := rec.Pairs[0].(*ast.RecordPair)
	if !ok {
		t.Fatalf("expected RecordPair, got %T", rec.Pairs[0])
	}
	if pair.Key != "key" {
		t.Errorf("expected key 'key', got %q", pair.Key)
	}
	val, ok := pair.Value.(*ast.StrLiteral)
	if !ok {
		t.Fatalf("expected StrLiteral value, got %T", pair.Value)
	}
	if val.Value != "value" {
		t.Errorf("expected value 'value', got %q", val.Value)
	}
}

func TestRecordMultiplePairs(t *testing.T) {
	prog := mustParse(t, `return { a: 1, b: 2, c: 3 }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec, ok := ret.Value.(*ast.RecordExpr)
	if !ok {
		t.Fatalf("expected RecordExpr, got %T", ret.Value)
	}
	if len(rec.Pairs) != 3 {
		t.Fatalf("expected 3 pairs, got %d", len(rec.Pairs))
	}

	expectedKeys := []string{"a", "b", "c"}
	expectedVals := []int64{1, 2, 3}
	for i, entry := range rec.Pairs {
		pair := entry.(*ast.RecordPair)
		if pair.Key != expectedKeys[i] {
			t.Errorf("pair %d: expected key %q, got %q", i, expectedKeys[i], pair.Key)
		}
		intVal := pair.Value.(*ast.IntLiteral)
		if intVal.Value != expectedVals[i] {
			t.Errorf("pair %d: expected value %d, got %d", i, expectedVals[i], intVal.Value)
		}
	}
}

func TestRecordDottedKey(t *testing.T) {
	prog := mustParse(t, `return { fs.write: true }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 1 {
		t.Fatalf("expected 1 pair, got %d", len(rec.Pairs))
	}
	pair := rec.Pairs[0].(*ast.RecordPair)
	if pair.Key != "fs.write" {
		t.Errorf("expected dotted key 'fs.write', got %q", pair.Key)
	}
	boolVal, ok := pair.Value.(*ast.BoolLiteral)
	if !ok {
		t.Fatalf("expected BoolLiteral, got %T", pair.Value)
	}
	if !boolVal.Value {
		t.Error("expected true")
	}
}

func TestRecordNestedDottedKey(t *testing.T) {
	prog := mustParse(t, `return { http.get: true, sh.exec: false }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Fatalf("expected 2 pairs, got %d", len(rec.Pairs))
	}
	pair0 := rec.Pairs[0].(*ast.RecordPair)
	pair1 := rec.Pairs[1].(*ast.RecordPair)
	if pair0.Key != "http.get" {
		t.Errorf("expected 'http.get', got %q", pair0.Key)
	}
	if pair1.Key != "sh.exec" {
		t.Errorf("expected 'sh.exec', got %q", pair1.Key)
	}
}

// ---- 3. Record Spread ----

func TestRecordSpread(t *testing.T) {
	src := `let base = { a: 1 }
return { ...base, b: 2 }`
	prog := mustParse(t, src)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}
	ret := prog.Statements[1].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(rec.Pairs))
	}

	spread, ok := rec.Pairs[0].(*ast.SpreadPair)
	if !ok {
		t.Fatalf("expected SpreadPair, got %T", rec.Pairs[0])
	}
	ident, ok := spread.Expr.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath in spread, got %T", spread.Expr)
	}
	if len(ident.Parts) != 1 || ident.Parts[0] != "base" {
		t.Errorf("expected spread of 'base', got %v", ident.Parts)
	}

	pair, ok := rec.Pairs[1].(*ast.RecordPair)
	if !ok {
		t.Fatalf("expected RecordPair, got %T", rec.Pairs[1])
	}
	if pair.Key != "b" {
		t.Errorf("expected key 'b', got %q", pair.Key)
	}
}

func TestRecordSpreadOnly(t *testing.T) {
	src := `let x = { a: 1 }
return { ...x }`
	prog := mustParse(t, src)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(rec.Pairs))
	}
	_, ok := rec.Pairs[0].(*ast.SpreadPair)
	if !ok {
		t.Fatalf("expected SpreadPair, got %T", rec.Pairs[0])
	}
}

// ---- 4. List Expressions ----

func TestListEmpty(t *testing.T) {
	prog := mustParse(t, "return []")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list, ok := ret.Value.(*ast.ListExpr)
	if !ok {
		t.Fatalf("expected ListExpr, got %T", ret.Value)
	}
	if len(list.Elements) != 0 {
		t.Errorf("expected 0 elements, got %d", len(list.Elements))
	}
}

func TestListWithElements(t *testing.T) {
	prog := mustParse(t, "return [1, 2, 3]")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list, ok := ret.Value.(*ast.ListExpr)
	if !ok {
		t.Fatalf("expected ListExpr, got %T", ret.Value)
	}
	if len(list.Elements) != 3 {
		t.Fatalf("expected 3 elements, got %d", len(list.Elements))
	}
	for i, elem := range list.Elements {
		intLit, ok := elem.(*ast.IntLiteral)
		if !ok {
			t.Fatalf("element %d: expected IntLiteral, got %T", i, elem)
		}
		if intLit.Value != int64(i+1) {
			t.Errorf("element %d: expected %d, got %d", i, i+1, intLit.Value)
		}
	}
}

func TestListMixedTypes(t *testing.T) {
	prog := mustParse(t, `return [1, "two", true, null]`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list := ret.Value.(*ast.ListExpr)
	if len(list.Elements) != 4 {
		t.Fatalf("expected 4 elements, got %d", len(list.Elements))
	}
	if list.Elements[0].Kind() != "IntLiteral" {
		t.Errorf("element 0: expected IntLiteral, got %s", list.Elements[0].Kind())
	}
	if list.Elements[1].Kind() != "StrLiteral" {
		t.Errorf("element 1: expected StrLiteral, got %s", list.Elements[1].Kind())
	}
	if list.Elements[2].Kind() != "BoolLiteral" {
		t.Errorf("element 2: expected BoolLiteral, got %s", list.Elements[2].Kind())
	}
	if list.Elements[3].Kind() != "NullLiteral" {
		t.Errorf("element 3: expected NullLiteral, got %s", list.Elements[3].Kind())
	}
}

func TestListNested(t *testing.T) {
	prog := mustParse(t, "return [[1, 2], [3, 4]]")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list := ret.Value.(*ast.ListExpr)
	if len(list.Elements) != 2 {
		t.Fatalf("expected 2 elements, got %d", len(list.Elements))
	}
	for i, elem := range list.Elements {
		inner, ok := elem.(*ast.ListExpr)
		if !ok {
			t.Fatalf("element %d: expected ListExpr, got %T", i, elem)
		}
		if len(inner.Elements) != 2 {
			t.Errorf("element %d: expected 2 inner elements, got %d", i, len(inner.Elements))
		}
	}
}

// ---- 5. Binary Expressions with Precedence ----

func TestBinaryAddition(t *testing.T) {
	prog := mustParse(t, "return 1 + 2")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin, ok := ret.Value.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr, got %T", ret.Value)
	}
	if bin.Op != ast.OpAdd {
		t.Errorf("expected op +, got %s", bin.Op)
	}
	left := bin.Left.(*ast.IntLiteral)
	right := bin.Right.(*ast.IntLiteral)
	if left.Value != 1 || right.Value != 2 {
		t.Errorf("expected 1 + 2, got %d + %d", left.Value, right.Value)
	}
}

func TestBinaryPrecedenceMulOverAdd(t *testing.T) {
	// 1 + 2 * 3 should be parsed as 1 + (2 * 3)
	prog := mustParse(t, "return 1 + 2 * 3")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin, ok := ret.Value.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr, got %T", ret.Value)
	}
	if bin.Op != ast.OpAdd {
		t.Errorf("top-level op should be +, got %s", bin.Op)
	}

	// Left should be IntLiteral(1)
	left, ok := bin.Left.(*ast.IntLiteral)
	if !ok {
		t.Fatalf("left should be IntLiteral, got %T", bin.Left)
	}
	if left.Value != 1 {
		t.Errorf("left should be 1, got %d", left.Value)
	}

	// Right should be BinaryExpr(2 * 3)
	right, ok := bin.Right.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("right should be BinaryExpr, got %T", bin.Right)
	}
	if right.Op != ast.OpMul {
		t.Errorf("right op should be *, got %s", right.Op)
	}
	rightLeft := right.Left.(*ast.IntLiteral)
	rightRight := right.Right.(*ast.IntLiteral)
	if rightLeft.Value != 2 || rightRight.Value != 3 {
		t.Errorf("expected 2 * 3, got %d * %d", rightLeft.Value, rightRight.Value)
	}
}

func TestBinaryPrecedenceSubAndDiv(t *testing.T) {
	// 10 - 4 / 2 should be parsed as 10 - (4 / 2)
	prog := mustParse(t, "return 10 - 4 / 2")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpSub {
		t.Errorf("top-level op should be -, got %s", bin.Op)
	}
	left := bin.Left.(*ast.IntLiteral)
	if left.Value != 10 {
		t.Errorf("left should be 10, got %d", left.Value)
	}
	right := bin.Right.(*ast.BinaryExpr)
	if right.Op != ast.OpDiv {
		t.Errorf("right op should be /, got %s", right.Op)
	}
}

func TestBinaryModulo(t *testing.T) {
	prog := mustParse(t, "return 10 % 3")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpMod {
		t.Errorf("expected op %%, got %s", bin.Op)
	}
}

func TestBinaryLeftAssociative(t *testing.T) {
	// 1 + 2 + 3 should be parsed as (1 + 2) + 3
	prog := mustParse(t, "return 1 + 2 + 3")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("top-level op should be +, got %s", bin.Op)
	}
	// Right should be 3
	right := bin.Right.(*ast.IntLiteral)
	if right.Value != 3 {
		t.Errorf("right should be 3, got %d", right.Value)
	}
	// Left should be (1 + 2)
	left := bin.Left.(*ast.BinaryExpr)
	if left.Op != ast.OpAdd {
		t.Errorf("left op should be +, got %s", left.Op)
	}
	ll := left.Left.(*ast.IntLiteral)
	lr := left.Right.(*ast.IntLiteral)
	if ll.Value != 1 || lr.Value != 2 {
		t.Errorf("left should be 1 + 2, got %d + %d", ll.Value, lr.Value)
	}
}

// ---- 6. Unary Expressions ----

func TestUnaryNeg(t *testing.T) {
	prog := mustParse(t, "return -42")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	unary, ok := ret.Value.(*ast.UnaryExpr)
	if !ok {
		t.Fatalf("expected UnaryExpr, got %T", ret.Value)
	}
	if unary.Op != ast.OpNeg {
		t.Errorf("expected op -, got %s", unary.Op)
	}
	operand, ok := unary.Operand.(*ast.IntLiteral)
	if !ok {
		t.Fatalf("expected IntLiteral operand, got %T", unary.Operand)
	}
	if operand.Value != 42 {
		t.Errorf("expected 42, got %d", operand.Value)
	}
}

func TestUnaryNegVariable(t *testing.T) {
	prog := mustParse(t, `let x = 5
return -x`)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	unary := ret.Value.(*ast.UnaryExpr)
	if unary.Op != ast.OpNeg {
		t.Errorf("expected op -, got %s", unary.Op)
	}
	ident, ok := unary.Operand.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath, got %T", unary.Operand)
	}
	if len(ident.Parts) != 1 || ident.Parts[0] != "x" {
		t.Errorf("expected 'x', got %v", ident.Parts)
	}
}

func TestDoubleNegation(t *testing.T) {
	prog := mustParse(t, "return --5")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	outer := ret.Value.(*ast.UnaryExpr)
	if outer.Op != ast.OpNeg {
		t.Errorf("expected outer -, got %s", outer.Op)
	}
	inner, ok := outer.Operand.(*ast.UnaryExpr)
	if !ok {
		t.Fatalf("expected inner UnaryExpr, got %T", outer.Operand)
	}
	if inner.Op != ast.OpNeg {
		t.Errorf("expected inner -, got %s", inner.Op)
	}
}

// ---- 7. If Expressions (inline) ----

func TestIfInline(t *testing.T) {
	prog := mustParse(t, `return if { cond: true, then: 1, else: 2 }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	ifExpr, ok := ret.Value.(*ast.IfExpr)
	if !ok {
		t.Fatalf("expected IfExpr, got %T", ret.Value)
	}
	// cond is BoolLiteral(true)
	cond, ok := ifExpr.Cond.(*ast.BoolLiteral)
	if !ok {
		t.Fatalf("expected BoolLiteral for cond, got %T", ifExpr.Cond)
	}
	if !cond.Value {
		t.Error("expected cond to be true")
	}
	// then is IntLiteral(1)
	thenVal := ifExpr.Then.(*ast.IntLiteral)
	if thenVal.Value != 1 {
		t.Errorf("expected then=1, got %d", thenVal.Value)
	}
	// else is IntLiteral(2)
	elseVal := ifExpr.Else.(*ast.IntLiteral)
	if elseVal.Value != 2 {
		t.Errorf("expected else=2, got %d", elseVal.Value)
	}
}

func TestIfInlineWithIdentifiers(t *testing.T) {
	src := `let x = true
return if { cond: x, then: "yes", else: "no" }`
	prog := mustParse(t, src)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	ifExpr := ret.Value.(*ast.IfExpr)

	condIdent := ifExpr.Cond.(*ast.IdentPath)
	if condIdent.Parts[0] != "x" {
		t.Errorf("expected cond to be 'x', got %v", condIdent.Parts)
	}
	thenStr := ifExpr.Then.(*ast.StrLiteral)
	if thenStr.Value != "yes" {
		t.Errorf("expected then='yes', got %q", thenStr.Value)
	}
	elseStr := ifExpr.Else.(*ast.StrLiteral)
	if elseStr.Value != "no" {
		t.Errorf("expected else='no', got %q", elseStr.Value)
	}
}

// ---- 8. If Block Expressions ----

func TestIfBlock(t *testing.T) {
	src := `if (true) {
  return 1
} else {
  return 2
}
return 0`
	prog := mustParse(t, src)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}

	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	ifBlock, ok := exprStmt.Expr.(*ast.IfBlockExpr)
	if !ok {
		t.Fatalf("expected IfBlockExpr, got %T", exprStmt.Expr)
	}

	// Cond
	cond, ok := ifBlock.Cond.(*ast.BoolLiteral)
	if !ok {
		t.Fatalf("expected BoolLiteral cond, got %T", ifBlock.Cond)
	}
	if !cond.Value {
		t.Error("expected cond true")
	}

	// Then body
	if len(ifBlock.ThenBody) != 1 {
		t.Fatalf("expected 1 then statement, got %d", len(ifBlock.ThenBody))
	}
	thenRet := ifBlock.ThenBody[0].(*ast.ReturnStmt)
	thenVal := thenRet.Value.(*ast.IntLiteral)
	if thenVal.Value != 1 {
		t.Errorf("expected then return 1, got %d", thenVal.Value)
	}

	// Else body
	if len(ifBlock.ElseBody) != 1 {
		t.Fatalf("expected 1 else statement, got %d", len(ifBlock.ElseBody))
	}
	elseRet := ifBlock.ElseBody[0].(*ast.ReturnStmt)
	elseVal := elseRet.Value.(*ast.IntLiteral)
	if elseVal.Value != 2 {
		t.Errorf("expected else return 2, got %d", elseVal.Value)
	}
}

func TestIfBlockWithoutElse(t *testing.T) {
	src := `if (true) {
  let x = 1
}
return 0`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	ifBlock := exprStmt.Expr.(*ast.IfBlockExpr)
	if len(ifBlock.ThenBody) != 1 {
		t.Fatalf("expected 1 then statement, got %d", len(ifBlock.ThenBody))
	}
	if len(ifBlock.ElseBody) != 0 {
		t.Errorf("expected 0 else statements, got %d", len(ifBlock.ElseBody))
	}
}

func TestIfBlockWithComparison(t *testing.T) {
	src := `let x = 5
if (x > 3) {
  return 1
} else {
  return 0
}
return 0`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	ifBlock := exprStmt.Expr.(*ast.IfBlockExpr)
	cond := ifBlock.Cond.(*ast.BinaryExpr)
	if cond.Op != ast.OpGt {
		t.Errorf("expected >, got %s", cond.Op)
	}
}

// ---- 9. For Expressions ----

func TestForExpr(t *testing.T) {
	src := `let items = [1, 2, 3]
for { in: items, as: "x" } {
  return x
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	forExpr, ok := exprStmt.Expr.(*ast.ForExpr)
	if !ok {
		t.Fatalf("expected ForExpr, got %T", exprStmt.Expr)
	}

	// List is the identifier 'items'
	listIdent, ok := forExpr.List.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath for list, got %T", forExpr.List)
	}
	if listIdent.Parts[0] != "items" {
		t.Errorf("expected list 'items', got %v", listIdent.Parts)
	}

	// Binding
	if forExpr.Binding != "x" {
		t.Errorf("expected binding 'x', got %q", forExpr.Binding)
	}

	// Body
	if len(forExpr.Body) != 1 {
		t.Fatalf("expected 1 body statement, got %d", len(forExpr.Body))
	}
}

func TestForExprInlineList(t *testing.T) {
	src := `for { in: [1, 2], as: "item" } {
  return item
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	forExpr := exprStmt.Expr.(*ast.ForExpr)
	_, ok := forExpr.List.(*ast.ListExpr)
	if !ok {
		t.Fatalf("expected ListExpr for in:, got %T", forExpr.List)
	}
	if forExpr.Binding != "item" {
		t.Errorf("expected binding 'item', got %q", forExpr.Binding)
	}
}

// ---- 10. Match Expressions ----

func TestMatchExpr(t *testing.T) {
	// Use identifier-style binding (no braces around binding name) to avoid
	// ambiguity: `match result { ok v { ... } ... }` where the subject `result`
	// is not followed by `{` directly (the outer `{` is for the match body).
	// However, `result` followed by `{` is parsed as a FnCallExpr, so we
	// parenthesize the subject to disambiguate.
	src := `let result = { ok: true }
match (result) {
  ok { v } {
    return v
  }
  err { e } {
    return e
  }
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	matchExpr, ok := exprStmt.Expr.(*ast.MatchExpr)
	if !ok {
		t.Fatalf("expected MatchExpr, got %T", exprStmt.Expr)
	}

	// Subject (parenthesized, so inner IdentPath)
	subjectIdent, ok := matchExpr.Subject.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath subject, got %T", matchExpr.Subject)
	}
	if subjectIdent.Parts[0] != "result" {
		t.Errorf("expected subject 'result', got %v", subjectIdent.Parts)
	}

	// Ok arm
	if matchExpr.OkArm == nil {
		t.Fatal("expected ok arm")
	}
	if matchExpr.OkArm.Tag != "ok" {
		t.Errorf("expected ok arm tag 'ok', got %q", matchExpr.OkArm.Tag)
	}
	if matchExpr.OkArm.Binding != "v" {
		t.Errorf("expected ok binding 'v', got %q", matchExpr.OkArm.Binding)
	}
	if len(matchExpr.OkArm.Body) != 1 {
		t.Fatalf("expected 1 ok body statement, got %d", len(matchExpr.OkArm.Body))
	}

	// Err arm
	if matchExpr.ErrArm == nil {
		t.Fatal("expected err arm")
	}
	if matchExpr.ErrArm.Tag != "err" {
		t.Errorf("expected err arm tag 'err', got %q", matchExpr.ErrArm.Tag)
	}
	if matchExpr.ErrArm.Binding != "e" {
		t.Errorf("expected err binding 'e', got %q", matchExpr.ErrArm.Binding)
	}
}

func TestMatchExprOnlyOkArm(t *testing.T) {
	src := `let result = { ok: 42 }
match (result) {
  ok { v } {
    return v
  }
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	matchExpr := exprStmt.Expr.(*ast.MatchExpr)
	if matchExpr.OkArm == nil {
		t.Fatal("expected ok arm")
	}
	if matchExpr.ErrArm != nil {
		t.Error("expected no err arm")
	}
}

// ---- 11. Try/Catch ----

func TestTryCatch(t *testing.T) {
	src := `try {
  return 1
} catch e {
  return 0
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	tryExpr, ok := exprStmt.Expr.(*ast.TryExpr)
	if !ok {
		t.Fatalf("expected TryExpr, got %T", exprStmt.Expr)
	}

	if tryExpr.CatchBinding != "e" {
		t.Errorf("expected catch binding 'e', got %q", tryExpr.CatchBinding)
	}

	if len(tryExpr.TryBody) != 1 {
		t.Fatalf("expected 1 try body stmt, got %d", len(tryExpr.TryBody))
	}
	if len(tryExpr.CatchBody) != 1 {
		t.Fatalf("expected 1 catch body stmt, got %d", len(tryExpr.CatchBody))
	}
}

func TestTryCatchWithStringBinding(t *testing.T) {
	src := `try {
  return 1
} catch "error" {
  return 0
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	tryExpr := exprStmt.Expr.(*ast.TryExpr)
	if tryExpr.CatchBinding != "error" {
		t.Errorf("expected catch binding 'error', got %q", tryExpr.CatchBinding)
	}
}

func TestTryCatchMultipleStatements(t *testing.T) {
	src := `try {
  let a = 1
  return a
} catch e {
  let b = 2
  return b
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	tryExpr := exprStmt.Expr.(*ast.TryExpr)
	if len(tryExpr.TryBody) != 2 {
		t.Errorf("expected 2 try body stmts, got %d", len(tryExpr.TryBody))
	}
	if len(tryExpr.CatchBody) != 2 {
		t.Errorf("expected 2 catch body stmts, got %d", len(tryExpr.CatchBody))
	}
}

// ---- 12. Filter Block ----

func TestFilterBlock(t *testing.T) {
	src := `let items = [1, 2, 3, 4]
filter { in: items, as: "x" } {
  return x > 2
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	filterExpr, ok := exprStmt.Expr.(*ast.FilterBlockExpr)
	if !ok {
		t.Fatalf("expected FilterBlockExpr, got %T", exprStmt.Expr)
	}

	listIdent := filterExpr.List.(*ast.IdentPath)
	if listIdent.Parts[0] != "items" {
		t.Errorf("expected list 'items', got %v", listIdent.Parts)
	}
	if filterExpr.Binding != "x" {
		t.Errorf("expected binding 'x', got %q", filterExpr.Binding)
	}
	if len(filterExpr.Body) != 1 {
		t.Fatalf("expected 1 body stmt, got %d", len(filterExpr.Body))
	}
}

func TestFilterAsStdlibCall(t *testing.T) {
	// filter without a following block should become a FnCallExpr
	src := `let items = [1, 2, 3]
filter { in: items, by: "active" }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	fnCall, ok := exprStmt.Expr.(*ast.FnCallExpr)
	if !ok {
		t.Fatalf("expected FnCallExpr (stdlib filter), got %T", exprStmt.Expr)
	}
	if len(fnCall.Name.Parts) != 1 || fnCall.Name.Parts[0] != "filter" {
		t.Errorf("expected name 'filter', got %v", fnCall.Name.Parts)
	}
}

// ---- 13. Loop ----

func TestLoopExpr(t *testing.T) {
	src := `loop { in: 0, times: 5, as: "x" } {
  return x + 1
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	loopExpr, ok := exprStmt.Expr.(*ast.LoopExpr)
	if !ok {
		t.Fatalf("expected LoopExpr, got %T", exprStmt.Expr)
	}

	initVal := loopExpr.Init.(*ast.IntLiteral)
	if initVal.Value != 0 {
		t.Errorf("expected init 0, got %d", initVal.Value)
	}
	timesVal := loopExpr.Times.(*ast.IntLiteral)
	if timesVal.Value != 5 {
		t.Errorf("expected times 5, got %d", timesVal.Value)
	}
	if loopExpr.Binding != "x" {
		t.Errorf("expected binding 'x', got %q", loopExpr.Binding)
	}
	if len(loopExpr.Body) != 1 {
		t.Fatalf("expected 1 body stmt, got %d", len(loopExpr.Body))
	}
}

func TestLoopExprWithIdentInit(t *testing.T) {
	src := `let start = { count: 0 }
loop { in: start, times: 10, as: "acc" } {
  return acc
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	loopExpr := exprStmt.Expr.(*ast.LoopExpr)
	initIdent := loopExpr.Init.(*ast.IdentPath)
	if initIdent.Parts[0] != "start" {
		t.Errorf("expected init 'start', got %v", initIdent.Parts)
	}
}

// ---- 14. Let Statements ----

func TestLetStatement(t *testing.T) {
	prog := mustParse(t, `let x = 42
return x`)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}
	letStmt, ok := prog.Statements[0].(*ast.LetStmt)
	if !ok {
		t.Fatalf("expected LetStmt, got %T", prog.Statements[0])
	}
	if letStmt.Name != "x" {
		t.Errorf("expected name 'x', got %q", letStmt.Name)
	}
	intVal := letStmt.Value.(*ast.IntLiteral)
	if intVal.Value != 42 {
		t.Errorf("expected value 42, got %d", intVal.Value)
	}
}

func TestLetStatementWithExpr(t *testing.T) {
	prog := mustParse(t, `let result = 1 + 2
return result`)
	letStmt := prog.Statements[0].(*ast.LetStmt)
	bin := letStmt.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("expected +, got %s", bin.Op)
	}
}

func TestLetStatementWithRecord(t *testing.T) {
	prog := mustParse(t, `let r = { a: 1, b: 2 }
return r`)
	letStmt := prog.Statements[0].(*ast.LetStmt)
	rec := letStmt.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Errorf("expected 2 pairs, got %d", len(rec.Pairs))
	}
}

func TestLetStatementWithList(t *testing.T) {
	prog := mustParse(t, `let items = [1, 2, 3]
return items`)
	letStmt := prog.Statements[0].(*ast.LetStmt)
	list := letStmt.Value.(*ast.ListExpr)
	if len(list.Elements) != 3 {
		t.Errorf("expected 3 elements, got %d", len(list.Elements))
	}
}

// ---- 15. Return Statements ----

func TestReturnInt(t *testing.T) {
	prog := mustParse(t, "return 42")
	if len(prog.Statements) != 1 {
		t.Fatalf("expected 1 statement, got %d", len(prog.Statements))
	}
	ret, ok := prog.Statements[0].(*ast.ReturnStmt)
	if !ok {
		t.Fatalf("expected ReturnStmt, got %T", prog.Statements[0])
	}
	intVal := ret.Value.(*ast.IntLiteral)
	if intVal.Value != 42 {
		t.Errorf("expected 42, got %d", intVal.Value)
	}
}

func TestReturnRecord(t *testing.T) {
	prog := mustParse(t, `return { ok: true }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 1 {
		t.Fatalf("expected 1 pair, got %d", len(rec.Pairs))
	}
	pair := rec.Pairs[0].(*ast.RecordPair)
	if pair.Key != "ok" {
		t.Errorf("expected key 'ok', got %q", pair.Key)
	}
}

func TestReturnExpr(t *testing.T) {
	prog := mustParse(t, "return 1 + 2")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("expected +, got %s", bin.Op)
	}
}

func TestReturnString(t *testing.T) {
	prog := mustParse(t, `return "hello"`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	str := ret.Value.(*ast.StrLiteral)
	if str.Value != "hello" {
		t.Errorf("expected 'hello', got %q", str.Value)
	}
}

func TestReturnNull(t *testing.T) {
	prog := mustParse(t, "return null")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	_, ok := ret.Value.(*ast.NullLiteral)
	if !ok {
		t.Fatalf("expected NullLiteral, got %T", ret.Value)
	}
}

// ---- 16. Function Declarations ----

func TestFnDecl(t *testing.T) {
	src := `fn add { a, b } {
  return a + b
}
return 0`
	prog := mustParse(t, src)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}
	fnDecl, ok := prog.Statements[0].(*ast.FnDecl)
	if !ok {
		t.Fatalf("expected FnDecl, got %T", prog.Statements[0])
	}
	if fnDecl.Name != "add" {
		t.Errorf("expected name 'add', got %q", fnDecl.Name)
	}
	if len(fnDecl.Params) != 2 {
		t.Fatalf("expected 2 params, got %d", len(fnDecl.Params))
	}
	if fnDecl.Params[0] != "a" || fnDecl.Params[1] != "b" {
		t.Errorf("expected params [a, b], got %v", fnDecl.Params)
	}
	if len(fnDecl.Body) != 1 {
		t.Fatalf("expected 1 body stmt, got %d", len(fnDecl.Body))
	}
	ret := fnDecl.Body[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("expected +, got %s", bin.Op)
	}
}

func TestFnDeclNoParams(t *testing.T) {
	src := `fn greet {} {
  return "hello"
}
return 0`
	prog := mustParse(t, src)
	fnDecl := prog.Statements[0].(*ast.FnDecl)
	if fnDecl.Name != "greet" {
		t.Errorf("expected name 'greet', got %q", fnDecl.Name)
	}
	if len(fnDecl.Params) != 0 {
		t.Errorf("expected 0 params, got %d", len(fnDecl.Params))
	}
}

func TestFnDeclSingleParam(t *testing.T) {
	src := `fn double { x } {
  return x * 2
}
return 0`
	prog := mustParse(t, src)
	fnDecl := prog.Statements[0].(*ast.FnDecl)
	if len(fnDecl.Params) != 1 {
		t.Fatalf("expected 1 param, got %d", len(fnDecl.Params))
	}
	if fnDecl.Params[0] != "x" {
		t.Errorf("expected param 'x', got %q", fnDecl.Params[0])
	}
}

func TestFnDeclMultipleStatements(t *testing.T) {
	src := `fn compute { a, b } {
  let sum = a + b
  let product = a * b
  return { sum: sum, product: product }
}
return 0`
	prog := mustParse(t, src)
	fnDecl := prog.Statements[0].(*ast.FnDecl)
	if len(fnDecl.Body) != 3 {
		t.Fatalf("expected 3 body statements, got %d", len(fnDecl.Body))
	}
}

// ---- 17. Expression Statements with Binding ----

func TestExprStmtWithArrowBinding(t *testing.T) {
	src := `eq { a: 1, b: 1 } -> result
return result`
	prog := mustParse(t, src)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}
	exprStmt, ok := prog.Statements[0].(*ast.ExprStmt)
	if !ok {
		t.Fatalf("expected ExprStmt, got %T", prog.Statements[0])
	}
	if exprStmt.Target == nil {
		t.Fatal("expected target binding, got nil")
	}
	if len(exprStmt.Target.Parts) != 1 || exprStmt.Target.Parts[0] != "result" {
		t.Errorf("expected target 'result', got %v", exprStmt.Target.Parts)
	}
}

func TestExprStmtWithoutBinding(t *testing.T) {
	src := `eq { a: 1, b: 1 }
return 0`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	if exprStmt.Target != nil {
		t.Errorf("expected no target, got %v", exprStmt.Target)
	}
}

func TestArrowBindingDottedPath(t *testing.T) {
	src := `eq { a: 1, b: 1 } -> res.field
return 0`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	if exprStmt.Target == nil {
		t.Fatal("expected target binding, got nil")
	}
	if len(exprStmt.Target.Parts) != 2 {
		t.Fatalf("expected 2 parts in target, got %d", len(exprStmt.Target.Parts))
	}
	if exprStmt.Target.Parts[0] != "res" || exprStmt.Target.Parts[1] != "field" {
		t.Errorf("expected ['res', 'field'], got %v", exprStmt.Target.Parts)
	}
}

// ---- 18. Call Expressions ----

func TestCallExpr(t *testing.T) {
	src := `cap { fs.read: true }
call? fs.read { path: "/tmp/file" }
return null`
	prog := mustParse(t, src)
	if len(prog.Headers) != 1 {
		t.Fatalf("expected 1 header, got %d", len(prog.Headers))
	}
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	callExpr, ok := exprStmt.Expr.(*ast.CallExpr)
	if !ok {
		t.Fatalf("expected CallExpr, got %T", exprStmt.Expr)
	}
	if len(callExpr.Tool.Parts) != 2 {
		t.Fatalf("expected 2 tool parts, got %d", len(callExpr.Tool.Parts))
	}
	if callExpr.Tool.Parts[0] != "fs" || callExpr.Tool.Parts[1] != "read" {
		t.Errorf("expected tool 'fs.read', got %v", callExpr.Tool.Parts)
	}
	if len(callExpr.Args.Pairs) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(callExpr.Args.Pairs))
	}
	pair := callExpr.Args.Pairs[0].(*ast.RecordPair)
	if pair.Key != "path" {
		t.Errorf("expected arg key 'path', got %q", pair.Key)
	}
}

func TestCallExprWithArrowBinding(t *testing.T) {
	src := `cap { fs.read: true }
call? fs.read { path: "/tmp/file" } -> content
return content`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	_, ok := exprStmt.Expr.(*ast.CallExpr)
	if !ok {
		t.Fatalf("expected CallExpr, got %T", exprStmt.Expr)
	}
	if exprStmt.Target == nil {
		t.Fatal("expected arrow binding")
	}
	if exprStmt.Target.Parts[0] != "content" {
		t.Errorf("expected target 'content', got %v", exprStmt.Target.Parts)
	}
}

// ---- 19. Do Expressions ----

func TestDoExpr(t *testing.T) {
	src := `cap { fs.write: true }
do fs.write { path: "/tmp/out", data: "hello" }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	doExpr, ok := exprStmt.Expr.(*ast.DoExpr)
	if !ok {
		t.Fatalf("expected DoExpr, got %T", exprStmt.Expr)
	}
	if len(doExpr.Tool.Parts) != 2 {
		t.Fatalf("expected 2 tool parts, got %d", len(doExpr.Tool.Parts))
	}
	if doExpr.Tool.Parts[0] != "fs" || doExpr.Tool.Parts[1] != "write" {
		t.Errorf("expected tool 'fs.write', got %v", doExpr.Tool.Parts)
	}
	if len(doExpr.Args.Pairs) != 2 {
		t.Fatalf("expected 2 args, got %d", len(doExpr.Args.Pairs))
	}
}

// ---- 20. Assert/Check ----

func TestAssert(t *testing.T) {
	src := `assert { that: true, msg: "must be true" }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	assertExpr, ok := exprStmt.Expr.(*ast.AssertExpr)
	if !ok {
		t.Fatalf("expected AssertExpr, got %T", exprStmt.Expr)
	}
	if len(assertExpr.Args.Pairs) != 2 {
		t.Fatalf("expected 2 args, got %d", len(assertExpr.Args.Pairs))
	}
	// Verify the 'that' key
	pair0 := assertExpr.Args.Pairs[0].(*ast.RecordPair)
	if pair0.Key != "that" {
		t.Errorf("expected key 'that', got %q", pair0.Key)
	}
	// Verify the 'msg' key
	pair1 := assertExpr.Args.Pairs[1].(*ast.RecordPair)
	if pair1.Key != "msg" {
		t.Errorf("expected key 'msg', got %q", pair1.Key)
	}
}

func TestCheck(t *testing.T) {
	src := `check { that: true, msg: "should be true" }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	checkExpr, ok := exprStmt.Expr.(*ast.CheckExpr)
	if !ok {
		t.Fatalf("expected CheckExpr, got %T", exprStmt.Expr)
	}
	if len(checkExpr.Args.Pairs) != 2 {
		t.Fatalf("expected 2 args, got %d", len(checkExpr.Args.Pairs))
	}
}

func TestAssertWithExpression(t *testing.T) {
	src := `let x = 5
assert { that: x > 0, msg: "x must be positive" }
return x`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	assertExpr := exprStmt.Expr.(*ast.AssertExpr)
	pair0 := assertExpr.Args.Pairs[0].(*ast.RecordPair)
	bin, ok := pair0.Value.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr for 'that', got %T", pair0.Value)
	}
	if bin.Op != ast.OpGt {
		t.Errorf("expected >, got %s", bin.Op)
	}
}

// ---- 21. Function Calls ----

func TestFnCall(t *testing.T) {
	src := `eq { a: 1, b: 2 }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	fnCall, ok := exprStmt.Expr.(*ast.FnCallExpr)
	if !ok {
		t.Fatalf("expected FnCallExpr, got %T", exprStmt.Expr)
	}
	if len(fnCall.Name.Parts) != 1 || fnCall.Name.Parts[0] != "eq" {
		t.Errorf("expected name 'eq', got %v", fnCall.Name.Parts)
	}
	if len(fnCall.Args.Pairs) != 2 {
		t.Fatalf("expected 2 args, got %d", len(fnCall.Args.Pairs))
	}
}

func TestFnCallDottedName(t *testing.T) {
	src := `str.concat { items: ["a", "b"] }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	fnCall := exprStmt.Expr.(*ast.FnCallExpr)
	if len(fnCall.Name.Parts) != 2 {
		t.Fatalf("expected 2 name parts, got %d", len(fnCall.Name.Parts))
	}
	if fnCall.Name.Parts[0] != "str" || fnCall.Name.Parts[1] != "concat" {
		t.Errorf("expected 'str.concat', got %v", fnCall.Name.Parts)
	}
}

func TestFnCallWithArrowBinding(t *testing.T) {
	src := `len { list: [1, 2, 3] } -> count
return count`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	fnCall, ok := exprStmt.Expr.(*ast.FnCallExpr)
	if !ok {
		t.Fatalf("expected FnCallExpr, got %T", exprStmt.Expr)
	}
	if fnCall.Name.Parts[0] != "len" {
		t.Errorf("expected name 'len', got %v", fnCall.Name.Parts)
	}
	if exprStmt.Target == nil {
		t.Fatal("expected arrow binding")
	}
	if exprStmt.Target.Parts[0] != "count" {
		t.Errorf("expected target 'count', got %v", exprStmt.Target.Parts)
	}
}

func TestFnCallEmptyArgs(t *testing.T) {
	src := `myFn {}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	fnCall := exprStmt.Expr.(*ast.FnCallExpr)
	if fnCall.Name.Parts[0] != "myFn" {
		t.Errorf("expected 'myFn', got %v", fnCall.Name.Parts)
	}
	if len(fnCall.Args.Pairs) != 0 {
		t.Errorf("expected 0 args, got %d", len(fnCall.Args.Pairs))
	}
}

// ---- 22. Headers ----

func TestCapDecl(t *testing.T) {
	src := `cap { fs.read: true, fs.write: true }
return null`
	prog := mustParse(t, src)
	if len(prog.Headers) != 1 {
		t.Fatalf("expected 1 header, got %d", len(prog.Headers))
	}
	capDecl, ok := prog.Headers[0].(*ast.CapDecl)
	if !ok {
		t.Fatalf("expected CapDecl, got %T", prog.Headers[0])
	}
	if len(capDecl.Capabilities.Pairs) != 2 {
		t.Fatalf("expected 2 capabilities, got %d", len(capDecl.Capabilities.Pairs))
	}
	pair0 := capDecl.Capabilities.Pairs[0].(*ast.RecordPair)
	if pair0.Key != "fs.read" {
		t.Errorf("expected 'fs.read', got %q", pair0.Key)
	}
	pair1 := capDecl.Capabilities.Pairs[1].(*ast.RecordPair)
	if pair1.Key != "fs.write" {
		t.Errorf("expected 'fs.write', got %q", pair1.Key)
	}
}

func TestBudgetDecl(t *testing.T) {
	src := `budget { timeMs: 5000, maxToolCalls: 10 }
return null`
	prog := mustParse(t, src)
	if len(prog.Headers) != 1 {
		t.Fatalf("expected 1 header, got %d", len(prog.Headers))
	}
	budgetDecl, ok := prog.Headers[0].(*ast.BudgetDecl)
	if !ok {
		t.Fatalf("expected BudgetDecl, got %T", prog.Headers[0])
	}
	if len(budgetDecl.Budget.Pairs) != 2 {
		t.Fatalf("expected 2 budget fields, got %d", len(budgetDecl.Budget.Pairs))
	}
}

func TestMultipleHeaders(t *testing.T) {
	src := `cap { fs.read: true }
budget { timeMs: 1000 }
return null`
	prog := mustParse(t, src)
	if len(prog.Headers) != 2 {
		t.Fatalf("expected 2 headers, got %d", len(prog.Headers))
	}
	_, ok := prog.Headers[0].(*ast.CapDecl)
	if !ok {
		t.Fatalf("expected CapDecl, got %T", prog.Headers[0])
	}
	_, ok = prog.Headers[1].(*ast.BudgetDecl)
	if !ok {
		t.Fatalf("expected BudgetDecl, got %T", prog.Headers[1])
	}
}

func TestImportDecl(t *testing.T) {
	src := `import "utils.a0" as utils
return null`
	prog := mustParse(t, src)
	if len(prog.Headers) != 1 {
		t.Fatalf("expected 1 header, got %d", len(prog.Headers))
	}
	importDecl, ok := prog.Headers[0].(*ast.ImportDecl)
	if !ok {
		t.Fatalf("expected ImportDecl, got %T", prog.Headers[0])
	}
	if importDecl.Path != "utils.a0" {
		t.Errorf("expected path 'utils.a0', got %q", importDecl.Path)
	}
	if importDecl.Alias != "utils" {
		t.Errorf("expected alias 'utils', got %q", importDecl.Alias)
	}
}

// ---- 23. Parenthesized Expressions ----

func TestParenthesizedSimple(t *testing.T) {
	prog := mustParse(t, "return (42)")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	// Parenthesized expressions just return the inner expression
	intLit, ok := ret.Value.(*ast.IntLiteral)
	if !ok {
		t.Fatalf("expected IntLiteral, got %T", ret.Value)
	}
	if intLit.Value != 42 {
		t.Errorf("expected 42, got %d", intLit.Value)
	}
}

func TestParenthesizedOverridesPrecedence(t *testing.T) {
	// (1 + 2) * 3 should be parsed as (1 + 2) * 3, not 1 + (2 * 3)
	prog := mustParse(t, "return (1 + 2) * 3")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin, ok := ret.Value.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr, got %T", ret.Value)
	}
	if bin.Op != ast.OpMul {
		t.Errorf("top-level op should be *, got %s", bin.Op)
	}

	// Left should be BinaryExpr(1 + 2)
	left, ok := bin.Left.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("left should be BinaryExpr, got %T", bin.Left)
	}
	if left.Op != ast.OpAdd {
		t.Errorf("left op should be +, got %s", left.Op)
	}
	ll := left.Left.(*ast.IntLiteral)
	lr := left.Right.(*ast.IntLiteral)
	if ll.Value != 1 || lr.Value != 2 {
		t.Errorf("expected 1 + 2, got %d + %d", ll.Value, lr.Value)
	}

	// Right should be IntLiteral(3)
	right := bin.Right.(*ast.IntLiteral)
	if right.Value != 3 {
		t.Errorf("right should be 3, got %d", right.Value)
	}
}

func TestNestedParentheses(t *testing.T) {
	prog := mustParse(t, "return ((1 + 2))")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin, ok := ret.Value.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr, got %T", ret.Value)
	}
	if bin.Op != ast.OpAdd {
		t.Errorf("expected +, got %s", bin.Op)
	}
}

// ---- 24. Keywords as Record Keys ----

func TestKeywordsAsRecordKeys(t *testing.T) {
	// Keywords like 'in', 'as', 'cond', 'then', 'else' can appear as record keys
	// 'in' and 'as' are not actually keywords in the lexer - they are identifiers (except 'as' which is TokAs)
	// Let's test 'cond', 'then' which are identifiers, and known keywords
	src := `return { in: 1, as: "x" }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Fatalf("expected 2 pairs, got %d", len(rec.Pairs))
	}
	pair0 := rec.Pairs[0].(*ast.RecordPair)
	pair1 := rec.Pairs[1].(*ast.RecordPair)
	// 'in' is parsed as an identifier, so it's a valid record key
	if pair0.Key != "in" {
		t.Errorf("expected key 'in', got %q", pair0.Key)
	}
	// 'as' is a keyword (TokAs), and keywords are valid record keys
	if pair1.Key != "as" {
		t.Errorf("expected key 'as', got %q", pair1.Key)
	}
}

func TestKeywordCapAsRecordKey(t *testing.T) {
	src := `return { cap: true, budget: 100 }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Fatalf("expected 2 pairs, got %d", len(rec.Pairs))
	}
	pair0 := rec.Pairs[0].(*ast.RecordPair)
	if pair0.Key != "cap" {
		t.Errorf("expected key 'cap', got %q", pair0.Key)
	}
	pair1 := rec.Pairs[1].(*ast.RecordPair)
	if pair1.Key != "budget" {
		t.Errorf("expected key 'budget', got %q", pair1.Key)
	}
}

func TestKeywordLetReturnAsRecordKey(t *testing.T) {
	src := `return { let: 1, return: 2, fn: 3 }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 3 {
		t.Fatalf("expected 3 pairs, got %d", len(rec.Pairs))
	}
	keys := []string{"let", "return", "fn"}
	for i, entry := range rec.Pairs {
		pair := entry.(*ast.RecordPair)
		if pair.Key != keys[i] {
			t.Errorf("pair %d: expected key %q, got %q", i, keys[i], pair.Key)
		}
	}
}

func TestKeywordIfElseAsRecordKey(t *testing.T) {
	src := `return { if: true, else: false, for: null }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 3 {
		t.Fatalf("expected 3 pairs, got %d", len(rec.Pairs))
	}
	pair0 := rec.Pairs[0].(*ast.RecordPair)
	if pair0.Key != "if" {
		t.Errorf("expected key 'if', got %q", pair0.Key)
	}
}

// ---- 25. Error Cases ----

func TestErrorMissingReturn(t *testing.T) {
	// An empty program has no statements, which is valid at the parser level.
	// Missing return is a validator concern, not parser.
	prog, diags := parser.Parse("", "test.a0")
	if len(diags) > 0 {
		t.Fatalf("empty source should parse without errors, got %v", diags)
	}
	if len(prog.Statements) != 0 {
		t.Errorf("expected 0 statements, got %d", len(prog.Statements))
	}
}

func TestErrorInvalidSyntaxMissingColon(t *testing.T) {
	// Record with missing colon
	mustFail(t, `return { key "value" }`)
}

func TestErrorUnterminatedString(t *testing.T) {
	mustFail(t, `return "unterminated`)
}

func TestErrorUnexpectedToken(t *testing.T) {
	mustFail(t, `return @`)
}

func TestErrorMissingRBrace(t *testing.T) {
	mustFail(t, `return { a: 1`)
}

func TestErrorMissingRBracket(t *testing.T) {
	mustFail(t, `return [1, 2`)
}

func TestErrorMissingRParen(t *testing.T) {
	mustFail(t, `return (1 + 2`)
}

func TestErrorLetMissingEquals(t *testing.T) {
	mustFail(t, `let x 42
return x`)
}

func TestErrorLetMissingName(t *testing.T) {
	mustFail(t, `let = 42
return 0`)
}

func TestErrorIfMissingFields(t *testing.T) {
	// Inline if without all required fields
	mustFail(t, `return if { cond: true, then: 1 }`)
}

func TestErrorForMissingIn(t *testing.T) {
	mustFail(t, `for { as: "x" } { return x }
return null`)
}

func TestErrorForMissingAs(t *testing.T) {
	mustFail(t, `for { in: [1, 2] } { return x }
return null`)
}

func TestErrorTryCatchMissingCatch(t *testing.T) {
	mustFail(t, `try { return 1 }
return null`)
}

func TestErrorFnMissingName(t *testing.T) {
	mustFail(t, `fn { a } { return a }
return 0`)
}

func TestErrorFilterBlockMissingIn(t *testing.T) {
	mustFail(t, `filter { as: "x" } { return true }
return null`)
}

// ---- 26. Comparison Operators ----

func TestComparisonOperators(t *testing.T) {
	tests := []struct {
		source string
		op     ast.BinaryOp
	}{
		{"return 1 == 1", ast.OpEqEq},
		{"return 1 != 2", ast.OpNeq},
		{"return 3 > 2", ast.OpGt},
		{"return 2 < 3", ast.OpLt},
		{"return 3 >= 3", ast.OpGtEq},
		{"return 2 <= 3", ast.OpLtEq},
	}

	for _, tt := range tests {
		t.Run(tt.source, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			ret := prog.Statements[0].(*ast.ReturnStmt)
			bin, ok := ret.Value.(*ast.BinaryExpr)
			if !ok {
				t.Fatalf("expected BinaryExpr, got %T", ret.Value)
			}
			if bin.Op != tt.op {
				t.Errorf("expected op %s, got %s", tt.op, bin.Op)
			}
		})
	}
}

func TestComparisonLowerPrecedenceThanArithmetic(t *testing.T) {
	// 1 + 2 > 3 should be parsed as (1 + 2) > 3
	prog := mustParse(t, "return 1 + 2 > 3")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpGt {
		t.Errorf("top-level op should be >, got %s", bin.Op)
	}
	left, ok := bin.Left.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("left should be BinaryExpr, got %T", bin.Left)
	}
	if left.Op != ast.OpAdd {
		t.Errorf("left op should be +, got %s", left.Op)
	}
	right := bin.Right.(*ast.IntLiteral)
	if right.Value != 3 {
		t.Errorf("right should be 3, got %d", right.Value)
	}
}

func TestComparisonBothSidesArithmetic(t *testing.T) {
	// 1 + 2 == 2 + 1 should be parsed as (1 + 2) == (2 + 1)
	prog := mustParse(t, "return 1 + 2 == 2 + 1")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpEqEq {
		t.Errorf("top-level op should be ==, got %s", bin.Op)
	}
	left := bin.Left.(*ast.BinaryExpr)
	if left.Op != ast.OpAdd {
		t.Errorf("left op should be +, got %s", left.Op)
	}
	right := bin.Right.(*ast.BinaryExpr)
	if right.Op != ast.OpAdd {
		t.Errorf("right op should be +, got %s", right.Op)
	}
}

// ---- Additional edge-case tests ----

func TestIdentPath(t *testing.T) {
	prog := mustParse(t, `let x = 1
return x`)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	ident, ok := ret.Value.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath, got %T", ret.Value)
	}
	if len(ident.Parts) != 1 || ident.Parts[0] != "x" {
		t.Errorf("expected ['x'], got %v", ident.Parts)
	}
}

func TestIdentPathDotted(t *testing.T) {
	prog := mustParse(t, `let r = { a: 1 }
return r.a`)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	ident, ok := ret.Value.(*ast.IdentPath)
	if !ok {
		t.Fatalf("expected IdentPath, got %T", ret.Value)
	}
	if len(ident.Parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(ident.Parts))
	}
	if ident.Parts[0] != "r" || ident.Parts[1] != "a" {
		t.Errorf("expected ['r', 'a'], got %v", ident.Parts)
	}
}

func TestProgramWithComments(t *testing.T) {
	src := `# This is a comment
let x = 42 # inline comment
# another comment
return x`
	prog := mustParse(t, src)
	if len(prog.Statements) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(prog.Statements))
	}
}

func TestComplexProgram(t *testing.T) {
	src := `cap { fs.read: true }
budget { timeMs: 5000 }

let items = [1, 2, 3, 4, 5]

fn double { x } {
  return x * 2
}

for { in: items, as: "item" } {
  double { x: item } -> doubled
  return doubled
} -> results

return results`
	prog := mustParse(t, src)
	if len(prog.Headers) != 2 {
		t.Fatalf("expected 2 headers, got %d", len(prog.Headers))
	}
	// let, fn, for (ExprStmt), return = 4 statements
	if len(prog.Statements) != 4 {
		t.Fatalf("expected 4 statements, got %d", len(prog.Statements))
	}
}

func TestRecordWithMixedValueTypes(t *testing.T) {
	src := `return { name: "test", count: 42, active: true, data: null, ratio: 3.14 }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 5 {
		t.Fatalf("expected 5 pairs, got %d", len(rec.Pairs))
	}

	expectedKinds := []string{"StrLiteral", "IntLiteral", "BoolLiteral", "NullLiteral", "FloatLiteral"}
	for i, entry := range rec.Pairs {
		pair := entry.(*ast.RecordPair)
		if pair.Value.Kind() != expectedKinds[i] {
			t.Errorf("pair %d: expected %s, got %s", i, expectedKinds[i], pair.Value.Kind())
		}
	}
}

func TestRecordWithNestedRecord(t *testing.T) {
	src := `return { outer: { inner: 1 } }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	pair := rec.Pairs[0].(*ast.RecordPair)
	if pair.Key != "outer" {
		t.Errorf("expected key 'outer', got %q", pair.Key)
	}
	innerRec, ok := pair.Value.(*ast.RecordExpr)
	if !ok {
		t.Fatalf("expected RecordExpr for inner, got %T", pair.Value)
	}
	innerPair := innerRec.Pairs[0].(*ast.RecordPair)
	if innerPair.Key != "inner" {
		t.Errorf("expected key 'inner', got %q", innerPair.Key)
	}
}

func TestRecordWithListValue(t *testing.T) {
	src := `return { items: [1, 2, 3] }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	pair := rec.Pairs[0].(*ast.RecordPair)
	list, ok := pair.Value.(*ast.ListExpr)
	if !ok {
		t.Fatalf("expected ListExpr, got %T", pair.Value)
	}
	if len(list.Elements) != 3 {
		t.Errorf("expected 3 elements, got %d", len(list.Elements))
	}
}

func TestSpanFileField(t *testing.T) {
	prog, diags := parser.Parse("return 42", "myfile.a0")
	if len(diags) > 0 {
		t.Fatalf("unexpected diagnostics: %v", diags)
	}
	if prog.Span.File != "myfile.a0" {
		t.Errorf("expected file 'myfile.a0', got %q", prog.Span.File)
	}
}

func TestMultipleLetStatements(t *testing.T) {
	src := `let a = 1
let b = 2
let c = a + b
return c`
	prog := mustParse(t, src)
	if len(prog.Statements) != 4 {
		t.Fatalf("expected 4 statements, got %d", len(prog.Statements))
	}
	for i := 0; i < 3; i++ {
		_, ok := prog.Statements[i].(*ast.LetStmt)
		if !ok {
			t.Errorf("statement %d: expected LetStmt, got %T", i, prog.Statements[i])
		}
	}
	_, ok := prog.Statements[3].(*ast.ReturnStmt)
	if !ok {
		t.Fatalf("expected ReturnStmt as last statement")
	}
}

func TestBinaryExprWithFloats(t *testing.T) {
	prog := mustParse(t, "return 1.5 + 2.5")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	left := bin.Left.(*ast.FloatLiteral)
	right := bin.Right.(*ast.FloatLiteral)
	if left.Value != 1.5 || right.Value != 2.5 {
		t.Errorf("expected 1.5 + 2.5, got %f + %f", left.Value, right.Value)
	}
}

func TestBinaryExprMixedIntFloat(t *testing.T) {
	prog := mustParse(t, "return 1 + 2.5")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	left := bin.Left.(*ast.IntLiteral)
	right := bin.Right.(*ast.FloatLiteral)
	if left.Value != 1 || right.Value != 2.5 {
		t.Errorf("expected 1 + 2.5, got %d + %f", left.Value, right.Value)
	}
}

func TestComplexArithmeticPrecedence(t *testing.T) {
	// 2 * 3 + 4 * 5 should be (2 * 3) + (4 * 5)
	prog := mustParse(t, "return 2 * 3 + 4 * 5")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("top-level op should be +, got %s", bin.Op)
	}
	left := bin.Left.(*ast.BinaryExpr)
	if left.Op != ast.OpMul {
		t.Errorf("left op should be *, got %s", left.Op)
	}
	right := bin.Right.(*ast.BinaryExpr)
	if right.Op != ast.OpMul {
		t.Errorf("right op should be *, got %s", right.Op)
	}
}

func TestUnaryInBinaryExpr(t *testing.T) {
	// -1 + 2 should be (-1) + 2
	prog := mustParse(t, "return -1 + 2")
	ret := prog.Statements[0].(*ast.ReturnStmt)
	bin := ret.Value.(*ast.BinaryExpr)
	if bin.Op != ast.OpAdd {
		t.Errorf("top-level op should be +, got %s", bin.Op)
	}
	unary, ok := bin.Left.(*ast.UnaryExpr)
	if !ok {
		t.Fatalf("left should be UnaryExpr, got %T", bin.Left)
	}
	if unary.Op != ast.OpNeg {
		t.Errorf("unary op should be -, got %s", unary.Op)
	}
}

func TestRecordSpreadWithOverride(t *testing.T) {
	src := `let base = { a: 1, b: 2 }
return { ...base, b: 3, c: 4 }`
	prog := mustParse(t, src)
	ret := prog.Statements[1].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 3 {
		t.Fatalf("expected 3 entries (1 spread + 2 pairs), got %d", len(rec.Pairs))
	}
	// First entry is spread
	_, ok := rec.Pairs[0].(*ast.SpreadPair)
	if !ok {
		t.Fatalf("expected SpreadPair, got %T", rec.Pairs[0])
	}
	// Second is pair b: 3
	pair1 := rec.Pairs[1].(*ast.RecordPair)
	if pair1.Key != "b" {
		t.Errorf("expected key 'b', got %q", pair1.Key)
	}
	// Third is pair c: 4
	pair2 := rec.Pairs[2].(*ast.RecordPair)
	if pair2.Key != "c" {
		t.Errorf("expected key 'c', got %q", pair2.Key)
	}
}

func TestMatchWithIdentBindings(t *testing.T) {
	// Match arms can use identifier bindings (not brace-wrapped)
	src := `let result = { ok: 42 }
match (result) {
  ok v {
    return v
  }
  err e {
    return e
  }
}
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	matchExpr := exprStmt.Expr.(*ast.MatchExpr)
	if matchExpr.OkArm.Binding != "v" {
		t.Errorf("expected ok binding 'v', got %q", matchExpr.OkArm.Binding)
	}
	if matchExpr.ErrArm.Binding != "e" {
		t.Errorf("expected err binding 'e', got %q", matchExpr.ErrArm.Binding)
	}
}

func TestIfBlockInExprStmt(t *testing.T) {
	// IfBlock as an expression statement with arrow binding
	src := `let x = 5
if (x > 0) {
  return "positive"
} else {
  return "non-positive"
} -> label
return label`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[1].(*ast.ExprStmt)
	_, ok := exprStmt.Expr.(*ast.IfBlockExpr)
	if !ok {
		t.Fatalf("expected IfBlockExpr, got %T", exprStmt.Expr)
	}
	if exprStmt.Target == nil {
		t.Fatal("expected arrow binding")
	}
	if exprStmt.Target.Parts[0] != "label" {
		t.Errorf("expected target 'label', got %v", exprStmt.Target.Parts)
	}
}

func TestForWithArrowBinding(t *testing.T) {
	src := `for { in: [1, 2, 3], as: "x" } {
  return x * 2
} -> doubled
return doubled`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	_, ok := exprStmt.Expr.(*ast.ForExpr)
	if !ok {
		t.Fatalf("expected ForExpr, got %T", exprStmt.Expr)
	}
	if exprStmt.Target == nil {
		t.Fatal("expected arrow binding")
	}
	if exprStmt.Target.Parts[0] != "doubled" {
		t.Errorf("expected target 'doubled', got %v", exprStmt.Target.Parts)
	}
}

func TestTryCatchWithArrowBinding(t *testing.T) {
	src := `try {
  return 1
} catch e {
  return 0
} -> result
return result`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	_, ok := exprStmt.Expr.(*ast.TryExpr)
	if !ok {
		t.Fatalf("expected TryExpr, got %T", exprStmt.Expr)
	}
	if exprStmt.Target == nil {
		t.Fatal("expected arrow binding")
	}
}

func TestDiagnosticCode(t *testing.T) {
	_, diags := parser.Parse(`return @`, "test.a0")
	if len(diags) == 0 {
		t.Fatal("expected diagnostics")
	}
	// The diagnostic should be an E_LEX (lex error for '@')
	if diags[0].Code != "E_LEX" {
		t.Errorf("expected E_LEX code, got %q", diags[0].Code)
	}
}

func TestDiagnosticParseCode(t *testing.T) {
	_, diags := parser.Parse(`return { a }`, "test.a0")
	if len(diags) == 0 {
		t.Fatal("expected diagnostics")
	}
	if diags[0].Code != "E_PARSE" {
		t.Errorf("expected E_PARSE code, got %q", diags[0].Code)
	}
}

func TestEmptyProgram(t *testing.T) {
	prog := mustParse(t, "")
	if len(prog.Headers) != 0 {
		t.Errorf("expected 0 headers, got %d", len(prog.Headers))
	}
	if len(prog.Statements) != 0 {
		t.Errorf("expected 0 statements, got %d", len(prog.Statements))
	}
}

func TestProgramKind(t *testing.T) {
	prog := mustParse(t, "return 0")
	if prog.Kind() != "Program" {
		t.Errorf("expected Kind()='Program', got %q", prog.Kind())
	}
}

func TestAllStatementKinds(t *testing.T) {
	tests := []struct {
		source string
		kind   string
	}{
		{"let x = 1\nreturn x", "LetStmt"},
		{"return 0", "ReturnStmt"},
		{"fn f { x } { return x }\nreturn 0", "FnDecl"},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			if prog.Statements[0].Kind() != tt.kind {
				t.Errorf("expected Kind()=%q, got %q", tt.kind, prog.Statements[0].Kind())
			}
		})
	}
}

func TestAllExprKinds(t *testing.T) {
	tests := []struct {
		source string
		kind   string
	}{
		{"return 42", "IntLiteral"},
		{"return 3.14", "FloatLiteral"},
		{`return "hello"`, "StrLiteral"},
		{"return true", "BoolLiteral"},
		{"return null", "NullLiteral"},
		{"return { a: 1 }", "RecordExpr"},
		{"return [1, 2]", "ListExpr"},
		{"return 1 + 2", "BinaryExpr"},
		{"return -1", "UnaryExpr"},
		{`return if { cond: true, then: 1, else: 0 }`, "IfExpr"},
		{"if (true) { return 1 }\nreturn 0", "IfBlockExpr"},
		{`for { in: [1], as: "x" } { return x }` + "\nreturn 0", "ForExpr"},
		{`try { return 1 } catch e { return 0 }` + "\nreturn 0", "TryExpr"},
		{`filter { in: [1], as: "x" } { return true }` + "\nreturn 0", "FilterBlockExpr"},
		{`loop { in: 0, times: 1, as: "x" } { return x }` + "\nreturn 0", "LoopExpr"},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			var expr ast.Expr
			switch s := prog.Statements[0].(type) {
			case *ast.ReturnStmt:
				expr = s.Value
			case *ast.ExprStmt:
				expr = s.Expr
			default:
				t.Fatalf("unexpected statement type %T", s)
			}
			if expr.Kind() != tt.kind {
				t.Errorf("expected Kind()=%q, got %q", tt.kind, expr.Kind())
			}
		})
	}
}

func TestAllHeaderKinds(t *testing.T) {
	tests := []struct {
		source string
		kind   string
	}{
		{"cap { fs.read: true }\nreturn 0", "CapDecl"},
		{"budget { timeMs: 1000 }\nreturn 0", "BudgetDecl"},
		{`import "a.a0" as a` + "\nreturn 0", "ImportDecl"},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			prog := mustParse(t, tt.source)
			if len(prog.Headers) != 1 {
				t.Fatalf("expected 1 header, got %d", len(prog.Headers))
			}
			if prog.Headers[0].Kind() != tt.kind {
				t.Errorf("expected Kind()=%q, got %q", tt.kind, prog.Headers[0].Kind())
			}
		})
	}
}

func TestIdentPathFromTool(t *testing.T) {
	span := ast.Span{File: "test.a0", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 10}
	ip := parser.IdentPathFromTool("fs.read", span)
	if len(ip.Parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(ip.Parts))
	}
	if ip.Parts[0] != "fs" || ip.Parts[1] != "read" {
		t.Errorf("expected ['fs', 'read'], got %v", ip.Parts)
	}
}

func TestCallExprSimpleTool(t *testing.T) {
	src := `cap { sh.exec: true }
call? sh.exec { cmd: "echo hello" }
return null`
	prog := mustParse(t, src)
	exprStmt := prog.Statements[0].(*ast.ExprStmt)
	callExpr := exprStmt.Expr.(*ast.CallExpr)
	if callExpr.Tool.Parts[0] != "sh" || callExpr.Tool.Parts[1] != "exec" {
		t.Errorf("expected tool 'sh.exec', got %v", callExpr.Tool.Parts)
	}
}

func TestWhitespaceInsensitive(t *testing.T) {
	// Same program with different whitespace should parse the same
	src1 := "return 1+2"
	src2 := "return 1 + 2"
	src3 := "return  1  +  2"

	for _, src := range []string{src1, src2, src3} {
		prog := mustParse(t, src)
		ret := prog.Statements[0].(*ast.ReturnStmt)
		bin, ok := ret.Value.(*ast.BinaryExpr)
		if !ok {
			t.Fatalf("source %q: expected BinaryExpr, got %T", src, ret.Value)
		}
		if bin.Op != ast.OpAdd {
			t.Errorf("source %q: expected +, got %s", src, bin.Op)
		}
	}
}

func TestMultilineProgram(t *testing.T) {
	src := `let a = 1
let b = 2
let c = 3
return a + b + c`
	prog := mustParse(t, src)
	if len(prog.Statements) != 4 {
		t.Fatalf("expected 4 statements, got %d", len(prog.Statements))
	}
}

func TestRecordTrailingComma(t *testing.T) {
	prog := mustParse(t, `return { a: 1, b: 2, }`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Errorf("expected 2 pairs (trailing comma allowed), got %d", len(rec.Pairs))
	}
}

func TestListTrailingComma(t *testing.T) {
	prog := mustParse(t, `return [1, 2, 3,]`)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list := ret.Value.(*ast.ListExpr)
	if len(list.Elements) != 3 {
		t.Errorf("expected 3 elements (trailing comma allowed), got %d", len(list.Elements))
	}
}

func TestListOfRecords(t *testing.T) {
	src := `return [{ a: 1 }, { b: 2 }]`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	list := ret.Value.(*ast.ListExpr)
	if len(list.Elements) != 2 {
		t.Fatalf("expected 2 elements, got %d", len(list.Elements))
	}
	for i, elem := range list.Elements {
		_, ok := elem.(*ast.RecordExpr)
		if !ok {
			t.Errorf("element %d: expected RecordExpr, got %T", i, elem)
		}
	}
}

func TestComplexNestedExpressions(t *testing.T) {
	// Deeply nested: record containing list containing record
	src := `return { data: [{ x: 1 }, { x: 2 }], count: 2 }`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	rec := ret.Value.(*ast.RecordExpr)
	if len(rec.Pairs) != 2 {
		t.Fatalf("expected 2 pairs, got %d", len(rec.Pairs))
	}
	dataPair := rec.Pairs[0].(*ast.RecordPair)
	if dataPair.Key != "data" {
		t.Errorf("expected key 'data', got %q", dataPair.Key)
	}
	list := dataPair.Value.(*ast.ListExpr)
	if len(list.Elements) != 2 {
		t.Fatalf("expected 2 list elements, got %d", len(list.Elements))
	}
}

func TestReturnIfBlockExpr(t *testing.T) {
	// return an if block expression
	src := `return if (true) {
  return 1
} else {
  return 2
}`
	prog := mustParse(t, src)
	ret := prog.Statements[0].(*ast.ReturnStmt)
	_, ok := ret.Value.(*ast.IfBlockExpr)
	if !ok {
		t.Fatalf("expected IfBlockExpr in return, got %T", ret.Value)
	}
}

func TestLetWithIfInline(t *testing.T) {
	src := `let x = if { cond: true, then: 1, else: 0 }
return x`
	prog := mustParse(t, src)
	letStmt := prog.Statements[0].(*ast.LetStmt)
	_, ok := letStmt.Value.(*ast.IfExpr)
	if !ok {
		t.Fatalf("expected IfExpr, got %T", letStmt.Value)
	}
}

func TestLetWithTryCatch(t *testing.T) {
	src := `let result = try {
  return 1
} catch e {
  return 0
}
return result`
	prog := mustParse(t, src)
	letStmt := prog.Statements[0].(*ast.LetStmt)
	_, ok := letStmt.Value.(*ast.TryExpr)
	if !ok {
		t.Fatalf("expected TryExpr, got %T", letStmt.Value)
	}
}
