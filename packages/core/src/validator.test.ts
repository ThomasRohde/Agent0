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

  it("reports return not last", () => {
    const src = `return {}\nlet x = 1`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const diags = validate(pr.program);
    assert.ok(diags.some((d) => d.code === "E_RETURN_NOT_LAST"));
  });
});
