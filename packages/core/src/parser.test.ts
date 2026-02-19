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

  it("parses do expression", () => {
    const src = `do fs.write { path: "out.txt", data: "hello" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const stmt = result.program.statements[0];
    assert.equal(stmt.kind, "ExprStmt");
    if (stmt.kind === "ExprStmt") {
      assert.equal(stmt.expr.kind, "DoExpr");
    }
  });

  it("parses budget header", () => {
    const src = `budget { timeMs: 5000, maxToolCalls: 10 }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.headers.length, 1);
    assert.equal(result.program.headers[0].kind, "BudgetDecl");
  });

  it("parses multiple headers", () => {
    const src = `cap { fs.read: true }\nbudget { timeMs: 5000 }\nimport "utils" as u\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.headers.length, 3);
    assert.equal(result.program.headers[0].kind, "CapDecl");
    assert.equal(result.program.headers[1].kind, "BudgetDecl");
    assert.equal(result.program.headers[2].kind, "ImportDecl");
  });

  it("parses trailing commas in records", () => {
    const src = `return { x: 1, y: 2, }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses trailing commas in lists", () => {
    const src = `let items = [1, 2, 3,]\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses empty record", () => {
    const src = `return {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const ret = result.program.statements[0];
    if (ret.kind === "ReturnStmt") {
      assert.equal(ret.value.pairs.length, 0);
    }
  });

  it("parses empty list", () => {
    const src = `let items = []\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const letStmt = result.program.statements[0];
    if (letStmt.kind === "LetStmt" && letStmt.value.kind === "ListExpr") {
      assert.equal(letStmt.value.elements.length, 0);
    }
  });

  it("parses negative numbers as UnaryExpr", () => {
    const src = `let x = -42\nlet y = -3.14\nreturn { x: x, y: y }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      assert.equal(result.program.statements[0].value.kind, "UnaryExpr");
      if (result.program.statements[0].value.kind === "UnaryExpr") {
        assert.equal(result.program.statements[0].value.op, "-");
        assert.equal(result.program.statements[0].value.operand.kind, "IntLiteral");
      }
    }
    if (result.program.statements[1].kind === "LetStmt") {
      assert.equal(result.program.statements[1].value.kind, "UnaryExpr");
      if (result.program.statements[1].value.kind === "UnaryExpr") {
        assert.equal(result.program.statements[1].value.operand.kind, "FloatLiteral");
      }
    }
  });

  it("parses arrow target with do expression", () => {
    const src = `do fs.write { path: "out.txt", data: "hi" } -> result\nreturn { result: result }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const stmt = result.program.statements[0];
    if (stmt.kind === "ExprStmt") {
      assert.ok(stmt.target);
      assert.equal(stmt.target!.parts[0], "result");
    }
  });

  it("parses dotted record keys", () => {
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.headers[0].kind === "CapDecl") {
      assert.equal(result.program.headers[0].capabilities.pairs[0].key, "fs.read");
      assert.equal(result.program.headers[0].capabilities.pairs[1].key, "http.get");
    }
  });

  it("parses deeply nested path access", () => {
    const src = `let data = { a: { b: { c: 1 } } }\nreturn { val: data.a.b.c }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses mixed list elements", () => {
    const src = `let items = [1, "two", true, null, 3.14]\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("returns diagnostics for unclosed string", () => {
    const result = parse('let x = "unclosed', "test.a0");
    assert.ok(result.diagnostics.length > 0);
  });

  it("parses check with arrow target", () => {
    const src = `check { that: true, msg: "ok" } -> ev\nreturn { ev: ev }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const stmt = result.program.statements[0];
    if (stmt.kind === "ExprStmt") {
      assert.equal(stmt.expr.kind, "CheckExpr");
      assert.ok(stmt.target);
    }
  });

  it("parses assert with arrow target", () => {
    const src = `assert { that: true, msg: "ok" } -> ev\nreturn { ev: ev }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses string with escape sequences", () => {
    const src = `let s = "line1\\nline2\\ttab"\nreturn { s: s }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      const val = result.program.statements[0].value;
      if (val.kind === "StrLiteral") {
        assert.equal(val.value, "line1\nline2\ttab");
      }
    }
  });

  it("provides span information on AST nodes", () => {
    const src = `let x = 42\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    assert.equal(result.program.span.file, "test.a0");
    assert.equal(result.program.span.startLine, 1);
    const letStmt = result.program.statements[0];
    assert.ok(letStmt.span);
    assert.equal(letStmt.span.startLine, 1);
  });

  it("uses default file name for stdin", () => {
    const result = parse("return {}");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    assert.equal(result.program.span.file, "<stdin>");
  });

  it("provides accurate span positions for multi-line programs", () => {
    const src = `let x = 42\nlet y = "hello"\nreturn { x: x, y: y }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);

    // Program spans the entire source
    assert.equal(result.program.span.startLine, 1);
    assert.equal(result.program.span.endLine, 3);

    // First let statement on line 1
    const let1 = result.program.statements[0];
    assert.equal(let1.span.startLine, 1);
    assert.equal(let1.span.startCol, 1);

    // Second let statement on line 2
    const let2 = result.program.statements[1];
    assert.equal(let2.span.startLine, 2);
    assert.equal(let2.span.startCol, 1);

    // Return statement on line 3
    const ret = result.program.statements[2];
    assert.equal(ret.span.startLine, 3);
    assert.equal(ret.span.startCol, 1);
  });

  it("provides accurate span for call? expression on line 2", () => {
    const src = `cap { fs.read: true }\ncall? fs.read { path: "/tmp" } -> res\nreturn { res: res }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);

    // call? is on line 2
    const exprStmt = result.program.statements[0];
    assert.equal(exprStmt.span.startLine, 2);
    if (exprStmt.kind === "ExprStmt" && exprStmt.expr.kind === "CallExpr") {
      assert.equal(exprStmt.expr.span.startLine, 2);
    }
  });

  it("parses binary arithmetic expression", () => {
    const src = `let x = 2 + 3\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      const val = result.program.statements[0].value;
      assert.equal(val.kind, "BinaryExpr");
      if (val.kind === "BinaryExpr") {
        assert.equal(val.op, "+");
        assert.equal(val.left.kind, "IntLiteral");
        assert.equal(val.right.kind, "IntLiteral");
      }
    }
  });

  it("parses operator precedence (* before +)", () => {
    const src = `let x = 2 + 3 * 4\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      const val = result.program.statements[0].value;
      assert.equal(val.kind, "BinaryExpr");
      if (val.kind === "BinaryExpr") {
        assert.equal(val.op, "+");
        assert.equal(val.left.kind, "IntLiteral");
        assert.equal(val.right.kind, "BinaryExpr");
        if (val.right.kind === "BinaryExpr") {
          assert.equal(val.right.op, "*");
        }
      }
    }
  });

  it("parses parenthesized expressions", () => {
    const src = `let x = (2 + 3) * 4\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    if (result.program.statements[0].kind === "LetStmt") {
      const val = result.program.statements[0].value;
      assert.equal(val.kind, "BinaryExpr");
      if (val.kind === "BinaryExpr") {
        assert.equal(val.op, "*");
        assert.equal(val.left.kind, "BinaryExpr");
        if (val.left.kind === "BinaryExpr") {
          assert.equal(val.left.op, "+");
        }
      }
    }
  });

  it("parses comparison operators", () => {
    const src = `let a = 1 > 2\nlet b = 3 <= 4\nlet c = 5 == 5\nlet d = 6 != 7\nreturn { a: a, b: b, c: c, d: d }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
    const stmts = result.program.statements;
    if (stmts[0].kind === "LetStmt") assert.equal(stmts[0].value.kind, "BinaryExpr");
    if (stmts[1].kind === "LetStmt") assert.equal(stmts[1].value.kind, "BinaryExpr");
    if (stmts[2].kind === "LetStmt") assert.equal(stmts[2].value.kind, "BinaryExpr");
    if (stmts[3].kind === "LetStmt") assert.equal(stmts[3].value.kind, "BinaryExpr");
  });

  it("parses all arithmetic operators", () => {
    for (const op of ["+", "-", "*", "/", "%"]) {
      const src = `let x = 10 ${op} 3\nreturn { x: x }`;
      const result = parse(src, "test.a0");
      assert.equal(result.diagnostics.length, 0, `Failed for operator ${op}`);
      assert.ok(result.program);
    }
  });

  it("parses match with identPath subject", () => {
    const src = `let r = { ok: 1 }\nlet x = match r { ok { v } { return { v: v } } err { e } { return { e: e } } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("parses match with parenthesized expression subject", () => {
    const src = `let x = match ({ ok: 42 }) { ok { v } { return { v: v } } err { e } { return { e: e } } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.program);
  });

  it("rejects match arm with empty binding list", () => {
    const src = `let x = match ({ ok: 42 }) { ok { } { return { v: 1 } } err { e } { return { e: e } } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
  });

  it("rejects match arm with multiple bindings", () => {
    const src = `let x = match ({ ok: 42 }) { ok { a, b } { return { v: a } } err { e } { return { e: e } } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
  });

  it("reports E_PARSE for if expression missing required fields", () => {
    const src = `let x = if { cond: true, then: 1 }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
    assert.ok(result.diagnostics[0].message.includes("if expression requires cond, then, and else fields"));
  });

  it("reports E_PARSE for for expression missing required fields", () => {
    const src = `let x = for { in: [1, 2, 3] } { return { x: 1 } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
    assert.ok(result.diagnostics[0].message.includes("for expression requires 'in' and 'as' fields"));
  });

  it("reports E_PARSE for invalid match arm tags", () => {
    const src = `let r = { ok: 1 }\nlet x = match r { maybe { v } { return { v: v } } err { e } { return { e: e } } }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].code, "E_PARSE");
    assert.ok(result.diagnostics[0].message.includes("match arm must be 'ok' or 'err'"));
  });
});
