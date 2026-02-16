/**
 * Tests for A0 standard library functions.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseJsonFn } from "./parse-json.js";
import { getFn, putFn } from "./path-ops.js";
import { patchFn } from "./patch.js";
import type { A0Record, A0Value } from "@a0/core";

describe("parse.json", () => {
  it("parses valid JSON", () => {
    const result = parseJsonFn.execute({ in: '{"x": 1}' });
    assert.deepEqual(result, { x: 1 });
  });

  it("parses JSON array", () => {
    const result = parseJsonFn.execute({ in: "[1, 2, 3]" });
    assert.deepEqual(result, [1, 2, 3]);
  });

  it("returns error for invalid JSON", () => {
    const result = parseJsonFn.execute({ in: "{invalid" }) as A0Record;
    assert.ok(result["err"]);
  });

  it("returns error for non-string input", () => {
    const result = parseJsonFn.execute({ in: 42 as unknown as string }) as A0Record;
    assert.ok(result["err"]);
  });
});

describe("get", () => {
  it("gets a top-level key", () => {
    const result = getFn.execute({ in: { x: 1, y: 2 }, path: "x" });
    assert.equal(result, 1);
  });

  it("gets a nested key", () => {
    const result = getFn.execute({ in: { a: { b: { c: 42 } } }, path: "a.b.c" });
    assert.equal(result, 42);
  });

  it("returns null for missing path", () => {
    const result = getFn.execute({ in: { x: 1 }, path: "y" });
    assert.equal(result, null);
  });

  it("gets array elements", () => {
    const result = getFn.execute({ in: { items: [10, 20, 30] }, path: "items[1]" });
    assert.equal(result, 20);
  });
});

describe("put", () => {
  it("sets a top-level key", () => {
    const result = putFn.execute({ in: { x: 1 }, path: "y", value: 2 }) as A0Record;
    assert.equal(result["x"], 1);
    assert.equal(result["y"], 2);
  });

  it("creates nested keys", () => {
    const result = putFn.execute({ in: {}, path: "a.b.c", value: 42 }) as A0Record;
    const a = result["a"] as A0Record;
    const b = a["b"] as A0Record;
    assert.equal(b["c"], 42);
  });

  it("updates existing keys", () => {
    const result = putFn.execute({ in: { x: 1 }, path: "x", value: 99 }) as A0Record;
    assert.equal(result["x"], 99);
  });
});

describe("patch", () => {
  it("applies replace operation", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "replace", path: "/name", value: "Bob" }],
    }) as A0Record;
    assert.equal(result["name"], "Bob");
  });

  it("applies add operation", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "add", path: "/email", value: "alice@example.com" }],
    }) as A0Record;
    assert.equal(result["email"], "alice@example.com");
    assert.equal(result["name"], "Alice");
  });

  it("applies remove operation", () => {
    const result = patchFn.execute({
      in: { name: "Alice", age: 30 },
      ops: [{ op: "remove", path: "/age" }],
    }) as A0Record;
    assert.equal(result["name"], "Alice");
    assert.equal(result["age"], undefined);
  });

  it("applies multiple operations", () => {
    const result = patchFn.execute({
      in: { name: "Alice", age: 30 },
      ops: [
        { op: "replace", path: "/name", value: "Bob" },
        { op: "replace", path: "/age", value: 31 },
        { op: "add", path: "/email", value: "bob@example.com" },
      ],
    }) as A0Record;
    assert.equal(result["name"], "Bob");
    assert.equal(result["age"], 31);
    assert.equal(result["email"], "bob@example.com");
  });

  it("returns error for invalid ops", () => {
    const result = patchFn.execute({ in: {}, ops: "not an array" as unknown as A0Value }) as A0Record;
    assert.ok(result["err"]);
  });

  it("applies test operation (success)", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "test", path: "/name", value: "Alice" }],
    }) as A0Record;
    assert.equal(result["name"], "Alice");
  });

  it("applies test operation (failure)", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "test", path: "/name", value: "Bob" }],
    }) as A0Record;
    assert.ok(result["err"]);
  });
});
