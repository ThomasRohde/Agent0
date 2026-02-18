/**
 * Tests for the A0 validator.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parse } from "./parser.js";
import { validate } from "./validator.js";

describe("A0 Validator", () => {
  it("valid program has no diagnostics", () => {
    const src = `let x = 42\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports missing return", () => {
    const src = `let x = 42`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_NO_RETURN"));
  });

  it("reports unknown capability", () => {
    const src = `cap { unknown.thing: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_CAP"));
  });

  it("reports unbound variable", () => {
    const src = `return { x: undeclared }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("reports duplicate binding", () => {
    const src = `let x = 1\nlet x = 2\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_DUP_BINDING"));
  });

  it("accepts valid capabilities", () => {
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports E_CAP_VALUE when capability is false", () => {
    const src = `cap { fs.read: false }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_CAP_VALUE"));
  });

  it("reports E_CAP_VALUE when capability is non-boolean", () => {
    const src = `cap { fs.read: 1 }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_CAP_VALUE"));
  });

  it("reports undeclared capability when cap value is not true", () => {
    const src = `cap { fs.read: false }\ncall? fs.read { path: "x" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_CAP_VALUE"));
    assert.ok(diags.some((d) => d.code === "E_UNDECLARED_CAP"));
  });

  it("reports return not last", () => {
    const src = `return {}\nlet x = 1`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_RETURN_NOT_LAST"));
  });

  it("accepts all known capabilities", () => {
    const src = `cap { fs.read: true, fs.write: true, http.get: true, sh.exec: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports unbound variable in call? args", () => {
    const src = `call? fs.read { path: unknownVar }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("reports unbound variable in do args", () => {
    const src = `do fs.write { path: "out.txt", data: unknownVar }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("reports unbound variable in assert args", () => {
    const src = `assert { that: unknownVar, msg: "test" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("reports unbound variable in list expression", () => {
    const src = `let items = [1, unknownVar, 3]\nreturn { items: items }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("reports unbound variable in nested record", () => {
    const src = `return { data: { inner: unknownVar } }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("accepts -> target as binding for later use", () => {
    const src = `{ x: 1 } -> data\nreturn { data: data }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("validates let then arrow target usage", () => {
    const src = `let x = 1\nassert { that: true, msg: "ok" } -> ev\nreturn { x: x, ev: ev }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports unbound in function call args", () => {
    const src = `let x = parse.json { in: unknownVar }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("validates program with no statements", () => {
    // Just headers, no statements
    const src = `cap { fs.read: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_NO_RETURN"));
  });

  it("accepts program with only return", () => {
    const src = `return { ok: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports multiple unknown capabilities", () => {
    const src = `cap { bad.one: true, bad.two: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const unknownCapDiags = diags.filter((d) => d.code === "E_UNKNOWN_CAP");
    assert.equal(unknownCapDiags.length, 2);
  });

  it("reports multiple errors simultaneously", () => {
    const src = `cap { unknown.thing: true }\nlet x = 1\nlet x = 2\nreturn { x: x, y: undeclared }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_CAP"));
    assert.ok(diags.some((d) => d.code === "E_DUP_BINDING"));
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  // --- E_UNDECLARED_CAP tests ---

  it("reports undeclared capability for call?", () => {
    const src = `call? fs.read { path: "test" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNDECLARED_CAP"));
  });

  it("reports undeclared capability for do", () => {
    const src = `do fs.write { path: "out", data: "hi" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNDECLARED_CAP"));
  });

  it("accepts tool usage when cap is declared", () => {
    const src = `cap { fs.read: true }\ncall? fs.read { path: "test" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const undeclaredDiags = diags.filter((d) => d.code === "E_UNDECLARED_CAP");
    assert.equal(undeclaredDiags.length, 0);
  });

  it("reports multiple undeclared capabilities", () => {
    const src = `call? fs.read { path: "test" }\ndo fs.write { path: "out", data: "hi" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const undeclaredDiags = diags.filter((d) => d.code === "E_UNDECLARED_CAP");
    assert.equal(undeclaredDiags.length, 2);
  });

  it("no diagnostic when no tools are used", () => {
    const src = `return { ok: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const undeclaredDiags = diags.filter((d) => d.code === "E_UNDECLARED_CAP");
    assert.equal(undeclaredDiags.length, 0);
  });

  it("reports undeclared for one but not another", () => {
    const src = `cap { fs.read: true }\ncall? fs.read { path: "x" }\ndo fs.write { path: "y", data: "z" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const undeclaredDiags = diags.filter((d) => d.code === "E_UNDECLARED_CAP");
    assert.equal(undeclaredDiags.length, 1);
    assert.ok(undeclaredDiags[0].message.includes("fs.write"));
  });

  // --- Budget validation tests ---

  it("reports unknown budget field", () => {
    const src = `budget { unknownField: 100 }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_BUDGET"));
    const budgetDiag = diags.find((d) => d.code === "E_UNKNOWN_BUDGET")!;
    assert.ok(budgetDiag.message.includes("unknownField"));
  });

  it("accepts known budget fields", () => {
    const src = `budget { timeMs: 5000, maxToolCalls: 10, maxBytesWritten: 1024 }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const budgetDiags = diags.filter((d) => d.code === "E_UNKNOWN_BUDGET");
    assert.equal(budgetDiags.length, 0);
  });

  it("reports E_BUDGET_TYPE for non-integer budget literals", () => {
    const src = `budget { timeMs: "5000", maxToolCalls: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    const typeDiags = diags.filter((d) => d.code === "E_BUDGET_TYPE");
    assert.equal(typeDiags.length, 2);
  });

  // --- E_CALL_EFFECT static check tests ---

  it("reports E_CALL_EFFECT for call? on fs.write", () => {
    const src = `cap { fs.write: true }\ncall? fs.write { path: "out.txt", data: "hi" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_CALL_EFFECT"));
    const callEffectDiag = diags.find((d) => d.code === "E_CALL_EFFECT")!;
    assert.ok(callEffectDiag.message.includes("fs.write"));
  });

  it("reports E_CALL_EFFECT for call? on sh.exec", () => {
    const src = `cap { sh.exec: true }\ncall? sh.exec { cmd: "echo hi" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_CALL_EFFECT"));
  });

  it("does not report E_CALL_EFFECT for call? on fs.read", () => {
    const src = `cap { fs.read: true }\ncall? fs.read { path: "test.txt" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_CALL_EFFECT"));
  });

  it("does not report E_CALL_EFFECT for call? on http.get", () => {
    const src = `cap { http.get: true }\ncall? http.get { url: "https://example.com" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_CALL_EFFECT"));
  });

  it("does not report E_CALL_EFFECT for do on fs.write", () => {
    const src = `cap { fs.write: true }\ndo fs.write { path: "out.txt", data: "hi" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_CALL_EFFECT"));
  });

  it("does not report E_CALL_EFFECT for unknown tools", () => {
    const src = `cap { custom.tool: true }\ncall? custom.tool { key: "val" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_CALL_EFFECT"));
  });

  // --- E_UNKNOWN_FN static check tests ---

  it("reports E_UNKNOWN_FN for forward function reference", () => {
    const src = `let x = myFn { a: 1 }\nfn myFn { a } {\n  return { a: a }\n}\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  it("no E_UNKNOWN_FN when function defined before use", () => {
    const src = `fn myFn { a } {\n  return { a: a }\n}\nlet x = myFn { a: 1 }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  it("reports E_UNKNOWN_FN for completely unknown function", () => {
    const src = `let x = nonexistent.fn { in: "hello" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  it("no E_UNKNOWN_FN for known stdlib functions", () => {
    const src = `let raw = "{\\"x\\": 1}"\nlet x = parse.json { in: raw }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  // --- E_UNKNOWN_TOOL static check tests ---

  it("reports E_UNKNOWN_TOOL for unknown tool name", () => {
    const src = `cap { fs.nope: true }\ncall? fs.nope { path: "test" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNKNOWN_TOOL"));
    assert.ok(!diags.some((d) => d.code === "E_UNDECLARED_CAP"));
  });

  it("reports E_UNDECLARED_CAP for known tool without cap, not E_UNKNOWN_TOOL", () => {
    const src = `call? fs.read { path: "test" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNDECLARED_CAP"));
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_TOOL"));
  });

  // --- BinaryExpr / UnaryExpr validation ---

  it("validates bindings in BinaryExpr", () => {
    const src = `let x = 1\nlet y = x + 2\nreturn { y: y }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports unbound variable in BinaryExpr", () => {
    const src = `let x = unknown + 2\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("validates bindings in UnaryExpr", () => {
    const src = `let x = 5\nlet y = -x\nreturn { y: y }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports unbound variable in UnaryExpr", () => {
    const src = `let x = -unknown\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("accepts new stdlib functions without E_UNKNOWN_FN", () => {
    const src = `let x = len { in: [1, 2, 3] }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  it("accepts map without E_UNKNOWN_FN", () => {
    const src = `fn double { x } {\n  return { val: x * 2 }\n}\nlet result = map { in: [1, 2], fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  it("accepts str.concat without E_UNKNOWN_FN", () => {
    const src = `let x = str.concat { parts: ["a", "b"] }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_UNKNOWN_FN"));
  });

  // --- Issue 2: Self-referential let x = x ---

  it("reports E_UNBOUND for self-referential let x = x", () => {
    const src = `let x = x\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  it("allows let x = y when y is already bound", () => {
    const src = `let y = 1\nlet x = y\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  it("reports E_UNBOUND for self-referential let in fn body", () => {
    const src = `fn myFn { a } {\n  let x = x\n  return { x: x }\n}\nlet r = myFn { a: 1 }\nreturn { r: r }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_UNBOUND"));
  });

  // --- Issue 5: Arrow target rebinding ---

  it("reports E_DUP_BINDING for arrow target rebinding", () => {
    const src = `let x = 1\n{ y: 2 } -> x\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_DUP_BINDING"));
  });

  it("reports E_DUP_BINDING for duplicate arrow targets", () => {
    const src = `{ a: 1 } -> x\n{ b: 2 } -> x\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_DUP_BINDING"));
  });

  it("accepts distinct arrow targets", () => {
    const src = `{ a: 1 } -> x\n{ b: 2 } -> y\nreturn { x: x, y: y }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.equal(diags.length, 0);
  });

  // --- Issue 4: fn name collides with stdlib ---

  it("reports E_FN_DUP when fn name collides with stdlib 'map'", () => {
    const src = `fn map { x } {\n  return { x: x }\n}\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_FN_DUP" && d.message.includes("stdlib")));
  });

  it("reports E_FN_DUP when fn name collides with stdlib 'len'", () => {
    const src = `fn len { x } {\n  return { x: x }\n}\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_FN_DUP" && d.message.includes("stdlib")));
  });

  it("accepts fn names that do not collide with stdlib", () => {
    const src = `fn myFunc { x } {\n  return { x: x }\n}\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(!diags.some((d) => d.code === "E_FN_DUP"));
  });

  it("reports E_DUP_BINDING for duplicate function parameters", () => {
    const src = `fn myFn { x, x } {\n  return { x: x }\n}\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_DUP_BINDING" && d.message.includes("Duplicate parameter")));
  });
});
