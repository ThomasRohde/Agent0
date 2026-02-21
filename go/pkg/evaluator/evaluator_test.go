package evaluator_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
	"github.com/thomasrohde/agent0/go/pkg/parser"
	"github.com/thomasrohde/agent0/go/pkg/stdlib"
)

// --- helpers ---

// stdlibMap converts a stdlib.Registry into the map[string]*evaluator.StdlibFn
// expected by ExecOptions. Also registers stub entries for "map" and "reduce"
// which the evaluator handles specially but still requires to be present in
// the stdlib map as a dispatch gate.
func stdlibMap() map[string]*evaluator.StdlibFn {
	reg := stdlib.NewRegistry()
	stdlib.RegisterDefaults(reg)
	out := make(map[string]*evaluator.StdlibFn)
	for name, fn := range reg.All() {
		f := fn // capture loop variable
		out[name] = &evaluator.StdlibFn{
			Name:    f.Name,
			Execute: f.Execute,
		}
	}
	// map and reduce are intercepted by the evaluator before Execute is called,
	// so the Execute func here is a placeholder that should never be reached.
	noop := func(args *evaluator.A0Record) (evaluator.A0Value, error) {
		return evaluator.NewNull(), nil
	}
	out["map"] = &evaluator.StdlibFn{Name: "map", Execute: noop}
	out["reduce"] = &evaluator.StdlibFn{Name: "reduce", Execute: noop}
	return out
}

// defaultOpts returns ExecOptions with stdlib registered and no capability
// restrictions (AllowedCapabilities == nil means allow-all).
func defaultOpts() evaluator.ExecOptions {
	return evaluator.ExecOptions{
		Stdlib: stdlibMap(),
	}
}

// run parses and executes A0 source, returning the result or failing the test
// on parse errors.
func run(t *testing.T, src string) (*evaluator.ExecResult, error) {
	t.Helper()
	return runWith(t, src, defaultOpts())
}

// runWith parses and executes A0 source with custom ExecOptions.
func runWith(t *testing.T, src string, opts evaluator.ExecOptions) (*evaluator.ExecResult, error) {
	t.Helper()
	prog, diags := parser.Parse(src, "test.a0")
	if len(diags) > 0 {
		t.Fatalf("parse errors: %s", diagnostics.FormatDiagnostics(diags, true))
	}
	return evaluator.Execute(context.Background(), prog, opts)
}

// mustRun is like run but also fails on runtime errors.
func mustRun(t *testing.T, src string) *evaluator.ExecResult {
	t.Helper()
	res, err := run(t, src)
	if err != nil {
		t.Fatalf("unexpected runtime error: %v", err)
	}
	return res
}

// expectNumber asserts the result value is an A0Number with the expected float64 value.
func expectNumber(t *testing.T, val evaluator.A0Value, expected float64) {
	t.Helper()
	num, ok := val.(evaluator.A0Number)
	if !ok {
		t.Fatalf("expected A0Number, got %T (%v)", val, val)
	}
	if num.Value != expected {
		t.Errorf("got %v, want %v", num.Value, expected)
	}
}

// expectString asserts the result value is an A0String with the expected value.
func expectString(t *testing.T, val evaluator.A0Value, expected string) {
	t.Helper()
	s, ok := val.(evaluator.A0String)
	if !ok {
		t.Fatalf("expected A0String, got %T (%v)", val, val)
	}
	if s.Value != expected {
		t.Errorf("got %q, want %q", s.Value, expected)
	}
}

// expectBool asserts the result value is an A0Bool with the expected value.
func expectBool(t *testing.T, val evaluator.A0Value, expected bool) {
	t.Helper()
	b, ok := val.(evaluator.A0Bool)
	if !ok {
		t.Fatalf("expected A0Bool, got %T (%v)", val, val)
	}
	if b.Value != expected {
		t.Errorf("got %v, want %v", b.Value, expected)
	}
}

// expectNull asserts the result value is an A0Null.
func expectNull(t *testing.T, val evaluator.A0Value) {
	t.Helper()
	if _, ok := val.(evaluator.A0Null); !ok {
		t.Fatalf("expected A0Null, got %T (%v)", val, val)
	}
}

// expectRuntimeError asserts the error is an A0RuntimeError with the expected code.
func expectRuntimeError(t *testing.T, err error, expectedCode string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected runtime error with code %s, got nil", expectedCode)
	}
	var rtErr *evaluator.A0RuntimeError
	if !errors.As(err, &rtErr) {
		t.Fatalf("expected *A0RuntimeError, got %T: %v", err, err)
	}
	if rtErr.Code != expectedCode {
		t.Errorf("error code = %q, want %q (message: %s)", rtErr.Code, expectedCode, rtErr.Message)
	}
}

// --- 1. Literal evaluation ---

func TestLiteral_Int(t *testing.T) {
	res := mustRun(t, `return 42`)
	expectNumber(t, res.Value, 42)
}

func TestLiteral_Float(t *testing.T) {
	res := mustRun(t, `return 3.14`)
	expectNumber(t, res.Value, 3.14)
}

func TestLiteral_String(t *testing.T) {
	res := mustRun(t, `return "hello"`)
	expectString(t, res.Value, "hello")
}

func TestLiteral_BoolTrue(t *testing.T) {
	res := mustRun(t, `return true`)
	expectBool(t, res.Value, true)
}

func TestLiteral_BoolFalse(t *testing.T) {
	res := mustRun(t, `return false`)
	expectBool(t, res.Value, false)
}

func TestLiteral_Null(t *testing.T) {
	res := mustRun(t, `return null`)
	expectNull(t, res.Value)
}

// --- 2. Arithmetic operators ---

func TestArithmetic_Add(t *testing.T) {
	res := mustRun(t, `return 3 + 4`)
	expectNumber(t, res.Value, 7)
}

func TestArithmetic_Sub(t *testing.T) {
	res := mustRun(t, `return 10 - 3`)
	expectNumber(t, res.Value, 7)
}

func TestArithmetic_Mul(t *testing.T) {
	res := mustRun(t, `return 6 * 7`)
	expectNumber(t, res.Value, 42)
}

func TestArithmetic_Div(t *testing.T) {
	res := mustRun(t, `return 10 / 4`)
	expectNumber(t, res.Value, 2.5)
}

func TestArithmetic_Mod(t *testing.T) {
	res := mustRun(t, `return 10 % 3`)
	expectNumber(t, res.Value, 1)
}

func TestArithmetic_Precedence(t *testing.T) {
	// Multiplication before addition: 2 + 3 * 4 = 14
	res := mustRun(t, `return 2 + 3 * 4`)
	expectNumber(t, res.Value, 14)
}

func TestArithmetic_ParenGrouping(t *testing.T) {
	// Parenthesized grouping: (2 + 3) * 4 = 20
	res := mustRun(t, `return (2 + 3) * 4`)
	expectNumber(t, res.Value, 20)
}

func TestArithmetic_Complex(t *testing.T) {
	// (10 - 2) / 4 = 2
	res := mustRun(t, `return (10 - 2) / 4`)
	expectNumber(t, res.Value, 2)
}

// --- 3. String concatenation ---

func TestStringConcat(t *testing.T) {
	res := mustRun(t, `return "hello" + " " + "world"`)
	expectString(t, res.Value, "hello world")
}

func TestStringConcat_Empty(t *testing.T) {
	res := mustRun(t, `return "" + "abc"`)
	expectString(t, res.Value, "abc")
}

// --- 4. Comparison operators ---

func TestComparison_EqEq_True(t *testing.T) {
	res := mustRun(t, `return 1 == 1`)
	expectBool(t, res.Value, true)
}

func TestComparison_EqEq_False(t *testing.T) {
	res := mustRun(t, `return 1 == 2`)
	expectBool(t, res.Value, false)
}

func TestComparison_Neq_True(t *testing.T) {
	res := mustRun(t, `return 1 != 2`)
	expectBool(t, res.Value, true)
}

func TestComparison_Neq_False(t *testing.T) {
	res := mustRun(t, `return 1 != 1`)
	expectBool(t, res.Value, false)
}

func TestComparison_Gt(t *testing.T) {
	res := mustRun(t, `return 5 > 3`)
	expectBool(t, res.Value, true)
}

func TestComparison_GtFalse(t *testing.T) {
	res := mustRun(t, `return 3 > 5`)
	expectBool(t, res.Value, false)
}

func TestComparison_Lt(t *testing.T) {
	res := mustRun(t, `return 3 < 5`)
	expectBool(t, res.Value, true)
}

func TestComparison_GtEq(t *testing.T) {
	res := mustRun(t, `return 5 >= 5`)
	expectBool(t, res.Value, true)
}

func TestComparison_LtEq(t *testing.T) {
	res := mustRun(t, `return 3 <= 5`)
	expectBool(t, res.Value, true)
}

func TestComparison_StringOrder(t *testing.T) {
	res := mustRun(t, `return "apple" < "banana"`)
	expectBool(t, res.Value, true)
}

func TestComparison_EqEq_Strings(t *testing.T) {
	res := mustRun(t, `return "abc" == "abc"`)
	expectBool(t, res.Value, true)
}

func TestComparison_EqEq_MixedTypes(t *testing.T) {
	// Different types are never equal
	res := mustRun(t, `return 1 == "1"`)
	expectBool(t, res.Value, false)
}

func TestComparison_EqEq_NullNull(t *testing.T) {
	res := mustRun(t, `return null == null`)
	expectBool(t, res.Value, true)
}

func TestComparison_EqEq_BoolBool(t *testing.T) {
	res := mustRun(t, `return true == true`)
	expectBool(t, res.Value, true)
}

// --- 5. Unary negation ---

func TestUnaryNeg_Int(t *testing.T) {
	res := mustRun(t, `return -42`)
	expectNumber(t, res.Value, -42)
}

func TestUnaryNeg_Float(t *testing.T) {
	res := mustRun(t, `return -3.14`)
	expectNumber(t, res.Value, -3.14)
}

func TestUnaryNeg_DoubleNeg(t *testing.T) {
	res := mustRun(t, `
let x = 5
return -(-x)
`)
	expectNumber(t, res.Value, 5)
}

func TestUnaryNeg_TypeError(t *testing.T) {
	_, err := run(t, `return -"hello"`)
	expectRuntimeError(t, err, diagnostics.EType)
}

// --- 6. Record creation ---

func TestRecord_Simple(t *testing.T) {
	res := mustRun(t, `return { a: 1, b: "two" }`)
	rec, ok := res.Value.(evaluator.A0Record)
	if !ok {
		t.Fatalf("expected A0Record, got %T", res.Value)
	}
	aVal, found := rec.Get("a")
	if !found {
		t.Fatal("expected key 'a' in record")
	}
	expectNumber(t, aVal, 1)

	bVal, found := rec.Get("b")
	if !found {
		t.Fatal("expected key 'b' in record")
	}
	expectString(t, bVal, "two")
}

func TestRecord_Nested(t *testing.T) {
	res := mustRun(t, `return { outer: { inner: 42 } }`)
	rec := res.Value.(evaluator.A0Record)
	outerVal, _ := rec.Get("outer")
	inner := outerVal.(evaluator.A0Record)
	innerVal, _ := inner.Get("inner")
	expectNumber(t, innerVal, 42)
}

func TestRecord_Empty(t *testing.T) {
	res := mustRun(t, `return {}`)
	rec, ok := res.Value.(evaluator.A0Record)
	if !ok {
		t.Fatalf("expected A0Record, got %T", res.Value)
	}
	if len(rec.Pairs) != 0 {
		t.Errorf("expected empty record, got %d pairs", len(rec.Pairs))
	}
}

// --- 7. Record spread ---

func TestRecordSpread(t *testing.T) {
	res := mustRun(t, `
let base = { a: 1, b: 2 }
return { ...base, c: 3 }
`)
	rec := res.Value.(evaluator.A0Record)
	aVal, _ := rec.Get("a")
	expectNumber(t, aVal, 1)
	bVal, _ := rec.Get("b")
	expectNumber(t, bVal, 2)
	cVal, _ := rec.Get("c")
	expectNumber(t, cVal, 3)
}

func TestRecordSpread_Override(t *testing.T) {
	res := mustRun(t, `
let base = { a: 1, b: 2 }
return { ...base, b: 99 }
`)
	rec := res.Value.(evaluator.A0Record)
	bVal, _ := rec.Get("b")
	expectNumber(t, bVal, 99)
}

func TestRecordSpread_NonRecordError(t *testing.T) {
	_, err := run(t, `
let x = 42
return { ...x }
`)
	expectRuntimeError(t, err, diagnostics.EType)
}

// --- 8. List creation ---

func TestList_Simple(t *testing.T) {
	res := mustRun(t, `return [1, 2, 3]`)
	list, ok := res.Value.(evaluator.A0List)
	if !ok {
		t.Fatalf("expected A0List, got %T", res.Value)
	}
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 1)
	expectNumber(t, list.Items[1], 2)
	expectNumber(t, list.Items[2], 3)
}

func TestList_Empty(t *testing.T) {
	res := mustRun(t, `return []`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 0 {
		t.Errorf("expected empty list, got %d items", len(list.Items))
	}
}

func TestList_MixedTypes(t *testing.T) {
	res := mustRun(t, `return [1, "two", true, null]`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 1)
	expectString(t, list.Items[1], "two")
	expectBool(t, list.Items[2], true)
	expectNull(t, list.Items[3])
}

// --- 9. Let bindings ---

func TestLetBinding(t *testing.T) {
	res := mustRun(t, `
let x = 42
return x
`)
	expectNumber(t, res.Value, 42)
}

func TestLetBinding_Computed(t *testing.T) {
	res := mustRun(t, `
let a = 10
let b = 20
let c = a + b
return c
`)
	expectNumber(t, res.Value, 30)
}

func TestLetBinding_Shadow(t *testing.T) {
	// Let in same scope overwrites previous
	res := mustRun(t, `
let x = 1
let x = 2
return x
`)
	expectNumber(t, res.Value, 2)
}

// --- 10. Inline if expressions ---

func TestIfInline_True(t *testing.T) {
	res := mustRun(t, `return if { cond: true, then: 1, else: 2 }`)
	expectNumber(t, res.Value, 1)
}

func TestIfInline_False(t *testing.T) {
	res := mustRun(t, `return if { cond: false, then: 1, else: 2 }`)
	expectNumber(t, res.Value, 2)
}

func TestIfInline_TruthyNumber(t *testing.T) {
	res := mustRun(t, `return if { cond: 42, then: "yes", else: "no" }`)
	expectString(t, res.Value, "yes")
}

func TestIfInline_FalsyNull(t *testing.T) {
	res := mustRun(t, `return if { cond: null, then: "yes", else: "no" }`)
	expectString(t, res.Value, "no")
}

func TestIfInline_FalsyEmptyString(t *testing.T) {
	res := mustRun(t, `return if { cond: "", then: "yes", else: "no" }`)
	expectString(t, res.Value, "no")
}

func TestIfInline_FalsyZero(t *testing.T) {
	res := mustRun(t, `return if { cond: 0, then: "yes", else: "no" }`)
	expectString(t, res.Value, "no")
}

// --- 11. If block expressions ---

func TestIfBlock_True(t *testing.T) {
	res := mustRun(t, `
return if (true) {
  return 1
} else {
  return 2
}
`)
	expectNumber(t, res.Value, 1)
}

func TestIfBlock_False(t *testing.T) {
	res := mustRun(t, `
return if (false) {
  return 1
} else {
  return 2
}
`)
	expectNumber(t, res.Value, 2)
}

func TestIfBlock_NoElse(t *testing.T) {
	res := mustRun(t, `
return if (false) {
  return 1
}
`)
	expectNull(t, res.Value)
}

func TestIfBlock_WithBinding(t *testing.T) {
	res := mustRun(t, `
let x = 10
return if (x > 5) {
  return "big"
} else {
  return "small"
}
`)
	expectString(t, res.Value, "big")
}

// --- 12. For loops ---

func TestFor_MapList(t *testing.T) {
	res := mustRun(t, `
return for { in: [1, 2, 3], as: "n" } {
  return n * 2
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 2)
	expectNumber(t, list.Items[1], 4)
	expectNumber(t, list.Items[2], 6)
}

func TestFor_EmptyList(t *testing.T) {
	res := mustRun(t, `
return for { in: [], as: "n" } {
  return n * 2
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 0 {
		t.Errorf("expected empty list, got %d items", len(list.Items))
	}
}

func TestFor_NonListError(t *testing.T) {
	_, err := run(t, `
return for { in: 42, as: "n" } {
  return n
}
`)
	expectRuntimeError(t, err, diagnostics.EForNotList)
}

func TestFor_WithRecords(t *testing.T) {
	res := mustRun(t, `
let items = [{ name: "a" }, { name: "b" }]
return for { in: items, as: "item" } {
  return item.name
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(list.Items))
	}
	expectString(t, list.Items[0], "a")
	expectString(t, list.Items[1], "b")
}

// --- 13. Variable scoping ---

func TestScoping_ForDoesNotLeak(t *testing.T) {
	// The for binding should not leak into the outer scope
	_, err := run(t, `
let result = for { in: [1, 2], as: "n" } {
  return n
}
return n
`)
	expectRuntimeError(t, err, diagnostics.EUnbound)
}

func TestScoping_IfBlockDoesNotLeak(t *testing.T) {
	_, err := run(t, `
if (true) {
  let inner = 42
  return inner
}
return inner
`)
	// The 'inner' should not be accessible outside the if-block.
	// The first return inside the if block will produce 42 before
	// the outer return executes, so this tests that the block scopes.
	// Actually the if-block's return returns from executeBlock. Let's
	// just test that the outer scope can't see inner.
	// Since the if block uses `return inner` which returns from the
	// block and becomes the value of the if expression, and the outer
	// return tries to access inner — this should fail.
	// Wait — the if-block return returns from the executeBlock of the
	// if body, so the if expression evaluates to 42. Then the outer
	// `return inner` tries to read `inner` which is not in scope.
	expectRuntimeError(t, err, diagnostics.EUnbound)
}

func TestScoping_ParentAccess(t *testing.T) {
	// For body can access parent scope
	res := mustRun(t, `
let multiplier = 10
return for { in: [1, 2, 3], as: "n" } {
  return n * multiplier
}
`)
	list := res.Value.(evaluator.A0List)
	expectNumber(t, list.Items[0], 10)
	expectNumber(t, list.Items[1], 20)
	expectNumber(t, list.Items[2], 30)
}

// --- 14. Assert (pass) ---

func TestAssert_Pass(t *testing.T) {
	res := mustRun(t, `
assert { that: true, msg: "ok" }
return "done"
`)
	expectString(t, res.Value, "done")
	if len(res.Evidence) != 1 {
		t.Fatalf("expected 1 evidence, got %d", len(res.Evidence))
	}
	if !res.Evidence[0].OK {
		t.Error("expected evidence to be OK")
	}
	if res.Evidence[0].Kind != "assert" {
		t.Errorf("expected kind 'assert', got %q", res.Evidence[0].Kind)
	}
	if res.Evidence[0].Msg != "ok" {
		t.Errorf("expected msg 'ok', got %q", res.Evidence[0].Msg)
	}
}

// --- 15. Assert (fail) ---

func TestAssert_Fail(t *testing.T) {
	_, err := run(t, `
assert { that: false, msg: "bad" }
return "should not reach"
`)
	expectRuntimeError(t, err, diagnostics.EAssert)
}

func TestAssert_Fail_Message(t *testing.T) {
	_, err := run(t, `
assert { that: false, msg: "things went wrong" }
return null
`)
	var rtErr *evaluator.A0RuntimeError
	if !errors.As(err, &rtErr) {
		t.Fatalf("expected A0RuntimeError, got %T", err)
	}
	if rtErr.Code != diagnostics.EAssert {
		t.Errorf("code = %q, want %q", rtErr.Code, diagnostics.EAssert)
	}
	if rtErr.Message != "assertion failed: things went wrong" {
		t.Errorf("message = %q", rtErr.Message)
	}
}

// --- 16. Check (pass/fail) ---

func TestCheck_Pass(t *testing.T) {
	res := mustRun(t, `
check { that: true, msg: "all good" }
return "done"
`)
	expectString(t, res.Value, "done")
	if len(res.Evidence) != 1 {
		t.Fatalf("expected 1 evidence, got %d", len(res.Evidence))
	}
	if !res.Evidence[0].OK {
		t.Error("expected evidence to be OK")
	}
}

func TestCheck_Fail_NonFatal(t *testing.T) {
	// Check does NOT halt execution — it records evidence and continues.
	res := mustRun(t, `
check { that: false, msg: "this failed" }
return "still running"
`)
	expectString(t, res.Value, "still running")
	if len(res.Evidence) != 1 {
		t.Fatalf("expected 1 evidence, got %d", len(res.Evidence))
	}
	if res.Evidence[0].OK {
		t.Error("expected evidence to NOT be OK")
	}
	if res.Evidence[0].Msg != "this failed" {
		t.Errorf("expected msg 'this failed', got %q", res.Evidence[0].Msg)
	}
}

func TestCheck_Multiple(t *testing.T) {
	res := mustRun(t, `
check { that: true, msg: "pass1" }
check { that: false, msg: "fail1" }
check { that: true, msg: "pass2" }
return "end"
`)
	if len(res.Evidence) != 3 {
		t.Fatalf("expected 3 evidence items, got %d", len(res.Evidence))
	}
	if !res.Evidence[0].OK {
		t.Error("evidence[0] should be OK")
	}
	if res.Evidence[1].OK {
		t.Error("evidence[1] should NOT be OK")
	}
	if !res.Evidence[2].OK {
		t.Error("evidence[2] should be OK")
	}
}

// --- 17. DeepEqual ---

func TestDeepEqual_Numbers(t *testing.T) {
	if !evaluator.DeepEqual(evaluator.NewNumber(42), evaluator.NewNumber(42)) {
		t.Error("expected equal numbers to be deep equal")
	}
	if evaluator.DeepEqual(evaluator.NewNumber(1), evaluator.NewNumber(2)) {
		t.Error("expected different numbers to not be deep equal")
	}
}

func TestDeepEqual_Strings(t *testing.T) {
	if !evaluator.DeepEqual(evaluator.NewString("a"), evaluator.NewString("a")) {
		t.Error("expected equal strings to be deep equal")
	}
}

func TestDeepEqual_Bools(t *testing.T) {
	if !evaluator.DeepEqual(evaluator.NewBool(true), evaluator.NewBool(true)) {
		t.Error("expected equal bools to be deep equal")
	}
	if evaluator.DeepEqual(evaluator.NewBool(true), evaluator.NewBool(false)) {
		t.Error("expected different bools to not be deep equal")
	}
}

func TestDeepEqual_Null(t *testing.T) {
	if !evaluator.DeepEqual(evaluator.NewNull(), evaluator.NewNull()) {
		t.Error("expected two nulls to be deep equal")
	}
}

func TestDeepEqual_Lists(t *testing.T) {
	a := evaluator.NewList([]evaluator.A0Value{evaluator.NewNumber(1), evaluator.NewNumber(2)})
	b := evaluator.NewList([]evaluator.A0Value{evaluator.NewNumber(1), evaluator.NewNumber(2)})
	if !evaluator.DeepEqual(a, b) {
		t.Error("expected equal lists to be deep equal")
	}
}

func TestDeepEqual_Lists_DifferentLength(t *testing.T) {
	a := evaluator.NewList([]evaluator.A0Value{evaluator.NewNumber(1)})
	b := evaluator.NewList([]evaluator.A0Value{evaluator.NewNumber(1), evaluator.NewNumber(2)})
	if evaluator.DeepEqual(a, b) {
		t.Error("expected lists of different length to not be deep equal")
	}
}

func TestDeepEqual_Records(t *testing.T) {
	a := evaluator.NewRecord([]evaluator.KeyValue{
		{Key: "x", Value: evaluator.NewNumber(1)},
		{Key: "y", Value: evaluator.NewString("z")},
	})
	b := evaluator.NewRecord([]evaluator.KeyValue{
		{Key: "x", Value: evaluator.NewNumber(1)},
		{Key: "y", Value: evaluator.NewString("z")},
	})
	if !evaluator.DeepEqual(a, b) {
		t.Error("expected equal records to be deep equal")
	}
}

func TestDeepEqual_MixedTypes(t *testing.T) {
	if evaluator.DeepEqual(evaluator.NewNumber(1), evaluator.NewString("1")) {
		t.Error("expected number and string to not be deep equal")
	}
}

func TestDeepEqual_NilValues(t *testing.T) {
	if !evaluator.DeepEqual(nil, nil) {
		t.Error("expected two nils to be deep equal")
	}
	if evaluator.DeepEqual(nil, evaluator.NewNull()) {
		t.Error("expected nil and A0Null to not be deep equal")
	}
}

// --- 18. Function declarations and calls ---

func TestFn_SimpleCall(t *testing.T) {
	res := mustRun(t, `
fn add { a, b } {
  return a + b
}
return add { a: 3, b: 4 }
`)
	expectNumber(t, res.Value, 7)
}

func TestFn_MultipleParams(t *testing.T) {
	res := mustRun(t, `
fn greet { name, greeting } {
  return greeting + ", " + name
}
return greet { name: "world", greeting: "hello" }
`)
	expectString(t, res.Value, "hello, world")
}

func TestFn_Closure(t *testing.T) {
	res := mustRun(t, `
let factor = 10
fn scale { x } {
  return x * factor
}
return scale { x: 5 }
`)
	expectNumber(t, res.Value, 50)
}

func TestFn_Recursive(t *testing.T) {
	// A0 functions should support recursion via the userFns map
	res := mustRun(t, `
fn factorial { n } {
  return if { cond: n <= 1, then: 1, else: n * factorial { n: n - 1 } }
}
return factorial { n: 5 }
`)
	expectNumber(t, res.Value, 120)
}

func TestFn_MissingParamIsNull(t *testing.T) {
	res := mustRun(t, `
fn identity { a } {
  return a
}
return identity {}
`)
	expectNull(t, res.Value)
}

func TestFn_UnknownFunctionError(t *testing.T) {
	_, err := run(t, `return nonexistent { x: 1 }`)
	expectRuntimeError(t, err, diagnostics.EUnknownFn)
}

// --- 19. Stdlib function calls ---

func TestStdlib_Eq_True(t *testing.T) {
	res := mustRun(t, `return eq { a: 1, b: 1 }`)
	expectBool(t, res.Value, true)
}

func TestStdlib_Eq_False(t *testing.T) {
	res := mustRun(t, `return eq { a: 1, b: 2 }`)
	expectBool(t, res.Value, false)
}

func TestStdlib_Not(t *testing.T) {
	res := mustRun(t, `return not { in: false }`)
	expectBool(t, res.Value, true)
}

func TestStdlib_Not_Truthy(t *testing.T) {
	res := mustRun(t, `return not { in: "hello" }`)
	expectBool(t, res.Value, false)
}

func TestStdlib_Range(t *testing.T) {
	res := mustRun(t, `return range { from: 0, to: 5 }`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 5 {
		t.Fatalf("expected 5 items, got %d", len(list.Items))
	}
	for i := 0; i < 5; i++ {
		expectNumber(t, list.Items[i], float64(i))
	}
}

func TestStdlib_Range_Empty(t *testing.T) {
	res := mustRun(t, `return range { from: 5, to: 0 }`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 0 {
		t.Errorf("expected empty list, got %d items", len(list.Items))
	}
}

func TestStdlib_Len_List(t *testing.T) {
	res := mustRun(t, `return len { in: [1, 2, 3] }`)
	expectNumber(t, res.Value, 3)
}

func TestStdlib_Len_Empty(t *testing.T) {
	res := mustRun(t, `return len { in: [] }`)
	expectNumber(t, res.Value, 0)
}

// --- 20. Budget exceeded: maxIterations ---

func TestBudget_MaxIterations(t *testing.T) {
	_, err := run(t, `
budget { maxIterations: 3 }
return for { in: [1, 2, 3, 4, 5], as: "n" } {
  return n
}
`)
	expectRuntimeError(t, err, diagnostics.EBudget)
}

func TestBudget_MaxIterations_JustFits(t *testing.T) {
	// 3 items with budget of 3 should succeed since we check before incrementing
	res := mustRun(t, `
budget { maxIterations: 3 }
return for { in: [1, 2, 3], as: "n" } {
  return n * 2
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(list.Items))
	}
}

func TestBudget_MaxToolCalls(t *testing.T) {
	mockTool := &evaluator.ToolDef{
		Name:         "mock.tool",
		Mode:         "read",
		CapabilityID: "mock",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			return evaluator.NewString("ok"), nil
		},
	}
	opts := defaultOpts()
	opts.Tools = map[string]*evaluator.ToolDef{"mock.tool": mockTool}

	_, err := runWith(t, `
cap { mock: true }
budget { maxToolCalls: 1 }
call? mock.tool {}
call? mock.tool {}
return "done"
`, opts)
	expectRuntimeError(t, err, diagnostics.EBudget)
}

// --- 21. Capability denied ---

func TestCapabilityDenied(t *testing.T) {
	opts := defaultOpts()
	// Setting AllowedCapabilities means only those listed are allowed
	opts.AllowedCapabilities = map[string]bool{
		"safe": true,
	}
	_, err := runWith(t, `
cap { dangerous: true }
return "hello"
`, opts)
	expectRuntimeError(t, err, diagnostics.ECapDenied)
}

func TestCapabilityAllowed(t *testing.T) {
	mockTool := &evaluator.ToolDef{
		Name:         "safe.read",
		Mode:         "read",
		CapabilityID: "safe",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			return evaluator.NewString("data"), nil
		},
	}
	opts := defaultOpts()
	opts.AllowedCapabilities = map[string]bool{"safe": true}
	opts.Tools = map[string]*evaluator.ToolDef{"safe.read": mockTool}

	res, err := runWith(t, `
cap { safe: true }
let result = call? safe.read {}
return result
`, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectString(t, res.Value, "data")
}

func TestCapabilityAllowAll_NilMap(t *testing.T) {
	// When AllowedCapabilities is nil, all capabilities are allowed
	opts := defaultOpts()
	opts.AllowedCapabilities = nil

	res, err := runWith(t, `
cap { anything: true }
return "allowed"
`, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectString(t, res.Value, "allowed")
}

// --- 22. Division by zero ---

func TestDivisionByZero(t *testing.T) {
	_, err := run(t, `return 10 / 0`)
	expectRuntimeError(t, err, diagnostics.EType)
}

func TestModuloByZero(t *testing.T) {
	_, err := run(t, `return 10 % 0`)
	expectRuntimeError(t, err, diagnostics.EType)
}

// --- 23. Type errors ---

func TestTypeError_AddBoolInt(t *testing.T) {
	_, err := run(t, `return true + 1`)
	expectRuntimeError(t, err, diagnostics.EType)
}

func TestTypeError_SubStrings(t *testing.T) {
	_, err := run(t, `return "a" - "b"`)
	expectRuntimeError(t, err, diagnostics.EType)
}

func TestTypeError_MulBoolBool(t *testing.T) {
	_, err := run(t, `return true * false`)
	expectRuntimeError(t, err, diagnostics.EType)
}

func TestTypeError_CompareNumberString(t *testing.T) {
	_, err := run(t, `return 1 > "2"`)
	expectRuntimeError(t, err, diagnostics.EType)
}

func TestTypeError_AddStringNumber(t *testing.T) {
	_, err := run(t, `return "hello" + 42`)
	expectRuntimeError(t, err, diagnostics.EType)
}

// --- 24. Dot path access ---

func TestDotPath_Simple(t *testing.T) {
	res := mustRun(t, `
let r = { a: 1 }
return r.a
`)
	expectNumber(t, res.Value, 1)
}

func TestDotPath_Nested(t *testing.T) {
	res := mustRun(t, `
let r = { a: { b: { c: 42 } } }
return r.a.b.c
`)
	expectNumber(t, res.Value, 42)
}

func TestDotPath_MissingField(t *testing.T) {
	_, err := run(t, `
let r = { a: 1 }
return r.b
`)
	expectRuntimeError(t, err, diagnostics.EPath)
}

func TestDotPath_NonRecord(t *testing.T) {
	_, err := run(t, `
let r = 42
return r.a
`)
	expectRuntimeError(t, err, diagnostics.EPath)
}

func TestDotPath_UnboundVariable(t *testing.T) {
	_, err := run(t, `return undeclared`)
	expectRuntimeError(t, err, diagnostics.EUnbound)
}

// --- 25. Try/catch ---

func TestTryCatch_NoError(t *testing.T) {
	res := mustRun(t, `
return try {
  return 42
} catch e {
  return e.code
}
`)
	expectNumber(t, res.Value, 42)
}

func TestTryCatch_CatchesError(t *testing.T) {
	res := mustRun(t, `
return try {
  return 1 / 0
} catch e {
  return e.code
}
`)
	expectString(t, res.Value, diagnostics.EType)
}

func TestTryCatch_ErrorRecord(t *testing.T) {
	res := mustRun(t, `
return try {
  return 1 / 0
} catch e {
  return e
}
`)
	rec := res.Value.(evaluator.A0Record)
	code, _ := rec.Get("code")
	expectString(t, code, diagnostics.EType)
	msg, _ := rec.Get("message")
	expectString(t, msg, "division by zero")
}

func TestTryCatch_CatchAssertionFail(t *testing.T) {
	res := mustRun(t, `
return try {
  assert { that: false, msg: "boom" }
  return "unreachable"
} catch e {
  return e.code
}
`)
	expectString(t, res.Value, diagnostics.EAssert)
}

func TestTryCatch_UnboundVariableInTryBody(t *testing.T) {
	res := mustRun(t, `
return try {
  return undefined_var
} catch e {
  return e.code
}
`)
	expectString(t, res.Value, diagnostics.EUnbound)
}

// --- Match expression ---

func TestMatch_OkArm(t *testing.T) {
	res := mustRun(t, `
let result = { ok: 42 }
let matched = match (result) {
  ok { v } { return v + 1 }
  err { e } { return 0 }
}
return matched
`)
	expectNumber(t, res.Value, 43)
}

func TestMatch_ErrArm(t *testing.T) {
	res := mustRun(t, `
let result = { err: "something failed" }
let matched = match (result) {
  ok { v } { return v }
  err { e } { return e }
}
return matched
`)
	expectString(t, res.Value, "something failed")
}

func TestMatch_NonRecordError(t *testing.T) {
	_, err := run(t, `
let x = 42
return match x {
  ok v { return v }
  err e { return e }
}
`)
	expectRuntimeError(t, err, diagnostics.EMatchNotRecord)
}

func TestMatch_NoMatchingArm(t *testing.T) {
	_, err := run(t, `
let result = { other: 1 }
let matched = match (result) {
  ok { v } { return v }
  err { e } { return e }
}
return matched
`)
	expectRuntimeError(t, err, diagnostics.EMatchNoArm)
}

// --- Filter block ---

func TestFilterBlock(t *testing.T) {
	res := mustRun(t, `
return filter { in: [1, 2, 3, 4, 5], as: "n" } {
  return n > 3
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 4)
	expectNumber(t, list.Items[1], 5)
}

func TestFilterBlock_Empty(t *testing.T) {
	res := mustRun(t, `
return filter { in: [1, 2, 3], as: "n" } {
  return n > 10
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 0 {
		t.Errorf("expected empty list, got %d items", len(list.Items))
	}
}

func TestFilterBlock_AllPass(t *testing.T) {
	res := mustRun(t, `
return filter { in: [1, 2, 3], as: "n" } {
  return true
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 3 {
		t.Errorf("expected 3 items, got %d", len(list.Items))
	}
}

func TestFilterBlock_NonListError(t *testing.T) {
	_, err := run(t, `
return filter { in: "not a list", as: "n" } {
  return true
}
`)
	expectRuntimeError(t, err, diagnostics.EType)
}

// --- Loop expression ---

func TestLoop_Simple(t *testing.T) {
	res := mustRun(t, `
return loop { in: 0, times: 5, as: "acc" } {
  return acc + 1
}
`)
	expectNumber(t, res.Value, 5)
}

func TestLoop_Accumulator(t *testing.T) {
	res := mustRun(t, `
return loop { in: 1, times: 4, as: "acc" } {
  return acc * 2
}
`)
	// 1 -> 2 -> 4 -> 8 -> 16
	expectNumber(t, res.Value, 16)
}

func TestLoop_ZeroTimes(t *testing.T) {
	res := mustRun(t, `
return loop { in: 42, times: 0, as: "acc" } {
  return acc + 1
}
`)
	expectNumber(t, res.Value, 42)
}

// --- Tool calls ---

func TestToolCall_ReadMode(t *testing.T) {
	mockTool := &evaluator.ToolDef{
		Name:         "mock.read",
		Mode:         "read",
		CapabilityID: "test",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			path, _ := args.Get("path")
			if s, ok := path.(evaluator.A0String); ok {
				return evaluator.NewString("content of " + s.Value), nil
			}
			return evaluator.NewNull(), nil
		},
	}
	opts := defaultOpts()
	opts.Tools = map[string]*evaluator.ToolDef{"mock.read": mockTool}

	res, err := runWith(t, `
cap { test: true }
return call? mock.read { path: "/foo.txt" }
`, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectString(t, res.Value, "content of /foo.txt")
}

func TestToolCall_EffectMode(t *testing.T) {
	written := ""
	mockTool := &evaluator.ToolDef{
		Name:         "mock.write",
		Mode:         "effect",
		CapabilityID: "test",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			dataVal, _ := args.Get("data")
			if s, ok := dataVal.(evaluator.A0String); ok {
				written = s.Value
			}
			return evaluator.NewBool(true), nil
		},
	}
	opts := defaultOpts()
	opts.Tools = map[string]*evaluator.ToolDef{"mock.write": mockTool}

	res, err := runWith(t, `
cap { test: true }
return do mock.write { data: "hello" }
`, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectBool(t, res.Value, true)
	if written != "hello" {
		t.Errorf("expected written='hello', got %q", written)
	}
}

func TestToolCall_UnknownTool(t *testing.T) {
	_, err := run(t, `
cap { test: true }
return call? nonexistent.tool { x: 1 }
`)
	expectRuntimeError(t, err, diagnostics.EUnknownTool)
}

func TestToolCall_ToolError(t *testing.T) {
	failTool := &evaluator.ToolDef{
		Name:         "fail.tool",
		Mode:         "read",
		CapabilityID: "test",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			return nil, fmt.Errorf("something broke")
		},
	}
	opts := defaultOpts()
	opts.Tools = map[string]*evaluator.ToolDef{"fail.tool": failTool}

	_, err := runWith(t, `
cap { test: true }
return call? fail.tool {}
`, opts)
	expectRuntimeError(t, err, diagnostics.ETool)
}

// --- Arrow binding (ExprStmt with Target) ---

func TestArrowBinding(t *testing.T) {
	res := mustRun(t, `
if { cond: true, then: 42, else: 0 } -> result
return result
`)
	expectNumber(t, res.Value, 42)
}

// --- Map stdlib ---

func TestMap_UserFunction(t *testing.T) {
	res := mustRun(t, `
fn double { value } {
  return value * 2
}
return map { in: [1, 2, 3], fn: "double" }
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 2)
	expectNumber(t, list.Items[1], 4)
	expectNumber(t, list.Items[2], 6)
}

// --- Reduce stdlib ---

func TestReduce_Sum(t *testing.T) {
	res := mustRun(t, `
fn adder { acc, value } {
  return acc + value
}
return reduce { in: [1, 2, 3, 4], init: 0, fn: "adder" }
`)
	expectNumber(t, res.Value, 10)
}

// --- Trace callback ---

func TestTrace_EmitsEvents(t *testing.T) {
	var events []evaluator.TraceEvent
	opts := defaultOpts()
	opts.Trace = func(e evaluator.TraceEvent) {
		events = append(events, e)
	}
	opts.RunID = "test-run"

	_, err := runWith(t, `return 42`, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(events) == 0 {
		t.Fatal("expected trace events, got none")
	}

	// Should have at least run_start and run_end
	foundStart := false
	foundEnd := false
	for _, e := range events {
		if e.Event == evaluator.TraceRunStart {
			foundStart = true
		}
		if e.Event == evaluator.TraceRunEnd {
			foundEnd = true
		}
		if e.RunID != "test-run" {
			t.Errorf("expected runID 'test-run', got %q", e.RunID)
		}
	}
	if !foundStart {
		t.Error("missing run_start event")
	}
	if !foundEnd {
		t.Error("missing run_end event")
	}
}

// --- Complex integration tests ---

func TestIntegration_FibonacciLoop(t *testing.T) {
	// Use loop to compute a sequence
	res := mustRun(t, `
return loop { in: { a: 0, b: 1, n: 0 }, times: 10, as: "state" } {
  return { a: state.b, b: state.a + state.b, n: state.n + 1 }
}
`)
	rec := res.Value.(evaluator.A0Record)
	// After 10 iterations: fib(10) = 55
	bVal, _ := rec.Get("b")
	expectNumber(t, bVal, 89)
	aVal, _ := rec.Get("a")
	expectNumber(t, aVal, 55)
}

func TestIntegration_ForWithFilter(t *testing.T) {
	res := mustRun(t, `
let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
let evens = filter { in: numbers, as: "n" } {
  return n % 2 == 0
}
return for { in: evens, as: "n" } {
  return n * n
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 5 {
		t.Fatalf("expected 5 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 4)   // 2*2
	expectNumber(t, list.Items[1], 16)  // 4*4
	expectNumber(t, list.Items[2], 36)  // 6*6
	expectNumber(t, list.Items[3], 64)  // 8*8
	expectNumber(t, list.Items[4], 100) // 10*10
}

func TestIntegration_TryCatchInFor(t *testing.T) {
	res := mustRun(t, `
let inputs = [2, 0, 4]
return for { in: inputs, as: "n" } {
  return try {
    return 10 / n
  } catch e {
    return -1
  }
}
`)
	list := res.Value.(evaluator.A0List)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(list.Items))
	}
	expectNumber(t, list.Items[0], 5)
	expectNumber(t, list.Items[1], -1) // caught division by zero
	expectNumber(t, list.Items[2], 2.5)
}

func TestIntegration_NestedRecordBuild(t *testing.T) {
	res := mustRun(t, `
let base = { name: "test", version: 1 }
let extended = { ...base, version: 2, extra: true }
return extended
`)
	rec := res.Value.(evaluator.A0Record)
	name, _ := rec.Get("name")
	expectString(t, name, "test")
	version, _ := rec.Get("version")
	expectNumber(t, version, 2)
	extra, _ := rec.Get("extra")
	expectBool(t, extra, true)
}

func TestIntegration_MatchWithTryCatch(t *testing.T) {
	res := mustRun(t, `
let safeDiv = try {
  return { ok: 10 / 2 }
} catch e {
  return { err: e.message }
}
let matched = match (safeDiv) {
  ok { v } { return v }
  err { e } { return e }
}
return matched
`)
	expectNumber(t, res.Value, 5)
}

func TestIntegration_IfBlockWithLetBindings(t *testing.T) {
	res := mustRun(t, `
let x = 15
return if (x > 10) {
  let doubled = x * 2
  return doubled
} else {
  return x
}
`)
	expectNumber(t, res.Value, 30)
}

// --- Return value is last expression when no explicit return ---

func TestLastExpressionValue(t *testing.T) {
	// Without return, the last expression value should be returned
	res := mustRun(t, `
let x = 42
x
`)
	// The ExprStmt for `x` should set lastVal to 42
	expectNumber(t, res.Value, 42)
}

// --- Context cancellation ---

func TestContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	prog, diags := parser.Parse(`
return loop { in: 0, times: 1000000, as: "acc" } {
  return acc + 1
}
`, "test.a0")
	if len(diags) > 0 {
		t.Fatalf("parse errors: %s", diagnostics.FormatDiagnostics(diags, true))
	}

	// The budget timeout path should interact with context cancellation
	// The loop will check the time budget which also checks context
	opts := defaultOpts()
	_, err := evaluator.Execute(ctx, prog, opts)
	// Since there's no time budget set, the loop should still complete
	// but the context is cancelled. Depending on implementation, this
	// might not error immediately since time budget checks use hires timer.
	// This test just verifies the executor does not panic with a cancelled context.
	_ = err
}

// --- Equality via == operator on records/lists ---

func TestEqualityOp_Records(t *testing.T) {
	res := mustRun(t, `
let a = { x: 1, y: 2 }
let b = { x: 1, y: 2 }
return a == b
`)
	expectBool(t, res.Value, true)
}

func TestEqualityOp_Records_Different(t *testing.T) {
	res := mustRun(t, `
let a = { x: 1 }
let b = { x: 2 }
return a == b
`)
	expectBool(t, res.Value, false)
}

func TestEqualityOp_Lists(t *testing.T) {
	res := mustRun(t, `
let a = [1, 2, 3]
let b = [1, 2, 3]
return a == b
`)
	expectBool(t, res.Value, true)
}

func TestEqualityOp_Lists_Different(t *testing.T) {
	res := mustRun(t, `
let a = [1, 2]
let b = [1, 2, 3]
return a != b
`)
	expectBool(t, res.Value, true)
}

// --- Budget interactions with filter and loop ---

func TestBudget_MaxIterations_Filter(t *testing.T) {
	_, err := run(t, `
budget { maxIterations: 2 }
return filter { in: [1, 2, 3, 4, 5], as: "n" } {
  return n > 0
}
`)
	expectRuntimeError(t, err, diagnostics.EBudget)
}

func TestBudget_MaxIterations_Loop(t *testing.T) {
	_, err := run(t, `
budget { maxIterations: 3 }
return loop { in: 0, times: 10, as: "acc" } {
  return acc + 1
}
`)
	expectRuntimeError(t, err, diagnostics.EBudget)
}

// --- ExprStmt with arrow target path ---

func TestArrowBinding_Nested(t *testing.T) {
	// Arrow with dotted path creates nested records
	res := mustRun(t, `
42 -> result
return result
`)
	expectNumber(t, res.Value, 42)
}

// --- Multiple user functions ---

func TestMultipleFunctions(t *testing.T) {
	res := mustRun(t, `
fn add { a, b } {
  return a + b
}
fn mul { a, b } {
  return a * b
}
return mul { a: add { a: 1, b: 2 }, b: 10 }
`)
	expectNumber(t, res.Value, 30)
}

// --- Fn calling fn ---

func TestFn_CallingFn(t *testing.T) {
	res := mustRun(t, `
fn square { x } {
  return x * x
}
fn sumOfSquares { a, b } {
  return square { x: a } + square { x: b }
}
return sumOfSquares { a: 3, b: 4 }
`)
	expectNumber(t, res.Value, 25)
}

// --- Edge cases ---

func TestNegativeNumberArithmetic(t *testing.T) {
	res := mustRun(t, `return -3 + -4`)
	expectNumber(t, res.Value, -7)
}

func TestZeroArithmetic(t *testing.T) {
	res := mustRun(t, `return 0 * 100`)
	expectNumber(t, res.Value, 0)
}

func TestFloatArithmetic(t *testing.T) {
	res := mustRun(t, `return 1.5 + 2.5`)
	expectNumber(t, res.Value, 4)
}

func TestEmptyProgram(t *testing.T) {
	// A program with no statements returns null
	prog, diags := parser.Parse(``, "test.a0")
	if len(diags) > 0 {
		t.Fatalf("parse errors: %s", diagnostics.FormatDiagnostics(diags, true))
	}
	res, err := evaluator.Execute(context.Background(), prog, defaultOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectNull(t, res.Value)
}

// --- Assert evidence is returned even on failure ---

func TestAssert_FailureReturnsEvidence(t *testing.T) {
	res, err := run(t, `
assert { that: true, msg: "pass" }
assert { that: false, msg: "fail" }
return "unreachable"
`)
	expectRuntimeError(t, err, diagnostics.EAssert)
	// The result should still contain evidence from the passing assert
	if res == nil {
		t.Fatal("expected result with evidence, got nil")
	}
	if len(res.Evidence) != 2 {
		t.Fatalf("expected 2 evidence items, got %d", len(res.Evidence))
	}
	if !res.Evidence[0].OK {
		t.Error("evidence[0] should be OK")
	}
	if res.Evidence[1].OK {
		t.Error("evidence[1] should NOT be OK")
	}
}

// --- Check returns evidence record ---

func TestCheck_ReturnsEvidenceRecord(t *testing.T) {
	res := mustRun(t, `
let ev = check { that: true, msg: "it works" }
return ev
`)
	rec := res.Value.(evaluator.A0Record)
	kind, _ := rec.Get("kind")
	expectString(t, kind, "check")
	ok, _ := rec.Get("ok")
	expectBool(t, ok, true)
	msg, _ := rec.Get("msg")
	expectString(t, msg, "it works")
}
