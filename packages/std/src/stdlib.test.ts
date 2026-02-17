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

  it("applies move operation", () => {
    const result = patchFn.execute({
      in: { first: "Alice", last: "Smith" },
      ops: [{ op: "move", from: "/first", path: "/name" }],
    }) as A0Record;
    assert.equal(result["name"], "Alice");
    assert.equal(result["first"], undefined);
  });

  it("applies copy operation", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "copy", from: "/name", path: "/backup" }],
    }) as A0Record;
    assert.equal(result["name"], "Alice");
    assert.equal(result["backup"], "Alice");
  });

  it("returns error for unknown op", () => {
    const result = patchFn.execute({
      in: {},
      ops: [{ op: "unknown_op", path: "/x", value: 1 }],
    }) as A0Record;
    assert.ok(result["err"]);
  });

  it("returns error for non-object op", () => {
    const result = patchFn.execute({
      in: {},
      ops: [42 as unknown as A0Value],
    }) as A0Record;
    assert.ok(result["err"]);
  });

  it("applies nested path operations", () => {
    const result = patchFn.execute({
      in: { a: { b: 1 } },
      ops: [{ op: "replace", path: "/a/b", value: 99 }],
    }) as A0Record;
    assert.equal((result["a"] as A0Record)["b"], 99);
  });

  it("handles null input doc", () => {
    const result = patchFn.execute({
      in: null,
      ops: [{ op: "add", path: "/key", value: "val" }],
    }) as A0Record;
    assert.equal(result["key"], "val");
  });
});

describe("parse.json (additional)", () => {
  it("parses JSON number", () => {
    const result = parseJsonFn.execute({ in: "42" });
    assert.equal(result, 42);
  });

  it("parses JSON boolean", () => {
    assert.equal(parseJsonFn.execute({ in: "true" }), true);
    assert.equal(parseJsonFn.execute({ in: "false" }), false);
  });

  it("parses JSON null", () => {
    assert.equal(parseJsonFn.execute({ in: "null" }), null);
  });

  it("parses JSON string", () => {
    assert.equal(parseJsonFn.execute({ in: '"hello"' }), "hello");
  });

  it("parses nested JSON", () => {
    const result = parseJsonFn.execute({ in: '{"a":{"b":[1,2,3]}}' }) as A0Record;
    assert.deepEqual((result["a"] as A0Record)["b"], [1, 2, 3]);
  });
});

describe("get (additional)", () => {
  it("returns null for null input", () => {
    const result = getFn.execute({ in: null, path: "x" });
    assert.equal(result, null);
  });

  it("returns null for primitive input", () => {
    const result = getFn.execute({ in: 42, path: "x" });
    assert.equal(result, null);
  });

  it("returns error for non-string path", () => {
    const result = getFn.execute({ in: { x: 1 }, path: 42 as unknown as string }) as A0Record;
    assert.ok(result["err"]);
  });

  it("gets from array at top level", () => {
    const result = getFn.execute({ in: { items: [10, 20, 30] }, path: "items[0]" });
    assert.equal(result, 10);
  });

  it("handles deeply nested path", () => {
    const result = getFn.execute({
      in: { a: { b: { c: { d: 42 } } } },
      path: "a.b.c.d",
    });
    assert.equal(result, 42);
  });
});

describe("put (additional)", () => {
  it("returns error for non-string path", () => {
    const result = putFn.execute({ in: {}, path: 42 as unknown as string, value: 1 }) as A0Record;
    assert.ok(result["err"]);
  });

  it("puts into array index", () => {
    const result = putFn.execute({
      in: { items: [1, 2, 3] },
      path: "items[1]",
      value: 99,
    }) as A0Record;
    assert.deepEqual((result["items"] as A0Value[])[1], 99);
  });

  it("uses null as default when value not provided", () => {
    const result = putFn.execute({ in: {}, path: "x" }) as A0Record;
    assert.equal(result["x"], null);
  });

  it("handles null input", () => {
    const result = putFn.execute({ in: null, path: "x", value: 1 }) as A0Record;
    assert.equal(result["x"], 1);
  });
});

describe("getStdlibFns", () => {
  it("returns all stdlib functions", async () => {
    const { getStdlibFns } = await import("./index.js");
    const fns = getStdlibFns();
    assert.ok(fns.has("parse.json"));
    assert.ok(fns.has("get"));
    assert.ok(fns.has("put"));
    assert.ok(fns.has("patch"));
    assert.equal(fns.size, 4);
  });
});
