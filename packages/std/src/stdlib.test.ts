/**
 * Tests for A0 standard library functions.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseJsonFn } from "./parse-json.js";
import { getFn, putFn } from "./path-ops.js";
import { patchFn } from "./patch.js";
import { lenFn, appendFn, concatFn, sortFn, filterFn, findFn, rangeFn, joinFn, uniqueFn, pluckFn, flatFn } from "./list-ops.js";
import { strConcatFn, strSplitFn, strStartsFn, strEndsFn, strReplaceFn, strTemplateFn } from "./string-ops.js";
import { mathMaxFn, mathMinFn } from "./math-ops.js";
import { keysFn, valuesFn, mergeFn, entriesFn } from "./record-ops.js";
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

  it("throws for invalid JSON", () => {
    assert.throws(
      () => parseJsonFn.execute({ in: "{invalid" }),
      (err: Error) => err.message.length > 0
    );
  });

  it("throws for non-string input", () => {
    assert.throws(
      () => parseJsonFn.execute({ in: 42 as unknown as string }),
      (err: Error) => err.message.includes("string")
    );
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

  it("throws for invalid ops", () => {
    assert.throws(
      () => patchFn.execute({ in: {}, ops: "not an array" as unknown as A0Value }),
      (err: Error) => err.message.includes("list")
    );
  });

  it("applies test operation (success)", () => {
    const result = patchFn.execute({
      in: { name: "Alice" },
      ops: [{ op: "test", path: "/name", value: "Alice" }],
    }) as A0Record;
    assert.equal(result["name"], "Alice");
  });

  it("throws on test operation failure", () => {
    assert.throws(
      () => patchFn.execute({
        in: { name: "Alice" },
        ops: [{ op: "test", path: "/name", value: "Bob" }],
      }),
      (err: Error) => err.message.includes("Test failed")
    );
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

  it("throws for unknown op", () => {
    assert.throws(
      () => patchFn.execute({
        in: {},
        ops: [{ op: "unknown_op", path: "/x", value: 1 }],
      }),
      (err: Error) => err.message.includes("Unknown patch op")
    );
  });

  it("throws for non-object op", () => {
    assert.throws(
      () => patchFn.execute({
        in: {},
        ops: [42 as unknown as A0Value],
      }),
      (err: Error) => err.message.includes("Invalid op")
    );
  });

  it("applies nested path operations", () => {
    const result = patchFn.execute({
      in: { a: { b: 1 } },
      ops: [{ op: "replace", path: "/a/b", value: 99 }],
    }) as A0Record;
    assert.equal((result["a"] as A0Record)["b"], 99);
  });

  it("applies replace on array element (overwrites, not inserts)", () => {
    const result = patchFn.execute({
      in: [10, 20, 30],
      ops: [{ op: "replace", path: "/1", value: 99 }],
    }) as A0Value[];
    assert.deepEqual(result, [10, 99, 30]);
  });

  it("applies add on array element (inserts)", () => {
    const result = patchFn.execute({
      in: [10, 20, 30],
      ops: [{ op: "add", path: "/1", value: 99 }],
    }) as A0Value[];
    assert.deepEqual(result, [10, 99, 20, 30]);
  });

  it("throws when add path parent does not exist", () => {
    assert.throws(
      () => patchFn.execute({
        in: null,
        ops: [{ op: "add", path: "/key", value: "val" }],
      }),
      (err: Error) => err.message.includes("does not exist")
    );
  });

  it("throws for invalid array index in remove", () => {
    assert.throws(
      () => patchFn.execute({
        in: [1, 2],
        ops: [{ op: "remove", path: "/x" }],
      }),
      (err: Error) => err.message.includes("Invalid array index")
    );
  });

  it("throws for invalid array index in add", () => {
    assert.throws(
      () => patchFn.execute({
        in: [1, 2],
        ops: [{ op: "add", path: "/x", value: 9 }],
      }),
      (err: Error) => err.message.includes("Invalid array index")
    );
  });

  it("throws when copy source path is missing", () => {
    assert.throws(
      () => patchFn.execute({
        in: { a: 1 },
        ops: [{ op: "copy", from: "/missing", path: "/b" }],
      }),
      (err: Error) => err.message.includes("does not exist")
    );
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

  it("throws for non-string path", () => {
    assert.throws(
      () => getFn.execute({ in: { x: 1 }, path: 42 as unknown as string }),
      (err: Error) => err.message.includes("string")
    );
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
  it("throws for non-string path", () => {
    assert.throws(
      () => putFn.execute({ in: {}, path: 42 as unknown as string, value: 1 }),
      (err: Error) => err.message.includes("string")
    );
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

describe("len", () => {
  it("returns length of list", () => {
    assert.equal(lenFn.execute({ in: [1, 2, 3] }), 3);
  });

  it("returns length of string", () => {
    assert.equal(lenFn.execute({ in: "hello" }), 5);
  });

  it("returns number of keys in record", () => {
    assert.equal(lenFn.execute({ in: { a: 1, b: 2 } }), 2);
  });

  it("returns 0 for empty list", () => {
    assert.equal(lenFn.execute({ in: [] }), 0);
  });

  it("throws on number input", () => {
    assert.throws(
      () => lenFn.execute({ in: 42 }),
      (err: Error) => err.message.includes("must be a list, string, or record")
    );
  });
});

describe("append", () => {
  it("appends value to list", () => {
    assert.deepEqual(appendFn.execute({ in: [1, 2], value: 3 }), [1, 2, 3]);
  });

  it("appends to empty list", () => {
    assert.deepEqual(appendFn.execute({ in: [], value: "a" }), ["a"]);
  });

  it("throws on non-list input", () => {
    assert.throws(
      () => appendFn.execute({ in: "not a list", value: 1 }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("concat", () => {
  it("concatenates two lists", () => {
    assert.deepEqual(concatFn.execute({ a: [1, 2], b: [3, 4] }), [1, 2, 3, 4]);
  });

  it("concatenates with empty list", () => {
    assert.deepEqual(concatFn.execute({ a: [1, 2], b: [] }), [1, 2]);
  });

  it("throws on non-list inputs", () => {
    assert.throws(
      () => concatFn.execute({ a: "not", b: "lists" }),
      (err: Error) => err.message.includes("must be lists")
    );
  });
});

describe("sort", () => {
  it("sorts numbers", () => {
    assert.deepEqual(sortFn.execute({ in: [3, 1, 2] }), [1, 2, 3]);
  });

  it("sorts strings", () => {
    assert.deepEqual(sortFn.execute({ in: ["c", "a", "b"] }), ["a", "b", "c"]);
  });

  it("sorts by key", () => {
    const input = [{ name: "Charlie", age: 30 }, { name: "Alice", age: 25 }, { name: "Bob", age: 28 }];
    const result = sortFn.execute({ in: input, by: "name" }) as A0Record[];
    assert.equal((result[0] as A0Record)["name"], "Alice");
    assert.equal((result[1] as A0Record)["name"], "Bob");
    assert.equal((result[2] as A0Record)["name"], "Charlie");
  });

  it("sorts empty list", () => {
    assert.deepEqual(sortFn.execute({ in: [] }), []);
  });

  it("throws on non-list", () => {
    assert.throws(
      () => sortFn.execute({ in: "not a list" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });

  it("throws when by is not a string", () => {
    assert.throws(
      () => sortFn.execute({ in: [{ n: 1 }, { n: 2 }], by: 1 }),
      (err: Error) => err.message.includes("'by' must be a string")
    );
  });
});

describe("filter", () => {
  it("filters by truthy key", () => {
    const input = [{ name: "Alice", active: true }, { name: "Bob", active: false }, { name: "Charlie", active: true }];
    const result = filterFn.execute({ in: input, by: "active" }) as A0Value[];
    assert.equal(result.length, 2);
    assert.equal((result[0] as A0Record)["name"], "Alice");
    assert.equal((result[1] as A0Record)["name"], "Charlie");
  });

  it("filters empty list", () => {
    assert.deepEqual(filterFn.execute({ in: [], by: "active" }), []);
  });

  it("throws on non-list", () => {
    assert.throws(
      () => filterFn.execute({ in: "not a list", by: "key" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("find", () => {
  it("finds matching element", () => {
    const input = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
    const result = findFn.execute({ in: input, key: "id", value: 2 }) as A0Record;
    assert.equal(result["name"], "Bob");
  });

  it("uses deep equality for nested records regardless of key order", () => {
    const input = [{ id: 1, meta: { x: 1, y: 2 } }, { id: 2, meta: { x: 3, y: 4 } }];
    const result = findFn.execute({ in: input, key: "meta", value: { y: 2, x: 1 } }) as A0Record;
    assert.equal(result["id"], 1);
  });

  it("returns null when no match", () => {
    const input = [{ id: 1, name: "Alice" }];
    assert.equal(findFn.execute({ in: input, key: "id", value: 99 }), null);
  });

  it("throws on non-list", () => {
    assert.throws(
      () => findFn.execute({ in: "not a list", key: "id", value: 1 }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("range", () => {
  it("generates range from 0 to 5", () => {
    assert.deepEqual(rangeFn.execute({ from: 0, to: 5 }), [0, 1, 2, 3, 4]);
  });

  it("returns empty for equal from and to", () => {
    assert.deepEqual(rangeFn.execute({ from: 3, to: 3 }), []);
  });

  it("returns empty when from > to", () => {
    assert.deepEqual(rangeFn.execute({ from: 5, to: 3 }), []);
  });

  it("throws on non-number", () => {
    assert.throws(
      () => rangeFn.execute({ from: "a", to: "b" }),
      (err: Error) => err.message.includes("must be integers")
    );
  });

  it("throws on non-integer number", () => {
    assert.throws(
      () => rangeFn.execute({ from: 0.5, to: 3 }),
      (err: Error) => err.message.includes("must be integers")
    );
  });
});

describe("join", () => {
  it("joins with separator", () => {
    assert.equal(joinFn.execute({ in: ["a", "b", "c"], sep: "," }), "a,b,c");
  });

  it("joins with default separator (empty string)", () => {
    assert.equal(joinFn.execute({ in: ["a", "b", "c"] }), "abc");
  });

  it("throws on non-list", () => {
    assert.throws(
      () => joinFn.execute({ in: "not a list" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });

  it("throws on non-string separator", () => {
    assert.throws(
      () => joinFn.execute({ in: ["a", "b"], sep: 1 }),
      (err: Error) => err.message.includes("'sep' must be a string")
    );
  });
});

describe("str.concat", () => {
  it("concatenates parts", () => {
    assert.equal(strConcatFn.execute({ parts: ["hello", " ", "world"] }), "hello world");
  });

  it("throws on non-list", () => {
    assert.throws(
      () => strConcatFn.execute({ parts: "not a list" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("str.split", () => {
  it("splits string by separator", () => {
    assert.deepEqual(strSplitFn.execute({ in: "a,b,c", sep: "," }), ["a", "b", "c"]);
  });

  it("throws on non-string input", () => {
    assert.throws(
      () => strSplitFn.execute({ in: 42, sep: "," }),
      (err: Error) => err.message.includes("must be a string")
    );
  });
});

describe("str.starts", () => {
  it("returns true when string starts with value", () => {
    assert.equal(strStartsFn.execute({ in: "hello", value: "hel" }), true);
  });

  it("returns false when string does not start with value", () => {
    assert.equal(strStartsFn.execute({ in: "hello", value: "world" }), false);
  });

  it("throws on non-string input", () => {
    assert.throws(
      () => strStartsFn.execute({ in: 42, value: "hel" }),
      (err: Error) => err.message.includes("must be a string")
    );
  });
});

describe("str.replace", () => {
  it("replaces all occurrences", () => {
    assert.equal(strReplaceFn.execute({ in: "foo bar foo", from: "foo", to: "baz" }), "baz bar baz");
  });

  it("throws on non-string input", () => {
    assert.throws(
      () => strReplaceFn.execute({ in: 42, from: "a", to: "b" }),
      (err: Error) => err.message.includes("must be a string")
    );
  });
});

describe("keys", () => {
  it("returns keys of record", () => {
    assert.deepEqual(keysFn.execute({ in: { a: 1, b: 2 } }), ["a", "b"]);
  });

  it("throws on non-record", () => {
    assert.throws(
      () => keysFn.execute({ in: [1, 2, 3] }),
      (err: Error) => err.message.includes("must be a record")
    );
  });
});

describe("values", () => {
  it("returns values of record", () => {
    assert.deepEqual(valuesFn.execute({ in: { a: 1, b: 2 } }), [1, 2]);
  });

  it("throws on non-record", () => {
    assert.throws(
      () => valuesFn.execute({ in: [1, 2, 3] }),
      (err: Error) => err.message.includes("must be a record")
    );
  });
});

describe("merge", () => {
  it("merges two records", () => {
    assert.deepEqual(mergeFn.execute({ a: { a: 1 }, b: { b: 2 } }), { a: 1, b: 2 });
  });

  it("b wins on conflict", () => {
    assert.deepEqual(mergeFn.execute({ a: { x: 1 }, b: { x: 2 } }), { x: 2 });
  });

  it("throws on non-record", () => {
    assert.throws(
      () => mergeFn.execute({ a: [1], b: { x: 1 } }),
      (err: Error) => err.message.includes("must be records")
    );
  });
});

describe("sort (multi-key)", () => {
  it("sorts by multiple keys", () => {
    const input = [
      { group: 2, name: "Charlie" },
      { group: 1, name: "Bob" },
      { group: 1, name: "Alice" },
      { group: 2, name: "Alice" },
    ];
    const result = sortFn.execute({ in: input, by: ["group", "name"] }) as A0Record[];
    assert.equal((result[0] as A0Record)["name"], "Alice");
    assert.equal((result[0] as A0Record)["group"], 1);
    assert.equal((result[1] as A0Record)["name"], "Bob");
    assert.equal((result[2] as A0Record)["name"], "Alice");
    assert.equal((result[2] as A0Record)["group"], 2);
    assert.equal((result[3] as A0Record)["name"], "Charlie");
  });

  it("throws on non-string elements in by array", () => {
    assert.throws(
      () => sortFn.execute({ in: [{ a: 1 }], by: [1] }),
      (err: Error) => err.message.includes("must be strings")
    );
  });

  it("throws on invalid by type", () => {
    assert.throws(
      () => sortFn.execute({ in: [{ a: 1 }], by: true }),
      (err: Error) => err.message.includes("must be a string or list")
    );
  });
});

describe("unique", () => {
  it("removes duplicate primitives", () => {
    assert.deepEqual(uniqueFn.execute({ in: [1, 2, 2, 3, 1] }), [1, 2, 3]);
  });

  it("removes duplicate strings", () => {
    assert.deepEqual(uniqueFn.execute({ in: ["a", "b", "a", "c"] }), ["a", "b", "c"]);
  });

  it("removes duplicate records using deep equality", () => {
    const input = [{ x: 1 }, { x: 2 }, { x: 1 }];
    const result = uniqueFn.execute({ in: input }) as A0Value[];
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { x: 1 });
    assert.deepEqual(result[1], { x: 2 });
  });

  it("returns empty list for empty input", () => {
    assert.deepEqual(uniqueFn.execute({ in: [] }), []);
  });

  it("throws on non-list", () => {
    assert.throws(
      () => uniqueFn.execute({ in: "not a list" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("math.max", () => {
  it("returns max of positive numbers", () => {
    assert.equal(mathMaxFn.execute({ in: [1, 5, 3] }), 5);
  });

  it("returns max of negative numbers", () => {
    assert.equal(mathMaxFn.execute({ in: [-10, -3, -7] }), -3);
  });

  it("works with single element", () => {
    assert.equal(mathMaxFn.execute({ in: [42] }), 42);
  });

  it("throws on empty list", () => {
    assert.throws(
      () => mathMaxFn.execute({ in: [] }),
      (err: Error) => err.message.includes("must not be empty")
    );
  });

  it("throws on non-numbers", () => {
    assert.throws(
      () => mathMaxFn.execute({ in: [1, "two", 3] }),
      (err: Error) => err.message.includes("must be numbers")
    );
  });

  it("throws on non-list", () => {
    assert.throws(
      () => mathMaxFn.execute({ in: 42 }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("math.min", () => {
  it("returns min of positive numbers", () => {
    assert.equal(mathMinFn.execute({ in: [5, 1, 3] }), 1);
  });

  it("returns min of negative numbers", () => {
    assert.equal(mathMinFn.execute({ in: [-3, -10, -7] }), -10);
  });

  it("works with single element", () => {
    assert.equal(mathMinFn.execute({ in: [42] }), 42);
  });

  it("throws on empty list", () => {
    assert.throws(
      () => mathMinFn.execute({ in: [] }),
      (err: Error) => err.message.includes("must not be empty")
    );
  });

  it("throws on non-numbers", () => {
    assert.throws(
      () => mathMinFn.execute({ in: [1, "two", 3] }),
      (err: Error) => err.message.includes("must be numbers")
    );
  });
});

describe("str.ends", () => {
  it("returns true when string ends with value", () => {
    assert.equal(strEndsFn.execute({ in: "hello", value: "llo" }), true);
  });

  it("returns false when string does not end with value", () => {
    assert.equal(strEndsFn.execute({ in: "hello", value: "world" }), false);
  });

  it("throws on non-string input", () => {
    assert.throws(
      () => strEndsFn.execute({ in: 42, value: "llo" }),
      (err: Error) => err.message.includes("must be a string")
    );
  });

  it("throws on non-string value", () => {
    assert.throws(
      () => strEndsFn.execute({ in: "hello", value: 42 }),
      (err: Error) => err.message.includes("must be a string")
    );
  });
});

describe("pluck", () => {
  it("extracts values from records", () => {
    const input = [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }];
    assert.deepEqual(pluckFn.execute({ in: input, key: "name" }), ["Alice", "Bob"]);
  });

  it("returns null for missing keys", () => {
    const input: A0Value[] = [{ name: "Alice" }, { age: 25 }];
    assert.deepEqual(pluckFn.execute({ in: input, key: "name" }), ["Alice", null]);
  });

  it("returns null for non-record elements", () => {
    const input = [{ name: "Alice" }, 42, null];
    assert.deepEqual(pluckFn.execute({ in: input, key: "name" }), ["Alice", null, null]);
  });

  it("works with empty list", () => {
    assert.deepEqual(pluckFn.execute({ in: [], key: "name" }), []);
  });

  it("throws on non-list input", () => {
    assert.throws(
      () => pluckFn.execute({ in: "not a list", key: "name" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });

  it("throws on non-string key", () => {
    assert.throws(
      () => pluckFn.execute({ in: [{ a: 1 }], key: 42 }),
      (err: Error) => err.message.includes("must be a string")
    );
  });
});

describe("flat", () => {
  it("flattens one level", () => {
    assert.deepEqual(flatFn.execute({ in: [[1, 2], [3, 4]] }), [1, 2, 3, 4]);
  });

  it("preserves non-list elements", () => {
    assert.deepEqual(flatFn.execute({ in: [1, [2, 3], 4] }), [1, 2, 3, 4]);
  });

  it("flattens only one level deep", () => {
    assert.deepEqual(flatFn.execute({ in: [[1, [2, 3]], [4]] }), [1, [2, 3], 4]);
  });

  it("works with empty sublists", () => {
    assert.deepEqual(flatFn.execute({ in: [[], [1], []] }), [1]);
  });

  it("works with empty list", () => {
    assert.deepEqual(flatFn.execute({ in: [] }), []);
  });

  it("preserves records and null", () => {
    assert.deepEqual(flatFn.execute({ in: [{ a: 1 }, [null, "x"]] }), [{ a: 1 }, null, "x"]);
  });

  it("throws on non-list input", () => {
    assert.throws(
      () => flatFn.execute({ in: "not a list" }),
      (err: Error) => err.message.includes("must be a list")
    );
  });
});

describe("entries", () => {
  it("converts record to key-value pairs", () => {
    const result = entriesFn.execute({ in: { a: 1, b: 2 } }) as A0Value[];
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { key: "a", value: 1 });
    assert.deepEqual(result[1], { key: "b", value: 2 });
  });

  it("works with empty record", () => {
    assert.deepEqual(entriesFn.execute({ in: {} }), []);
  });

  it("handles null values", () => {
    const result = entriesFn.execute({ in: { a: null } }) as A0Value[];
    assert.deepEqual(result[0], { key: "a", value: null });
  });

  it("handles nested records", () => {
    const result = entriesFn.execute({ in: { x: { nested: true } } }) as A0Value[];
    assert.deepEqual(result[0], { key: "x", value: { nested: true } });
  });

  it("throws on non-record input", () => {
    assert.throws(
      () => entriesFn.execute({ in: [1, 2] }),
      (err: Error) => err.message.includes("must be a record")
    );
  });
});

describe("str.template", () => {
  it("replaces single placeholder", () => {
    assert.equal(
      strTemplateFn.execute({ in: "Hello, {name}!", vars: { name: "World" } }),
      "Hello, World!"
    );
  });

  it("replaces multiple placeholders", () => {
    assert.equal(
      strTemplateFn.execute({ in: "{a}/{b}/{c}", vars: { a: "x", b: "y", c: "z" } }),
      "x/y/z"
    );
  });

  it("leaves unmatched placeholders as-is", () => {
    assert.equal(
      strTemplateFn.execute({ in: "Hello, {name}! {unknown}", vars: { name: "World" } }),
      "Hello, World! {unknown}"
    );
  });

  it("handles no placeholders", () => {
    assert.equal(
      strTemplateFn.execute({ in: "no placeholders here", vars: { name: "World" } }),
      "no placeholders here"
    );
  });

  it("converts numbers to strings", () => {
    assert.equal(
      strTemplateFn.execute({ in: "version {v}", vars: { v: 42 } }),
      "version 42"
    );
  });

  it("leaves null values as placeholder", () => {
    assert.equal(
      strTemplateFn.execute({ in: "val: {x}", vars: { x: null } }),
      "val: {x}"
    );
  });

  it("handles empty template", () => {
    assert.equal(strTemplateFn.execute({ in: "", vars: { a: 1 } }), "");
  });

  it("handles path-like template", () => {
    assert.equal(
      strTemplateFn.execute({ in: "packages/{name}/package.json", vars: { name: "core" } }),
      "packages/core/package.json"
    );
  });

  it("throws on non-string input", () => {
    assert.throws(
      () => strTemplateFn.execute({ in: 42, vars: { a: 1 } }),
      (err: Error) => err.message.includes("must be a string")
    );
  });

  it("throws on non-record vars", () => {
    assert.throws(
      () => strTemplateFn.execute({ in: "hello", vars: "not a record" }),
      (err: Error) => err.message.includes("must be a record")
    );
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
    assert.ok(fns.has("eq"));
    assert.ok(fns.has("contains"));
    assert.ok(fns.has("not"));
    assert.ok(fns.has("and"));
    assert.ok(fns.has("or"));
    assert.ok(fns.has("len"));
    assert.ok(fns.has("append"));
    assert.ok(fns.has("concat"));
    assert.ok(fns.has("sort"));
    assert.ok(fns.has("filter"));
    assert.ok(fns.has("find"));
    assert.ok(fns.has("range"));
    assert.ok(fns.has("join"));
    assert.ok(fns.has("str.concat"));
    assert.ok(fns.has("str.split"));
    assert.ok(fns.has("str.starts"));
    assert.ok(fns.has("str.replace"));
    assert.ok(fns.has("keys"));
    assert.ok(fns.has("values"));
    assert.ok(fns.has("merge"));
    assert.ok(fns.has("math.max"));
    assert.ok(fns.has("math.min"));
    assert.ok(fns.has("str.ends"));
    assert.ok(fns.has("unique"));
    assert.ok(fns.has("coalesce"));
    assert.ok(fns.has("typeof"));
    assert.ok(fns.has("pluck"));
    assert.ok(fns.has("flat"));
    assert.ok(fns.has("entries"));
    assert.ok(fns.has("str.template"));
    assert.equal(fns.size, 34);
  });
});
