/**
 * Tests for the A0 parser.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parse } from "./parser.js";

describe("A0 Parser", () => {
  it("parses a minimal program with return", () => {
    const result = parse('return { ok: true }', "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.kind, "Program");
    assert.equal(result.program.statements.length, 1);
    assert.equal(result.program.statements[0].kind, "ReturnStmt");
  });

  it("parses let bindings", () => {
    const src = `let x = 42\nlet y = "hello"\nreturn { x: x, y: y }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.statements.length, 3);
    assert.equal(result.program.statements[0].kind, "LetStmt");
    const letStmt = result.program.statements[0];
    if (letStmt.kind === "LetStmt") {
      assert.equal(letStmt.name, "x");
      assert.equal(letStmt.value.kind, "IntLiteral");
    }
  });

  it("parses cap header", () => {
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.headers.length, 1);
    assert.equal(result.program.headers[0].kind, "CapDecl");
  });

  it("parses call? and do expressions", () => {
    const src = `cap { fs.read: true }\ncall? fs.read { path: "/tmp/x" } -> content\nreturn { content: content }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const exprStmt = result.program.statements[0];
    assert.equal(exprStmt.kind, "ExprStmt");
    if (exprStmt.kind === "ExprStmt") {
      assert.equal(exprStmt.expr.kind, "CallExpr");
    }
  });

  it("parses assert and check", () => {
    const src = `assert { that: true, msg: "test" }\ncheck { that: false, msg: "fail" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.statements.length, 3);
  });

  it("parses lists", () => {
    const src = `let items = [1, 2, 3]\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses float literals", () => {
    const src = `let pi = 3.14\nreturn { pi: pi }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      assert.equal(result.program.statements[0].value.kind, "FloatLiteral");
    }
  });

  it("parses nested records", () => {
    const src = `let data = { a: { b: 1 } }\nreturn { data: data }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses import header", () => {
    const src = `import "utils" as u\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.headers[0].kind, "ImportDecl");
    if (result.program.headers[0].kind === "ImportDecl") {
      assert.equal(result.program.headers[0].path, "utils");
      assert.equal(result.program.headers[0].alias, "u");
    }
  });

  it("returns diagnostics for syntax errors", () => {
    const result = parse('return {', "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
  });

  it("parses boolean and null literals", () => {
    const src = `let a = true\nlet b = false\nlet c = null\nreturn { a: a, b: b, c: c }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses function call syntax", () => {
    const src = `let x = parse.json { in: "{}" }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      assert.equal(result.program.statements[0].value.kind, "FnCallExpr");
    }
  });

  it("parses comments", () => {
    const src = `# this is a comment\nlet x = 1 # inline comment\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });
});
