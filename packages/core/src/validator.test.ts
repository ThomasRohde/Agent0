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

  it("accepts all known capabilities", () => {
    const src = `cap { fs.read: true, fs.write: true, http.read: true, http.get: true, sh.exec: true }\nreturn {}`;
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
});
