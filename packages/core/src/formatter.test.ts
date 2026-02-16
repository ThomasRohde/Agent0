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
});
