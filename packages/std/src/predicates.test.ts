/**
 * Tests for A0 stdlib boolean/predicate helpers.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { eqFn, containsFn, notFn, andFn, orFn, coalesceFn, typeofFn } from "./predicates.js";

describe("eq", () => {
  it("equal primitives (numbers)", () => {
    assert.equal(eqFn.execute({ a: 1, b: 1 }), true);
  });

  it("equal primitives (strings)", () => {
    assert.equal(eqFn.execute({ a: "hello", b: "hello" }), true);
  });

  it("equal primitives (booleans)", () => {
    assert.equal(eqFn.execute({ a: true, b: true }), true);
  });

  it("unequal primitives", () => {
    assert.equal(eqFn.execute({ a: 1, b: 2 }), false);
  });

  it("unequal types", () => {
    assert.equal(eqFn.execute({ a: 1, b: "1" }), false);
  });

  it("equal records", () => {
    assert.equal(
      eqFn.execute({ a: { x: 1, y: 2 }, b: { x: 1, y: 2 } }),
      true
    );
  });

  it("equal records with different key order", () => {
    assert.equal(
      eqFn.execute({ a: { x: 1, y: 2 }, b: { y: 2, x: 1 } }),
      true
    );
  });

  it("unequal records", () => {
    assert.equal(
      eqFn.execute({ a: { x: 1 }, b: { x: 2 } }),
      false
    );
  });

  it("null equality", () => {
    assert.equal(eqFn.execute({ a: null, b: null }), true);
  });

  it("null vs non-null", () => {
    assert.equal(eqFn.execute({ a: null, b: 0 }), false);
  });

  it("list equality", () => {
    assert.equal(
      eqFn.execute({ a: [1, 2, 3], b: [1, 2, 3] }),
      true
    );
  });

  it("unequal lists", () => {
    assert.equal(
      eqFn.execute({ a: [1, 2], b: [1, 3] }),
      false
    );
  });

  it("missing args default to null", () => {
    assert.equal(eqFn.execute({}), true); // both default to null
  });
});

describe("contains", () => {
  // string: substring check
  it("finds substring in string", () => {
    assert.equal(containsFn.execute({ in: "hello world", value: "world" }), true);
  });

  it("negative substring check", () => {
    assert.equal(containsFn.execute({ in: "hello world", value: "xyz" }), false);
  });

  it("empty string is always contained", () => {
    assert.equal(containsFn.execute({ in: "hello", value: "" }), true);
  });

  it("returns false for non-string value with string input", () => {
    assert.equal(containsFn.execute({ in: "hello", value: 42 }), false);
  });

  // list: deep element membership
  it("finds element in list (primitive)", () => {
    assert.equal(containsFn.execute({ in: [1, 2, 3], value: 2 }), true);
  });

  it("negative list membership (primitive)", () => {
    assert.equal(containsFn.execute({ in: [1, 2, 3], value: 4 }), false);
  });

  it("deep element membership in list (record)", () => {
    assert.equal(
      containsFn.execute({ in: [{ x: 1 }, { x: 2 }], value: { x: 1 } }),
      true
    );
  });

  it("deep element membership in list ignores record key order", () => {
    assert.equal(
      containsFn.execute({ in: [{ x: 1, y: 2 }], value: { y: 2, x: 1 } }),
      true
    );
  });

  it("deep element membership negative (record)", () => {
    assert.equal(
      containsFn.execute({ in: [{ x: 1 }, { x: 2 }], value: { x: 3 } }),
      false
    );
  });

  it("empty list contains nothing", () => {
    assert.equal(containsFn.execute({ in: [], value: 1 }), false);
  });

  // record: key existence
  it("finds key in record", () => {
    assert.equal(
      containsFn.execute({ in: { name: "Alice", age: 30 }, value: "name" }),
      true
    );
  });

  it("negative key existence in record", () => {
    assert.equal(
      containsFn.execute({ in: { name: "Alice" }, value: "email" }),
      false
    );
  });

  it("returns false for non-string value with record input", () => {
    assert.equal(
      containsFn.execute({ in: { name: "Alice" }, value: 42 }),
      false
    );
  });

  // null / edge cases
  it("returns false for null input", () => {
    assert.equal(containsFn.execute({ in: null, value: "x" }), false);
  });

  it("returns false for number input", () => {
    assert.equal(containsFn.execute({ in: 42, value: 4 }), false);
  });

  it("returns false for boolean input", () => {
    assert.equal(containsFn.execute({ in: true, value: true }), false);
  });
});

describe("not", () => {
  it("true -> false", () => {
    assert.equal(notFn.execute({ in: true }), false);
  });

  it("false -> true", () => {
    assert.equal(notFn.execute({ in: false }), true);
  });

  it("0 -> true (falsy)", () => {
    assert.equal(notFn.execute({ in: 0 }), true);
  });

  it("1 -> false (truthy)", () => {
    assert.equal(notFn.execute({ in: 1 }), false);
  });

  it("empty string -> true (falsy)", () => {
    assert.equal(notFn.execute({ in: "" }), true);
  });

  it("non-empty string -> false (truthy)", () => {
    assert.equal(notFn.execute({ in: "hello" }), false);
  });

  it("null -> true (falsy)", () => {
    assert.equal(notFn.execute({ in: null }), true);
  });

  it("record -> false (truthy)", () => {
    assert.equal(notFn.execute({ in: { x: 1 } }), false);
  });

  it("empty record -> false (truthy)", () => {
    assert.equal(notFn.execute({ in: {} }), false);
  });

  it("empty list -> false (truthy)", () => {
    assert.equal(notFn.execute({ in: [] }), false);
  });

  it("missing arg defaults to null -> true", () => {
    assert.equal(notFn.execute({}), true);
  });
});

describe("and", () => {
  it("true AND true -> true", () => {
    assert.equal(andFn.execute({ a: true, b: true }), true);
  });

  it("true AND false -> false", () => {
    assert.equal(andFn.execute({ a: true, b: false }), false);
  });

  it("false AND true -> false", () => {
    assert.equal(andFn.execute({ a: false, b: true }), false);
  });

  it("false AND false -> false", () => {
    assert.equal(andFn.execute({ a: false, b: false }), false);
  });

  it("truthy values: 1 AND 'hello' -> true", () => {
    assert.equal(andFn.execute({ a: 1, b: "hello" }), true);
  });

  it("mixed: 1 AND 0 -> false", () => {
    assert.equal(andFn.execute({ a: 1, b: 0 }), false);
  });

  it("null AND true -> false", () => {
    assert.equal(andFn.execute({ a: null, b: true }), false);
  });

  it("record AND list -> true (both truthy)", () => {
    assert.equal(andFn.execute({ a: { x: 1 }, b: [1] }), true);
  });
});

describe("or", () => {
  it("true OR true -> true", () => {
    assert.equal(orFn.execute({ a: true, b: true }), true);
  });

  it("true OR false -> true", () => {
    assert.equal(orFn.execute({ a: true, b: false }), true);
  });

  it("false OR true -> true", () => {
    assert.equal(orFn.execute({ a: false, b: true }), true);
  });

  it("false OR false -> false", () => {
    assert.equal(orFn.execute({ a: false, b: false }), false);
  });

  it("truthy values: 1 OR 0 -> true", () => {
    assert.equal(orFn.execute({ a: 1, b: 0 }), true);
  });

  it("both falsy: 0 OR '' -> false", () => {
    assert.equal(orFn.execute({ a: 0, b: "" }), false);
  });

  it("null OR 'hello' -> true", () => {
    assert.equal(orFn.execute({ a: null, b: "hello" }), true);
  });

  it("null OR null -> false", () => {
    assert.equal(orFn.execute({ a: null, b: null }), false);
  });
});

describe("coalesce", () => {
  it("returns non-null value", () => {
    assert.equal(coalesceFn.execute({ in: 42, default: 0 }), 42);
  });

  it("returns default when null", () => {
    assert.equal(coalesceFn.execute({ in: null, default: 99 }), 99);
  });

  it("preserves false (not null)", () => {
    assert.equal(coalesceFn.execute({ in: false, default: true }), false);
  });

  it("preserves 0 (not null)", () => {
    assert.equal(coalesceFn.execute({ in: 0, default: 1 }), 0);
  });

  it("preserves empty string (not null)", () => {
    assert.equal(coalesceFn.execute({ in: "", default: "fallback" }), "");
  });

  it("returns null when both null", () => {
    assert.equal(coalesceFn.execute({ in: null, default: null }), null);
  });

  it("works with record values", () => {
    assert.deepEqual(coalesceFn.execute({ in: { a: 1 }, default: {} }), { a: 1 });
  });
});

describe("typeof", () => {
  it("returns 'null' for null", () => {
    assert.equal(typeofFn.execute({ in: null }), "null");
  });

  it("returns 'boolean' for true", () => {
    assert.equal(typeofFn.execute({ in: true }), "boolean");
  });

  it("returns 'boolean' for false", () => {
    assert.equal(typeofFn.execute({ in: false }), "boolean");
  });

  it("returns 'number' for integer", () => {
    assert.equal(typeofFn.execute({ in: 42 }), "number");
  });

  it("returns 'number' for float", () => {
    assert.equal(typeofFn.execute({ in: 3.14 }), "number");
  });

  it("returns 'string' for string", () => {
    assert.equal(typeofFn.execute({ in: "hello" }), "string");
  });

  it("returns 'string' for empty string", () => {
    assert.equal(typeofFn.execute({ in: "" }), "string");
  });

  it("returns 'list' for array", () => {
    assert.equal(typeofFn.execute({ in: [1, 2, 3] }), "list");
  });

  it("returns 'list' for empty array", () => {
    assert.equal(typeofFn.execute({ in: [] }), "list");
  });

  it("returns 'record' for object", () => {
    assert.equal(typeofFn.execute({ in: { a: 1 } }), "record");
  });

  it("returns 'null' for missing arg", () => {
    assert.equal(typeofFn.execute({}), "null");
  });
});
