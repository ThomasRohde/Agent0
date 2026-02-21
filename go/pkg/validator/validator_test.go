package validator_test

import (
	"strings"
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/diagnostics"
	"github.com/thomasrohde/agent0/go/pkg/parser"
	"github.com/thomasrohde/agent0/go/pkg/validator"
)

// helper parses source and validates, returning diagnostics from validation only.
// It fatals on parse errors so test cases focus on validator behavior.
func mustParseAndValidate(t *testing.T, source string) []diagnostics.Diagnostic {
	t.Helper()
	prog, parseErrs := parser.Parse(source, "test.a0")
	if len(parseErrs) > 0 {
		t.Fatalf("unexpected parse error: %s", parseErrs[0].Message)
	}
	return validator.Validate(prog)
}

// assertNoDiags asserts zero diagnostics were produced.
func assertNoDiags(t *testing.T, diags []diagnostics.Diagnostic) {
	t.Helper()
	if len(diags) != 0 {
		var msgs []string
		for _, d := range diags {
			msgs = append(msgs, d.Code+": "+d.Message)
		}
		t.Errorf("expected no diagnostics, got %d:\n  %s", len(diags), strings.Join(msgs, "\n  "))
	}
}

// assertDiagCount asserts the expected number of diagnostics.
func assertDiagCount(t *testing.T, diags []diagnostics.Diagnostic, expected int) {
	t.Helper()
	if len(diags) != expected {
		var msgs []string
		for _, d := range diags {
			msgs = append(msgs, d.Code+": "+d.Message)
		}
		t.Errorf("expected %d diagnostics, got %d:\n  %s", expected, len(diags), strings.Join(msgs, "\n  "))
	}
}

// assertHasCode asserts that at least one diagnostic with the given code exists.
func assertHasCode(t *testing.T, diags []diagnostics.Diagnostic, code string) {
	t.Helper()
	for _, d := range diags {
		if d.Code == code {
			return
		}
	}
	var codes []string
	for _, d := range diags {
		codes = append(codes, d.Code)
	}
	t.Errorf("expected diagnostic code %s, got codes: %v", code, codes)
}

// assertDiagCodeAt checks that diagnostic at index i has the expected code.
func assertDiagCodeAt(t *testing.T, diags []diagnostics.Diagnostic, index int, code string) {
	t.Helper()
	if index >= len(diags) {
		t.Errorf("expected diagnostic at index %d with code %s, but only %d diagnostics exist", index, code, len(diags))
		return
	}
	if diags[index].Code != code {
		t.Errorf("diagnostic[%d]: got code %q, want %q (message: %s)", index, diags[index].Code, code, diags[index].Message)
	}
}

// ===== Valid Programs (zero diagnostics) =====

func TestValid_SimpleReturn(t *testing.T) {
	diags := mustParseAndValidate(t, `return 42`)
	assertNoDiags(t, diags)
}

func TestValid_ReturnRecord(t *testing.T) {
	diags := mustParseAndValidate(t, `return { ok: true }`)
	assertNoDiags(t, diags)
}

func TestValid_ReturnString(t *testing.T) {
	diags := mustParseAndValidate(t, `return "hello"`)
	assertNoDiags(t, diags)
}

func TestValid_LetAndReturn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 42
let y = "hello"
return { x: x, y: y }
`)
	assertNoDiags(t, diags)
}

func TestValid_AssertAndReturn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 10
assert { cond: x > 5, msg: "x should be > 5" }
return x
`)
	assertNoDiags(t, diags)
}

func TestValid_CheckAndReturn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 10
check { cond: x > 5, msg: "x should be > 5" }
return x
`)
	assertNoDiags(t, diags)
}

func TestValid_ForLoop(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3]
for { in: items, as: "item" } {
  let doubled = item * 2
}
return items
`)
	assertNoDiags(t, diags)
}

func TestValid_FnDecl(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn add { a, b } {
  return a + b
}
let result = add { a: 1, b: 2 }
return result
`)
	assertNoDiags(t, diags)
}

func TestValid_MultipleFnDecls(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn double { x } {
  return x * 2
}
fn triple { x } {
  return x * 3
}
let a = double { x: 5 }
let b = triple { x: 5 }
return { a: a, b: b }
`)
	assertNoDiags(t, diags)
}

func TestValid_StdlibCall(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [3, 1, 2]
let sorted = sort { list: items }
return sorted
`)
	assertNoDiags(t, diags)
}

func TestValid_DottedStdlibCall(t *testing.T) {
	diags := mustParseAndValidate(t, `
let data = parse.json { str: "{}" }
return data
`)
	assertNoDiags(t, diags)
}

func TestValid_CapAndTool(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "test.txt" } -> content
return content
`)
	assertNoDiags(t, diags)
}

func TestValid_CapAndDoTool(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.write: true }
do fs.write { path: "out.txt", data: "hello" } -> result
return result
`)
	assertNoDiags(t, diags)
}

func TestValid_Budget(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: 5000, maxToolCalls: 10 }
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestValid_CapBudgetCombined(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
budget { timeMs: 5000, maxIterations: 100 }
call? fs.read { path: "test.txt" } -> data
return data
`)
	assertNoDiags(t, diags)
}

func TestValid_IfInline(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 10
let r = if { cond: x > 5, then: "big", else: "small" }
return r
`)
	assertNoDiags(t, diags)
}

func TestValid_IfBlock(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 10
if (x > 5) {
  let y = "big"
} else {
  let y = "small"
}
return x
`)
	assertNoDiags(t, diags)
}

func TestValid_TryCatch(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = try {
  let x = 42
} catch e {
  let fallback = e
}
return result
`)
	assertNoDiags(t, diags)
}

func TestValid_MatchExpr(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "test.txt" } -> data
match (data) {
  ok val {
    return val
  }
  err e {
    return "error"
  }
}
return null
`)
	assertNoDiags(t, diags)
}

func TestValid_FilterBlock(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3, 4, 5]
let evens = filter { in: items, as: "x" } {
  return x > 2
}
return evens
`)
	assertNoDiags(t, diags)
}

func TestValid_LoopExpr(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = loop { in: 0, times: 10, as: "acc" } {
  return acc + 1
}
return result
`)
	assertNoDiags(t, diags)
}

func TestValid_BinaryExpressions(t *testing.T) {
	diags := mustParseAndValidate(t, `
let a = 1 + 2
let b = 3 - 1
let c = 2 * 3
let d = 10 / 2
let e = 7 % 3
return { a: a, b: b, c: c, d: d, e: e }
`)
	assertNoDiags(t, diags)
}

func TestValid_UnaryExpression(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = -42
return x
`)
	assertNoDiags(t, diags)
}

func TestValid_ListLiteral(t *testing.T) {
	diags := mustParseAndValidate(t, `
let xs = [1, 2, 3]
return xs
`)
	assertNoDiags(t, diags)
}

func TestValid_SpreadPair(t *testing.T) {
	diags := mustParseAndValidate(t, `
let base = { a: 1, b: 2 }
let extended = { ...base, c: 3 }
return extended
`)
	assertNoDiags(t, diags)
}

func TestValid_ExprStmtArrowBinding(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "test.txt" } -> data
return data
`)
	assertNoDiags(t, diags)
}

func TestValid_AllBudgetFields(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: 5000, maxToolCalls: 10, maxBytesWritten: 1024, maxIterations: 100 }
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestValid_AllCapabilities(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true, fs.write: true, http.get: true, sh.exec: true }
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestValid_NestedScoping(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 1
fn foo { a } {
  let b = x + a
  return b
}
return foo { a: 2 }
`)
	assertNoDiags(t, diags)
}

// ===== E_NO_RETURN: program without return statement =====

func TestError_NoReturn_Empty(t *testing.T) {
	prog, parseErrs := parser.Parse("", "test.a0")
	if len(parseErrs) > 0 {
		t.Fatalf("unexpected parse error: %s", parseErrs[0].Message)
	}
	diags := validator.Validate(prog)
	assertDiagCount(t, diags, 1)
	assertHasCode(t, diags, diagnostics.ENoReturn)
}

func TestError_NoReturn_OnlyLet(t *testing.T) {
	diags := mustParseAndValidate(t, `let x = 42`)
	assertHasCode(t, diags, diagnostics.ENoReturn)
}

func TestError_NoReturn_OnlyAssert(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 5
assert { cond: x > 0, msg: "positive" }
`)
	assertHasCode(t, diags, diagnostics.ENoReturn)
}

// ===== E_RETURN_NOT_LAST: return not as last statement =====

func TestError_ReturnNotLast(t *testing.T) {
	diags := mustParseAndValidate(t, `
return 42
let x = 1
`)
	assertHasCode(t, diags, diagnostics.EReturnNotLast)
}

func TestError_ReturnNotLast_MiddleReturn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let a = 1
return a
let b = 2
return b
`)
	// The first return is not last
	assertHasCode(t, diags, diagnostics.EReturnNotLast)
}

func TestError_ReturnNotLast_InBlock(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn foo { x } {
  return x
  let y = 1
}
return foo { x: 1 }
`)
	assertHasCode(t, diags, diagnostics.EReturnNotLast)
}

// ===== E_DUP_BUDGET (E_AST code): duplicate budget declaration =====

func TestError_DupBudget(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: 1000 }
budget { maxToolCalls: 5 }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
	// Check for "duplicate budget" in message
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EAst && strings.Contains(d.Message, "duplicate budget") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'duplicate budget' diagnostic message")
	}
}

// ===== E_AST (import unsupported) =====

func TestError_ImportUnsupported(t *testing.T) {
	diags := mustParseAndValidate(t, `
import "foo.a0" as foo
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EAst && strings.Contains(d.Message, "import") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'import' related diagnostic message")
	}
}

// ===== E_UNKNOWN_CAP: unknown capability =====

func TestError_UnknownCap(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { db.query: true }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EUnknownCap)
}

func TestError_UnknownCap_Multiple(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true, net.connect: true, db.query: true }
return "ok"
`)
	// Should have 2 unknown cap diagnostics (net.connect and db.query)
	count := 0
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownCap {
			count++
		}
	}
	if count != 2 {
		t.Errorf("expected 2 E_UNKNOWN_CAP diagnostics, got %d", count)
	}
}

// ===== E_AST: cap value not boolean =====

func TestError_CapValueNotBool(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: "yes" }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EAst && strings.Contains(d.Message, "must be a boolean") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'must be a boolean' diagnostic message")
	}
}

func TestError_CapValueNumber(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: 1 }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
}

// ===== E_UNKNOWN_BUDGET: unknown budget field =====

func TestError_UnknownBudget(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { unknownField: 100 }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EUnknownBudget)
}

func TestError_UnknownBudget_Multiple(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: 1000, fooBar: 5, bazQux: 10 }
return "ok"
`)
	count := 0
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownBudget {
			count++
		}
	}
	if count != 2 {
		t.Errorf("expected 2 E_UNKNOWN_BUDGET diagnostics, got %d", count)
	}
}

// ===== E_AST: budget value not number =====

func TestError_BudgetValueNotNumber(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: "fast" }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EAst && strings.Contains(d.Message, "must be a number") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'must be a number' diagnostic message")
	}
}

func TestError_BudgetValueBool(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { timeMs: true }
return "ok"
`)
	assertHasCode(t, diags, diagnostics.EAst)
}

// ===== E_DUP_BINDING: duplicate let bindings =====

func TestError_DupBinding(t *testing.T) {
	diags := mustParseAndValidate(t, `
let x = 1
let x = 2
return x
`)
	assertHasCode(t, diags, diagnostics.EDupBinding)
}

func TestError_DupBinding_Multiple(t *testing.T) {
	diags := mustParseAndValidate(t, `
let a = 1
let b = 2
let a = 3
let b = 4
return a
`)
	count := 0
	for _, d := range diags {
		if d.Code == diagnostics.EDupBinding {
			count++
		}
	}
	if count != 2 {
		t.Errorf("expected 2 E_DUP_BINDING diagnostics, got %d", count)
	}
}

func TestError_DupBinding_ArrowTarget(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "a.txt" } -> data
call? fs.read { path: "b.txt" } -> data
return data
`)
	assertHasCode(t, diags, diagnostics.EDupBinding)
}

func TestError_DupBinding_LetAndArrow(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
let data = "initial"
call? fs.read { path: "a.txt" } -> data
return data
`)
	assertHasCode(t, diags, diagnostics.EDupBinding)
}

// ===== E_FN_DUP: duplicate function declarations =====

func TestError_FnDup(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn foo { x } {
  return x
}
fn foo { y } {
  return y
}
return foo { x: 1 }
`)
	assertHasCode(t, diags, diagnostics.EFnDup)
}

func TestError_FnDup_ConflictsWithStdlib(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn len { x } {
  return x
}
return len { x: 1 }
`)
	assertHasCode(t, diags, diagnostics.EFnDup)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EFnDup && strings.Contains(d.Message, "conflicts with stdlib") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'conflicts with stdlib' diagnostic message")
	}
}

func TestError_FnDup_ConflictsWithSort(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn sort { x } {
  return x
}
return sort { x: [1] }
`)
	assertHasCode(t, diags, diagnostics.EFnDup)
}

func TestError_FnDup_ConflictsWithMap(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn map { x } {
  return x
}
return map { x: [1] }
`)
	assertHasCode(t, diags, diagnostics.EFnDup)
}

// ===== E_UNBOUND: reference to undefined variable =====

func TestError_Unbound(t *testing.T) {
	diags := mustParseAndValidate(t, `return x`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_InExpr(t *testing.T) {
	diags := mustParseAndValidate(t, `
let a = 1
return a + b
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_Multiple(t *testing.T) {
	diags := mustParseAndValidate(t, `return x + y + z`)
	count := 0
	for _, d := range diags {
		if d.Code == diagnostics.EUnbound {
			count++
		}
	}
	if count != 3 {
		t.Errorf("expected 3 E_UNBOUND diagnostics, got %d", count)
	}
}

func TestError_Unbound_InRecord(t *testing.T) {
	diags := mustParseAndValidate(t, `return { a: unknown }`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_InList(t *testing.T) {
	diags := mustParseAndValidate(t, `return [unknown]`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_InSpread(t *testing.T) {
	diags := mustParseAndValidate(t, `return { ...unknown, a: 1 }`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_InToolArgs(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: myPath } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_InIfCond(t *testing.T) {
	diags := mustParseAndValidate(t, `
return if { cond: unknown, then: 1, else: 2 }
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestError_Unbound_NotInForScope(t *testing.T) {
	// variable defined in for body should not be available outside
	diags := mustParseAndValidate(t, `
let items = [1, 2]
for { in: items, as: "x" } {
  let inner = x
}
return inner
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

// ===== E_UNKNOWN_FN: call to unknown function =====

func TestError_UnknownFn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = nonexistent { x: 1 }
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownFn)
}

func TestError_UnknownFn_DottedName(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = foo.bar { x: 1 }
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownFn)
}

func TestError_UnknownFn_ToolMisuseHint(t *testing.T) {
	// Calling a tool name as a function should hint to use call?/do
	diags := mustParseAndValidate(t, `
let result = fs.read { path: "test.txt" }
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownFn)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownFn && strings.Contains(d.Message, "call?") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected hint about 'call?' in diagnostic message for tool name used as function")
	}
}

func TestError_UnknownFn_ToolDoHint(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = fs.write { path: "out.txt", data: "hello" }
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownFn)
	found := false
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownFn && strings.Contains(d.Message, "do") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected hint about 'do' in diagnostic message for effect tool used as function")
	}
}

// ===== E_UNKNOWN_TOOL: call?/do with unknown tool =====

func TestError_UnknownTool_Call(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? db.query { sql: "SELECT 1" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownTool)
}

func TestError_UnknownTool_Do(t *testing.T) {
	diags := mustParseAndValidate(t, `
do db.insert { table: "users", data: {} } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownTool)
}

func TestError_UnknownTool_SinglePart(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? unknown { x: 1 } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUnknownTool)
}

// ===== E_CALL_EFFECT: using call? with an effect tool =====

func TestError_CallEffect_FsWrite(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.write: true }
call? fs.write { path: "out.txt", data: "hello" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.ECallEffect)
}

func TestError_CallEffect_ShExec(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { sh.exec: true }
call? sh.exec { cmd: "ls" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.ECallEffect)
}

func TestNoError_DoWithEffectTool(t *testing.T) {
	// do with effect tool is correct usage
	diags := mustParseAndValidate(t, `
cap { fs.write: true }
do fs.write { path: "out.txt", data: "hello" } -> result
return result
`)
	assertNoDiags(t, diags)
}

func TestNoError_CallWithReadTool(t *testing.T) {
	// call? with read tool is correct usage
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "test.txt" } -> result
return result
`)
	assertNoDiags(t, diags)
}

// ===== E_UNDECLARED_CAP: using a tool without declaring its capability =====

func TestError_UndeclaredCap_CallRead(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? fs.read { path: "test.txt" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUndeclaredCap)
}

func TestError_UndeclaredCap_DoWrite(t *testing.T) {
	diags := mustParseAndValidate(t, `
do fs.write { path: "out.txt", data: "hello" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUndeclaredCap)
}

func TestError_UndeclaredCap_WrongCap(t *testing.T) {
	// Declared fs.read but used fs.write
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
do fs.write { path: "out.txt", data: "hello" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUndeclaredCap)
}

func TestError_UndeclaredCap_HttpGet(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? http.get { url: "https://example.com" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUndeclaredCap)
}

func TestError_UndeclaredCap_ShExec(t *testing.T) {
	diags := mustParseAndValidate(t, `
do sh.exec { cmd: "ls" } -> result
return result
`)
	assertHasCode(t, diags, diagnostics.EUndeclaredCap)
}

func TestError_UndeclaredCap_MultipleMissing(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? fs.read { path: "test.txt" } -> data
do fs.write { path: "out.txt", data: "hello" } -> written
return { data: data, written: written }
`)
	count := 0
	for _, d := range diags {
		if d.Code == diagnostics.EUndeclaredCap {
			count++
		}
	}
	if count != 2 {
		t.Errorf("expected 2 E_UNDECLARED_CAP diagnostics, got %d", count)
	}
}

// ===== Combined error scenarios =====

func TestError_MultipleKinds(t *testing.T) {
	// Program with multiple different errors
	diags := mustParseAndValidate(t, `
cap { fake.cap: true }
budget { unknownField: 100 }
let x = 1
let x = 2
return y
`)
	assertHasCode(t, diags, diagnostics.EUnknownCap)
	assertHasCode(t, diags, diagnostics.EUnknownBudget)
	assertHasCode(t, diags, diagnostics.EDupBinding)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

// ===== Scoping Tests =====

func TestScoping_FnParamsInScope(t *testing.T) {
	// Function params should be visible in the body
	diags := mustParseAndValidate(t, `
fn add { a, b } {
  return a + b
}
return add { a: 1, b: 2 }
`)
	assertNoDiags(t, diags)
}

func TestScoping_FnParamsNotLeaking(t *testing.T) {
	// Function params should NOT be visible outside the function
	diags := mustParseAndValidate(t, `
fn foo { secret } {
  return secret
}
return secret
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_ForBindingInScope(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3]
for { in: items, as: "item" } {
  let doubled = item * 2
}
return items
`)
	assertNoDiags(t, diags)
}

func TestScoping_ForBindingNotLeaking(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3]
for { in: items, as: "item" } {
  let inner = 1
}
return item
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_MatchBindingInScope(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.read { path: "test.txt" } -> data
match (data) {
  ok val {
    let x = val
  }
  err e {
    let y = e
  }
}
return data
`)
	assertNoDiags(t, diags)
}

func TestScoping_TryCatchBindingInScope(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = try {
  let x = 42
} catch e {
  let msg = e
}
return result
`)
	assertNoDiags(t, diags)
}

func TestScoping_TryCatchBindingNotLeaking(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = try {
  let x = 42
} catch e {
  let msg = e
}
return e
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_IfBlockChildScopes(t *testing.T) {
	// Variables declared in if-block branches should not leak
	diags := mustParseAndValidate(t, `
let x = 10
if (x > 5) {
  let y = "then"
} else {
  let z = "else"
}
return y
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_FilterBlockBinding(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3]
let evens = filter { in: items, as: "x" } {
  return x > 2
}
return evens
`)
	assertNoDiags(t, diags)
}

func TestScoping_FilterBlockBindingNotLeaking(t *testing.T) {
	diags := mustParseAndValidate(t, `
let items = [1, 2, 3]
let evens = filter { in: items, as: "x" } {
  return x > 2
}
return x
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_LoopBinding(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = loop { in: 0, times: 5, as: "acc" } {
  return acc + 1
}
return result
`)
	assertNoDiags(t, diags)
}

func TestScoping_LoopBindingNotLeaking(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = loop { in: 0, times: 5, as: "acc" } {
  return acc + 1
}
return acc
`)
	assertHasCode(t, diags, diagnostics.EUnbound)
}

func TestScoping_ParentScopeAccessible(t *testing.T) {
	// Child scopes should be able to read parent bindings
	diags := mustParseAndValidate(t, `
let x = 10
let items = [1, 2]
for { in: items, as: "item" } {
  let y = x + item
}
return x
`)
	assertNoDiags(t, diags)
}

// ===== Edge cases =====

func TestEdge_EmptyBudget(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget {}
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestEdge_EmptyCap(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap {}
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestEdge_FnDeclBeforeUse(t *testing.T) {
	// Functions are hoisted (collected in first pass), so can be used before declaration
	diags := mustParseAndValidate(t, `
let result = myFn { x: 1 }
fn myFn { x } {
  return x * 2
}
return result
`)
	assertNoDiags(t, diags)
}

func TestEdge_FnCallWithinFn(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn double { x } {
  return x * 2
}
fn quadruple { x } {
  return double { x: double { x: x } }
}
return quadruple { x: 3 }
`)
	assertNoDiags(t, diags)
}

func TestEdge_FsListAndFsExists(t *testing.T) {
	// fs.list and fs.exists are read tools under fs.read capability
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.list { path: "." } -> files
call? fs.exists { path: "test.txt" } -> exists
return { files: files, exists: exists }
`)
	assertNoDiags(t, diags)
}

func TestEdge_CallEffect_FsListNotEffect(t *testing.T) {
	// fs.list is a read tool, so call? is correct
	diags := mustParseAndValidate(t, `
cap { fs.read: true }
call? fs.list { path: "." } -> files
return files
`)
	assertNoDiags(t, diags)
}

func TestEdge_AllKnownTools_ReadMode(t *testing.T) {
	// All read-mode tools with call?
	diags := mustParseAndValidate(t, `
cap { fs.read: true, http.get: true }
call? fs.read { path: "test.txt" } -> a
call? fs.list { path: "." } -> b
call? fs.exists { path: "test.txt" } -> c
call? http.get { url: "https://example.com" } -> d
return { a: a, b: b, c: c, d: d }
`)
	assertNoDiags(t, diags)
}

func TestEdge_AllKnownTools_EffectMode(t *testing.T) {
	// All effect-mode tools with do
	diags := mustParseAndValidate(t, `
cap { fs.write: true, sh.exec: true }
do fs.write { path: "out.txt", data: "hello" } -> a
do sh.exec { cmd: "echo hello" } -> b
return { a: a, b: b }
`)
	assertNoDiags(t, diags)
}

func TestEdge_FloatBudget(t *testing.T) {
	// Float values should be accepted for budget fields
	diags := mustParseAndValidate(t, `
budget { timeMs: 1000.5 }
return "ok"
`)
	assertNoDiags(t, diags)
}

func TestEdge_DupBindingInChildScope(t *testing.T) {
	// Different scopes can use same binding name
	diags := mustParseAndValidate(t, `
fn foo { x } {
  let inner = x
  return inner
}
fn bar { x } {
  let inner = x * 2
  return inner
}
return foo { x: 1 }
`)
	assertNoDiags(t, diags)
}

func TestEdge_ReturnNonRecord(t *testing.T) {
	// v0.5: return accepts any expression
	diags := mustParseAndValidate(t, `return [1, 2, 3]`)
	assertNoDiags(t, diags)
}

func TestEdge_ReturnNull(t *testing.T) {
	diags := mustParseAndValidate(t, `return null`)
	assertNoDiags(t, diags)
}

func TestEdge_ReturnBool(t *testing.T) {
	diags := mustParseAndValidate(t, `return true`)
	assertNoDiags(t, diags)
}

func TestEdge_NestedExpressions(t *testing.T) {
	diags := mustParseAndValidate(t, `
let a = 1
let b = 2
let c = (a + b) * (a - b)
return c
`)
	assertNoDiags(t, diags)
}

func TestEdge_ComplexProgram(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.read: true, http.get: true }
budget { timeMs: 10000, maxToolCalls: 5, maxIterations: 100 }

fn process { item } {
  let doubled = item * 2
  return doubled
}

let items = [1, 2, 3, 4, 5]
let filtered = filter { in: items, as: "x" } {
  return x > 2
}

call? fs.read { path: "config.json" } -> config

let result = loop { in: 0, times: 3, as: "acc" } {
  return acc + 1
}

return { filtered: filtered, config: config, result: result }
`)
	assertNoDiags(t, diags)
}

// ===== Table-driven tests for all known stdlib functions =====

func TestValid_AllStdlibFunctions(t *testing.T) {
	// Verify that calling all known stdlib functions produces no E_UNKNOWN_FN
	stdlibFns := []struct {
		name string
		call string
	}{
		{"eq", `eq { a: 1, b: 2 }`},
		{"not", `not { val: true }`},
		{"and", `and { a: true, b: false }`},
		{"or", `or { a: true, b: false }`},
		{"coalesce", `coalesce { a: null, b: 1 }`},
		{"typeof", `typeof { val: 1 }`},
		{"len", `len { list: [1, 2] }`},
		{"append", `append { list: [1], item: 2 }`},
		{"concat", `concat { a: [1], b: [2] }`},
		{"sort", `sort { list: [3, 1, 2] }`},
		{"filter", `filter { list: [1, 2, 3], by: "x" }`},
		{"find", `find { list: [1, 2], by: "x" }`},
		{"range", `range { start: 0, end: 5 }`},
		{"join", `join { list: ["a", "b"], sep: "," }`},
		{"unique", `unique { list: [1, 1, 2] }`},
		{"pluck", `pluck { list: [1, 2], key: "x" }`},
		{"flat", `flat { list: [[1], [2]] }`},
		{"get", `get { obj: {}, path: "a" }`},
		{"put", `put { obj: {}, path: "a", val: 1 }`},
		{"patch", `patch { target: {}, ops: [] }`},
		{"parse.json", `parse.json { str: "{}" }`},
		{"keys", `keys { obj: {} }`},
		{"values", `values { obj: {} }`},
		{"merge", `merge { a: {}, b: {} }`},
		{"entries", `entries { obj: {} }`},
		{"math.max", `math.max { a: 1, b: 2 }`},
		{"math.min", `math.min { a: 1, b: 2 }`},
		{"str.concat", `str.concat { a: "hello", b: " world" }`},
		{"str.split", `str.split { str: "a,b", sep: "," }`},
		{"str.starts", `str.starts { str: "hello", prefix: "he" }`},
		{"str.ends", `str.ends { str: "hello", suffix: "lo" }`},
		{"str.replace", `str.replace { str: "hello", old: "l", new: "r" }`},
		{"str.template", `str.template { tmpl: "hi {name}", vars: { name: "world" } }`},
		{"map", `map { list: [1, 2], fn: "x" }`},
		{"reduce", `reduce { list: [1, 2], init: 0, fn: "x" }`},
		{"contains", `contains { list: [1, 2], item: 1 }`},
	}

	for _, tc := range stdlibFns {
		t.Run(tc.name, func(t *testing.T) {
			source := "let result = " + tc.call + "\nreturn result"
			diags := mustParseAndValidate(t, source)
			for _, d := range diags {
				if d.Code == diagnostics.EUnknownFn {
					t.Errorf("stdlib function %q produced E_UNKNOWN_FN: %s", tc.name, d.Message)
				}
			}
		})
	}
}

// ===== Table-driven tests for known tools =====

func TestValid_AllKnownTools(t *testing.T) {
	tools := []struct {
		name string
		mode string // "call?" or "do"
		cap  string
	}{
		{"fs.read", "call?", "fs.read"},
		{"fs.write", "do", "fs.write"},
		{"fs.list", "call?", "fs.read"},
		{"fs.exists", "call?", "fs.read"},
		{"http.get", "call?", "http.get"},
		{"sh.exec", "do", "sh.exec"},
	}

	for _, tc := range tools {
		t.Run(tc.name+"_"+tc.mode, func(t *testing.T) {
			source := `
cap { ` + tc.cap + `: true }
` + tc.mode + ` ` + tc.name + ` { arg: "test" } -> result
return result
`
			diags := mustParseAndValidate(t, source)
			assertNoDiags(t, diags)
		})
	}
}

// ===== Diagnostic message content verification =====

func TestMessage_UnknownCap(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { db.query: true }
return "ok"
`)
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownCap {
			if !strings.Contains(d.Message, "db.query") {
				t.Errorf("expected diagnostic message to mention 'db.query', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNKNOWN_CAP diagnostic found")
}

func TestMessage_DupBinding(t *testing.T) {
	diags := mustParseAndValidate(t, `
let myVar = 1
let myVar = 2
return myVar
`)
	for _, d := range diags {
		if d.Code == diagnostics.EDupBinding {
			if !strings.Contains(d.Message, "myVar") {
				t.Errorf("expected diagnostic message to mention 'myVar', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_DUP_BINDING diagnostic found")
}

func TestMessage_Unbound(t *testing.T) {
	diags := mustParseAndValidate(t, `return missingVar`)
	for _, d := range diags {
		if d.Code == diagnostics.EUnbound {
			if !strings.Contains(d.Message, "missingVar") {
				t.Errorf("expected diagnostic message to mention 'missingVar', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNBOUND diagnostic found")
}

func TestMessage_UnknownFn(t *testing.T) {
	diags := mustParseAndValidate(t, `
let result = mystery { x: 1 }
return result
`)
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownFn {
			if !strings.Contains(d.Message, "mystery") {
				t.Errorf("expected diagnostic message to mention 'mystery', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNKNOWN_FN diagnostic found")
}

func TestMessage_UnknownTool(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? fake.tool { x: 1 } -> result
return result
`)
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownTool {
			if !strings.Contains(d.Message, "fake.tool") {
				t.Errorf("expected diagnostic message to mention 'fake.tool', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNKNOWN_TOOL diagnostic found")
}

func TestMessage_CallEffect(t *testing.T) {
	diags := mustParseAndValidate(t, `
cap { fs.write: true }
call? fs.write { path: "out.txt", data: "x" } -> result
return result
`)
	for _, d := range diags {
		if d.Code == diagnostics.ECallEffect {
			if !strings.Contains(d.Message, "fs.write") {
				t.Errorf("expected diagnostic message to mention 'fs.write', got: %s", d.Message)
			}
			if !strings.Contains(d.Message, "do") {
				t.Errorf("expected diagnostic message to suggest 'do', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_CALL_EFFECT diagnostic found")
}

func TestMessage_UndeclaredCap(t *testing.T) {
	diags := mustParseAndValidate(t, `
call? fs.read { path: "test.txt" } -> result
return result
`)
	for _, d := range diags {
		if d.Code == diagnostics.EUndeclaredCap {
			if !strings.Contains(d.Message, "fs.read") {
				t.Errorf("expected diagnostic message to mention 'fs.read', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNDECLARED_CAP diagnostic found")
}

func TestMessage_UnknownBudget(t *testing.T) {
	diags := mustParseAndValidate(t, `
budget { weirdField: 100 }
return "ok"
`)
	for _, d := range diags {
		if d.Code == diagnostics.EUnknownBudget {
			if !strings.Contains(d.Message, "weirdField") {
				t.Errorf("expected diagnostic message to mention 'weirdField', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_UNKNOWN_BUDGET diagnostic found")
}

func TestMessage_FnDup(t *testing.T) {
	diags := mustParseAndValidate(t, `
fn myFunc { x } {
  return x
}
fn myFunc { y } {
  return y
}
return myFunc { x: 1 }
`)
	for _, d := range diags {
		if d.Code == diagnostics.EFnDup {
			if !strings.Contains(d.Message, "myFunc") {
				t.Errorf("expected diagnostic message to mention 'myFunc', got: %s", d.Message)
			}
			return
		}
	}
	t.Errorf("no E_FN_DUP diagnostic found")
}
