/**
 * Tests for the A0 evaluator.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parse } from "./parser.js";
import { execute, A0RuntimeError } from "./evaluator.js";
import type { ExecOptions, StdlibFn, A0Value, A0Record } from "./evaluator.js";

function makeOptions(overrides?: Partial<ExecOptions>): ExecOptions {
  return {
    allowedCapabilities: new Set(),
    tools: new Map(),
    stdlib: new Map(),
    runId: "test-run",
    ...overrides,
  };
}

describe("A0 Evaluator", () => {
  it("evaluates a simple return", async () => {
    const src = `return { ok: true, value: 42 }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["ok"], true);
    assert.equal(val["value"], 42);
  });

  it("evaluates let bindings", async () => {
    const src = `let x = 10\nlet y = 20\nreturn { x: x, y: y }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 10);
    assert.equal(val["y"], 20);
  });

  it("evaluates string literals", async () => {
    const src = `let msg = "hello"\nreturn { msg: msg }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["msg"], "hello");
  });

  it("evaluates lists", async () => {
    const src = `let items = [1, 2, 3]\nreturn { items: items }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.deepEqual(val["items"], [1, 2, 3]);
  });

  it("evaluates nested records", async () => {
    const src = `let data = { inner: { val: 99 } }\nreturn { data: data }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const data = val["data"] as A0Record;
    const inner = data["inner"] as A0Record;
    assert.equal(inner["val"], 99);
  });

  it("evaluates stdlib functions", async () => {
    const parseFn: StdlibFn = {
      name: "parse.json",
      execute(args: A0Record): A0Value {
        return JSON.parse(args["in"] as string);
      },
    };
    const stdlib = new Map([["parse.json", parseFn]]);

    const src = `let raw = "{\\"x\\": 1}"\nlet parsed = parse.json { in: raw }\nreturn { parsed: parsed }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ stdlib }));
    const val = result.value as A0Record;
    const parsed = val["parsed"] as A0Record;
    assert.equal(parsed["x"], 1);
  });

  it("throws on unbound variable", async () => {
    const src = `return { x: undeclared }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_UNBOUND");
        return true;
      }
    );
  });

  it("throws on capability denied", async () => {
    const src = `cap { fs.read: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ allowedCapabilities: new Set() })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_CAP_DENIED");
        return true;
      }
    );
  });

  it("evaluates assert with ok=true", async () => {
    const src = `assert { that: true, msg: "test passes" }\nreturn { ok: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, true);
    assert.equal(result.evidence[0].kind, "assert");
  });

  it("evaluates assert with ok=false (throws)", async () => {
    const src = `assert { that: false, msg: "test fails" }\nreturn { ok: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_ASSERT");
        return true;
      }
    );
  });

  it("evaluates expression statement with -> target", async () => {
    const src = `{ x: 1, y: 2 } -> data\nreturn { data: data }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const data = val["data"] as A0Record;
    assert.equal(data["x"], 1);
    assert.equal(data["y"], 2);
  });

  it("collects trace events", async () => {
    const events: unknown[] = [];
    const src = `let x = 1\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));
    assert.ok(events.length > 0);
  });
});
