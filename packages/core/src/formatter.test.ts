/**
 * Tests for the A0 formatter.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parse } from "./parser.js";
import { format } from "./formatter.js";

describe("A0 Formatter", () => {
  it("formats a simple program", () => {
    const src = `let x=42\nreturn {x:x}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = 42"));
    assert.ok(formatted.includes("return { x: x }"));
  });

  it("is idempotent", () => {
    const src = `let x = 42\nlet y = "hello"\nreturn { x: x, y: y }`;
    const result1 = parse(src, "test.a0");
    assert.ok(result1.program);
    const fmt1 = format(result1.program);
    const result2 = parse(fmt1, "test.a0");
    assert.ok(result2.program);
    const fmt2 = format(result2.program);
    assert.equal(fmt1, fmt2, "Formatting should be idempotent");
  });

  it("preserves string contents", () => {
    const src = `let msg = "hello world"\nreturn { msg: msg }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('"hello world"'));
  });

  it("formats cap headers", () => {
    const src = `cap { fs.read: true }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("cap { fs.read: true }"));
  });

  it("formatted output parses identically", () => {
    const src = `cap {fs.read:true}\nlet x=42\nreturn {x:x}`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt = format(r1.program);
    const r2 = parse(fmt, "test.a0");
    assert.equal(r2.diagnostics.length, 0, "Formatted output should parse without errors");
    assert.ok(r2.program);
  });

  it("formats do expressions", () => {
    const src = `do fs.write { path: "out.txt", data: "hello" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('do fs.write { path: "out.txt", data: "hello" }'));
  });

  it("formats call? expressions", () => {
    const src = `call? fs.read { path: "test.txt" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('call? fs.read { path: "test.txt" }'));
  });

  it("formats assert expressions", () => {
    const src = `assert { that: true, msg: "ok" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('assert { that: true, msg: "ok" }'));
  });

  it("formats check expressions", () => {
    const src = `check { that: true, msg: "ok" }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('check { that: true, msg: "ok" }'));
  });

  it("formats lists", () => {
    const src = `let items = [1, 2, 3]\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("[1, 2, 3]"));
  });

  it("formats empty record", () => {
    const src = `return {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("return {}"));
  });

  it("formats empty list", () => {
    const src = `let items = []\nreturn { items: items }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("[]"));
  });

  it("formats import header", () => {
    const src = `import "utils" as u\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('import "utils" as u'));
  });

  it("formats budget header", () => {
    const src = `budget { timeMs: 5000 }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("budget { timeMs: 5000 }"));
  });

  it("formats null literal", () => {
    const src = `let x = null\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = null"));
  });

  it("formats boolean literals", () => {
    const src = `let a = true\nlet b = false\nreturn { a: a, b: b }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let a = true"));
    assert.ok(formatted.includes("let b = false"));
  });

  it("formats float literals", () => {
    const src = `let pi = 3.14\nreturn { pi: pi }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let pi = 3.14"));
  });

  it("keeps whole-number float literals as float tokens", () => {
    const src = `budget { timeMs: 1.0 }\nreturn {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("budget { timeMs: 1.0 }"));
  });

  it("formats scientific notation floats into parseable decimal form", () => {
    const src = `let tiny = 1.0e-7\nreturn { tiny: tiny }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let tiny = 0.0000001"));

    const reparsed = parse(formatted, "test.a0");
    assert.equal(reparsed.diagnostics.length, 0, "Formatted scientific notation should reparse");
    assert.ok(reparsed.program);
  });

  it("formats expression with arrow target", () => {
    const src = `{ x: 1 } -> data\nreturn { data: data }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("-> data"));
  });

  it("formats function call expressions", () => {
    const src = `let x = parse.json { in: "{}" }\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('parse.json { in: "{}" }'));
  });

  it("adds blank line between headers and statements", () => {
    const src = `cap { fs.read: true }\nlet x = 1\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    const lines = formatted.split("\n");
    // After cap header there should be a blank line
    assert.equal(lines[1], "");
  });

  it("formats output ending with newline", () => {
    const src = `return {}`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.endsWith("\n"));
  });

  it("is idempotent for complex programs", () => {
    const src = `cap { fs.read: true, http.get: true }
budget { timeMs: 5000 }
import "utils" as u
let data = { a: 1, b: [2, 3], c: { d: true } }
assert { that: true, msg: "ok" }
call? fs.read { path: "test.txt" } -> content
return { data: data, content: content }`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Complex program formatting should be idempotent");
  });

  // --- BinaryExpr / UnaryExpr formatting ---

  it("formats binary arithmetic", () => {
    const src = `let x = 2 + 3\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = 2 + 3"));
  });

  it("formats binary with correct precedence (no unnecessary parens)", () => {
    const src = `let x = 2 + 3 * 4\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = 2 + 3 * 4"));
  });

  it("formats parenthesized expressions", () => {
    const src = `let x = (2 + 3) * 4\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = (2 + 3) * 4"));
  });

  it("formats comparison operators", () => {
    const src = `let x = 5 > 3\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = 5 > 3"));
  });

  it("formats unary minus", () => {
    const src = `let x = -42\nreturn { x: x }`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("let x = -42"));
  });

  // --- bare expression returns ---

  it("formats bare integer return", () => {
    const src = `return 42`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("return 42"));
  });

  it("formats bare string return", () => {
    const src = `return "hello"`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('return "hello"'));
  });

  it("formats bare expression return", () => {
    const src = `let a = 1\nreturn a + 2`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("return a + 2"));
  });

  it("formats bare list return", () => {
    const src = `return [1, 2, 3]`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("return [1, 2, 3]"));
  });

  it("bare return is idempotent", () => {
    const src = `let x = 10\nreturn x * 2`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Bare return formatting should be idempotent");
  });

  it("is idempotent for arithmetic expressions", () => {
    const src = `let x = (2 + 3) * 4\nlet y = -x\nlet z = x > 10\nreturn { x: x, y: y, z: z }`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Arithmetic formatting should be idempotent");
  });

  // --- filter block formatting ---

  it("formats filter block expression", () => {
    const src = `let result = filter { in: nums, as: "x" } {\n  return x > 0\n}\nreturn result`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('filter { in: nums, as: "x" } {'));
    assert.ok(formatted.includes("return x > 0"));
  });

  it("filter block is idempotent", () => {
    const src = `let result = filter { in: nums, as: "x" } {\n  return x > 0\n}\nreturn result`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Filter block formatting should be idempotent");
  });

  // --- loop formatting ---

  it("formats loop expression", () => {
    const src = `let result = loop { in: 0, times: 5, as: "x" } {\n  return x + 1\n}\nreturn result`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes('loop { in: 0, times: 5, as: "x" } {'));
    assert.ok(formatted.includes("return x + 1"));
  });

  it("loop is idempotent", () => {
    const src = `let result = loop { in: 0, times: 5, as: "x" } {\n  return x + 1\n}\nreturn result`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Loop formatting should be idempotent");
  });

  // --- record spread formatting ---

  it("formats record spread", () => {
    const src = `let base = { a: 1 }\nlet ext = { ...base, b: 2 }\nreturn ext`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("{ ...base, b: 2 }"));
  });

  it("spread formatting is idempotent", () => {
    const src = `let base = { a: 1 }\nlet ext = { ...base, c: 3 }\nreturn ext`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Spread formatting should be idempotent");
  });

  // --- try/catch formatting ---

  it("formats try/catch expression", () => {
    const src = `let result = try {\n  return 42\n} catch { e } {\n  return e\n}\nreturn result`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("try {"));
    assert.ok(formatted.includes("} catch { e } {"));
    assert.ok(formatted.includes("return 42"));
    assert.ok(formatted.includes("return e"));
  });

  it("try/catch formatting is idempotent", () => {
    const src = `let result = try {\n  return 42\n} catch { e } {\n  return e\n}\nreturn result`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Try/catch formatting should be idempotent");
  });

  // --- block if/else formatting ---

  it("formats block if/else expression", () => {
    const src = `let result = if (true) {\n  return "yes"\n} else {\n  return "no"\n}\nreturn result`;
    const result = parse(src, "test.a0");
    assert.ok(result.program);
    const formatted = format(result.program);
    assert.ok(formatted.includes("if (true) {"));
    assert.ok(formatted.includes("} else {"));
    assert.ok(formatted.includes('return "yes"'));
    assert.ok(formatted.includes('return "no"'));
  });

  it("block if/else formatting is idempotent", () => {
    const src = `let result = if (true) {\n  return "yes"\n} else {\n  return "no"\n}\nreturn result`;
    const r1 = parse(src, "test.a0");
    assert.ok(r1.program);
    const fmt1 = format(r1.program);
    const r2 = parse(fmt1, "test.a0");
    assert.ok(r2.program);
    const fmt2 = format(r2.program);
    assert.equal(fmt1, fmt2, "Block if/else formatting should be idempotent");
  });
});
