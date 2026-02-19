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

  it("evaluates expression statement with -> dotted target (2-part)", async () => {
    const src = `{ x: 1 } -> data.info\nreturn { data: data }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const data = val["data"] as A0Record;
    assert.deepEqual(data, { info: { x: 1 } });
  });

  it("evaluates expression statement with -> dotted target (3-part)", async () => {
    const src = `42 -> a.b.c\nreturn { a: a }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const a = val["a"] as A0Record;
    assert.deepEqual(a, { b: { c: 42 } });
  });

  it("collects trace events", async () => {
    const events: unknown[] = [];
    const src = `let x = 1\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));
    assert.ok(events.length > 0);
  });

  it("evaluates null literal", async () => {
    const src = `let x = null\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], null);
  });

  it("evaluates boolean literals", async () => {
    const src = `let a = true\nlet b = false\nreturn { a: a, b: b }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["a"], true);
    assert.equal(val["b"], false);
  });

  it("evaluates float literals", async () => {
    const src = `let pi = 3.14\nreturn { pi: pi }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["pi"], 3.14);
  });

  it("evaluates check with ok=true", async () => {
    const src = `check { that: true, msg: "all good" }\nreturn { ok: true }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, true);
    assert.equal(result.evidence[0].kind, "check");
    assert.equal(result.evidence[0].msg, "all good");
  });

  it("evaluates check with ok=false (non-fatal, records evidence)", async () => {
    const src = `check { that: false, msg: "check fails" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program!, makeOptions());
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, false);
    assert.equal(result.evidence[0].kind, "check");
    assert.equal(result.evidence[0].msg, "check fails");
  });

  it("evaluates assert with details", async () => {
    const src = `assert { that: true, msg: "with details", details: { key: "val" } }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    assert.equal(result.evidence.length, 1);
    assert.deepEqual(result.evidence[0].details, { key: "val" });
  });

  it("evaluates tool call with call?", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(args: A0Record): Promise<A0Value> {
        return `read:${args["key"]}`;
      },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);

    const src = `let result = call? test.read { key: "hello" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps }));
    const val = result.value as A0Record;
    assert.equal(val["result"], "read:hello");
  });

  it("evaluates tool call with do", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.write",
      mode: "effect",
      capabilityId: "test.write",
      async execute(args: A0Record): Promise<A0Value> {
        return { written: args["data"] };
      },
    };
    const tools = new Map([["test.write", mockTool]]);
    const caps = new Set(["test.write"]);

    const src = `do test.write { data: "hello" } -> result\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps }));
    const val = result.value as A0Record;
    const written = val["result"] as A0Record;
    assert.equal(written["written"], "hello");
  });

  it("throws E_CALL_EFFECT when call? used on effect tool", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.write",
      mode: "effect",
      capabilityId: "test.write",
      async execute(): Promise<A0Value> { return null; },
    };
    const tools = new Map([["test.write", mockTool]]);
    const caps = new Set(["test.write"]);

    const src = `call? test.write { data: "hello" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_CALL_EFFECT");
        return true;
      }
    );
  });

  it("throws E_UNKNOWN_TOOL for unknown tool", async () => {
    const src = `call? nonexistent.tool { key: "val" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_UNKNOWN_TOOL");
        return true;
      }
    );
  });

  it("throws E_CAP_DENIED when tool capability not allowed", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return null; },
    };
    const tools = new Map([["test.read", mockTool]]);

    const src = `call? test.read { key: "val" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: new Set() })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_CAP_DENIED");
        return true;
      }
    );
  });

  it("throws E_TOOL when tool execution fails", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.fail",
      mode: "read",
      capabilityId: "test.fail",
      async execute(): Promise<A0Value> {
        throw new Error("tool broke");
      },
    };
    const tools = new Map([["test.fail", mockTool]]);
    const caps = new Set(["test.fail"]);

    const src = `call? test.fail { key: "val" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TOOL");
        assert.ok(err.message.includes("tool broke"));
        return true;
      }
    );
  });

  it("throws E_UNKNOWN_FN for unknown stdlib function", async () => {
    const src = `let x = nonexistent.fn { in: "hello" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_UNKNOWN_FN");
        return true;
      }
    );
  });

  it("throws E_FN when stdlib function throws", async () => {
    const brokenFn: StdlibFn = {
      name: "broken.fn",
      execute(): A0Value {
        throw new Error("stdlib broke");
      },
    };
    const stdlib = new Map([["broken.fn", brokenFn]]);

    const src = `let x = broken.fn { in: "hello" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ stdlib })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_FN");
        assert.ok(err.message.includes("stdlib broke"));
        return true;
      }
    );
  });

  it("throws E_PATH when accessing property on non-record", async () => {
    const src = `let x = 42\nreturn { val: x.foo }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_PATH");
        return true;
      }
    );
  });

  it("evaluates empty list", async () => {
    const src = `let items = []\nreturn { items: items }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.deepEqual(val["items"], []);
  });

  it("evaluates empty record", async () => {
    const src = `return {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    assert.deepEqual(result.value, {});
  });

  it("evaluates path traversal returning null for missing fields", async () => {
    const src = `let data = { a: { b: 1 } }\nreturn { val: data.a.c }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["val"], null);
  });

  it("collects trace events with correct structure", async () => {
    const events: import("./evaluator.js").TraceEvent[] = [];
    const src = `let x = 1\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("run_start"));
    assert.ok(eventNames.includes("run_end"));
    assert.ok(eventNames.includes("stmt_start"));
    assert.ok(eventNames.includes("stmt_end"));

    for (const ev of events) {
      assert.equal(ev.runId, "test-run");
      assert.ok(ev.ts);
    }
  });

  it("traces tool calls", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return "data"; },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);
    const events: import("./evaluator.js").TraceEvent[] = [];

    const src = `let x = call? test.read { key: "val" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps, trace: (ev) => events.push(ev) }));

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("tool_start"));
    assert.ok(eventNames.includes("tool_end"));
  });

  it("evaluates multiple capabilities in header", async () => {
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const caps = new Set(["fs.read", "http.get"]);
    const result = await execute(pr.program, makeOptions({ allowedCapabilities: caps }));
    assert.deepEqual(result.value, {});
  });

  it("coerces non-empty string to true in assert", async () => {
    const src = `assert { that: "non-empty", msg: "string is truthy" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    assert.equal(result.evidence[0].ok, true);
  });

  it("coerces 0 to false in assert", async () => {
    const src = `assert { that: 0, msg: "zero is falsy" }\nreturn {}`;
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

  it("coerces null to false in check (non-fatal)", async () => {
    const src = `check { that: null, msg: "null is falsy" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program!, makeOptions());
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, false);
    assert.equal(result.evidence[0].kind, "check");
    assert.equal(result.evidence[0].msg, "null is falsy");
  });

  it("treats NaN as truthy in assert", async () => {
    const nanTool: import("./evaluator.js").ToolDef = {
      name: "test.nan",
      mode: "read",
      capabilityId: "test.nan",
      async execute(): Promise<A0Value> {
        return Number.NaN;
      },
    };
    const tools = new Map([["test.nan", nanTool]]);
    const caps = new Set(["test.nan"]);

    const src = `let n = call? test.nan {}\nassert { that: n, msg: "nan is truthy" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps }));
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, true);
    assert.equal(result.evidence[0].kind, "assert");
  });

  it("treats NaN as truthy in check", async () => {
    const nanTool: import("./evaluator.js").ToolDef = {
      name: "test.nan",
      mode: "read",
      capabilityId: "test.nan",
      async execute(): Promise<A0Value> {
        return Number.NaN;
      },
    };
    const tools = new Map([["test.nan", nanTool]]);
    const caps = new Set(["test.nan"]);

    const src = `let n = call? test.nan {}\ncheck { that: n, msg: "nan is truthy" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps }));
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].ok, true);
    assert.equal(result.evidence[0].kind, "check");
  });

  // --- Budget enforcement tests ---

  it("merges budget fields across multiple budget headers", async () => {
    const src = `budget { timeMs: 100000 }\nbudget { maxIterations: 1 }\nlet xs = [1, 2]\nlet ys = for { in: xs, as: "x" } {\n  return { v: x }\n}\nreturn { ys: ys }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("maxIterations"));
        return true;
      }
    );
  });

  it("enforces maxToolCalls budget", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return "data"; },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);

    const src = `budget { maxToolCalls: 1 }\ncap { test.read: true }\nlet a = call? test.read { key: "1" }\nlet b = call? test.read { key: "2" }\nreturn { a: a, b: b }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("maxToolCalls"));
        return true;
      }
    );
  });

  it("does not exceed maxToolCalls when within budget", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return "data"; },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);

    const src = `budget { maxToolCalls: 2 }\ncap { test.read: true }\nlet a = call? test.read { key: "1" }\nreturn { a: a }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps }));
    const val = result.value as A0Record;
    assert.equal(val["a"], "data");
  });

  it("enforces maxBytesWritten budget", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.write",
      mode: "effect",
      capabilityId: "test.write",
      async execute(): Promise<A0Value> { return { bytes: 100 }; },
    };
    const tools = new Map([["test.write", mockTool]]);
    const caps = new Set(["test.write"]);

    const src = `budget { maxBytesWritten: 50 }\ncap { test.write: true }\ndo test.write { data: "hello" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("maxBytesWritten"));
        return true;
      }
    );
  });

  it("budget not declared - runs unlimited", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return "data"; },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);

    const src = `cap { test.read: true }\nlet a = call? test.read { key: "1" }\nlet b = call? test.read { key: "2" }\nlet c = call? test.read { key: "3" }\nreturn { a: a, b: b, c: c }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps }));
    const val = result.value as A0Record;
    assert.equal(val["a"], "data");
    assert.equal(val["b"], "data");
    assert.equal(val["c"], "data");
  });

  it("budget values included in run_start trace", async () => {
    const events: import("./evaluator.js").TraceEvent[] = [];
    const src = `budget { timeMs: 5000, maxToolCalls: 10 }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));

    const runStart = events.find((e) => e.event === "run_start");
    assert.ok(runStart);
    assert.ok(runStart!.data);
    const budgetData = runStart!.data!["budget"] as A0Record;
    assert.ok(budgetData);
    assert.equal(budgetData["timeMs"], 5000);
    assert.equal(budgetData["maxToolCalls"], 10);
  });

  it("enforces timeMs budget", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.slow",
      mode: "read",
      capabilityId: "test.slow",
      async execute(): Promise<A0Value> {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      },
    };
    const tools = new Map([["test.slow", mockTool]]);
    const caps = new Set(["test.slow"]);

    const src = `budget { timeMs: 1 }\ncap { test.slow: true }\nlet a = call? test.slow { key: "1" }\nlet b = call? test.slow { key: "2" }\nreturn { a: a, b: b }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("timeMs"));
        return true;
      }
    );
  });

  // --- Schema validation tests ---

  it("tool with inputSchema rejects invalid args with E_TOOL_ARGS", async () => {
    const mockSchema = {
      parse(data: unknown) {
        const rec = data as Record<string, unknown>;
        if (typeof rec["key"] !== "string") {
          throw { issues: [{ path: ["key"], message: "Expected string, received number" }] };
        }
        return data;
      }
    };
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.schema",
      mode: "read",
      capabilityId: "test.schema",
      inputSchema: mockSchema,
      async execute(args: A0Record): Promise<A0Value> {
        return { key: args["key"] };
      },
    };
    const tools = new Map([["test.schema", mockTool]]);
    const caps = new Set(["test.schema"]);

    const src = `let result = call? test.schema { key: 42 }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TOOL_ARGS");
        assert.ok(err.message.includes("test.schema"));
        assert.ok(err.message.includes("key"));
        return true;
      }
    );
  });

  it("tool with inputSchema accepts valid args", async () => {
    const mockSchema = {
      parse(data: unknown) {
        const rec = data as Record<string, unknown>;
        if (typeof rec["key"] !== "string") {
          throw { issues: [{ path: ["key"], message: "Expected string, received number" }] };
        }
        return data;
      }
    };
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.schema",
      mode: "read",
      capabilityId: "test.schema",
      inputSchema: mockSchema,
      async execute(args: A0Record): Promise<A0Value> {
        return { key: args["key"] };
      },
    };
    const tools = new Map([["test.schema", mockTool]]);
    const caps = new Set(["test.schema"]);

    const src = `let result = call? test.schema { key: "hello" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps }));
    const val = result.value as A0Record;
    const inner = val["result"] as A0Record;
    assert.equal(inner["key"], "hello");
  });

  // --- Trace enrichment tests ---

  it("run_start trace includes capabilities list", async () => {
    const events: import("./evaluator.js").TraceEvent[] = [];
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const caps = new Set(["fs.read", "http.get"]);
    await execute(pr.program, makeOptions({ allowedCapabilities: caps, trace: (ev) => events.push(ev) }));

    const runStart = events.find((e) => e.event === "run_start");
    assert.ok(runStart);
    assert.ok(runStart!.data);
    const capabilities = runStart!.data!["capabilities"] as string[];
    assert.ok(Array.isArray(capabilities));
    assert.ok(capabilities.includes("fs.read"));
    assert.ok(capabilities.includes("http.get"));
  });

  it("run_end trace includes durationMs", async () => {
    const events: import("./evaluator.js").TraceEvent[] = [];
    const src = `return {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));

    const runEnd = events.find((e) => e.event === "run_end");
    assert.ok(runEnd);
    assert.ok(runEnd!.data);
    assert.equal(typeof runEnd!.data!["durationMs"], "number");
    assert.ok((runEnd!.data!["durationMs"] as number) >= 0);
  });

  // --- Arithmetic & comparison tests ---

  it("evaluates arithmetic addition", async () => {
    const src = `let x = 2 + 3\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 5);
  });

  it("evaluates arithmetic subtraction", async () => {
    const src = `let x = 10 - 4\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 6);
  });

  it("evaluates arithmetic multiplication", async () => {
    const src = `let x = 3 * 7\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 21);
  });

  it("evaluates arithmetic division", async () => {
    const src = `let x = 15 / 4\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 3.75);
  });

  it("evaluates arithmetic modulo", async () => {
    const src = `let x = 10 % 3\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 1);
  });

  it("evaluates operator precedence", async () => {
    const src = `let x = 2 + 3 * 4\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 14);
  });

  it("evaluates parenthesized expressions", async () => {
    const src = `let x = (2 + 3) * 4\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], 20);
  });

  it("evaluates unary minus", async () => {
    const src = `let x = -42\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["x"], -42);
  });

  it("evaluates comparison operators", async () => {
    const src = `let a = 5 > 3\nlet b = 2 < 1\nlet c = 3 >= 3\nlet d = 4 <= 3\nlet e = 5 == 5\nlet f = 5 != 6\nreturn { a: a, b: b, c: c, d: d, e: e, f: f }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["a"], true);
    assert.equal(val["b"], false);
    assert.equal(val["c"], true);
    assert.equal(val["d"], false);
    assert.equal(val["e"], true);
    assert.equal(val["f"], true);
  });

  it("evaluates deep equality with ==", async () => {
    const src = `let a = [1, 2] == [1, 2]\nlet b = { x: 1 } == { x: 1 }\nlet c = [1, 2] != [1, 3]\nlet d = { x: 1, y: 2 } == { y: 2, x: 1 }\nreturn { a: a, b: b, c: c, d: d }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["a"], true);
    assert.equal(val["b"], true);
    assert.equal(val["c"], true);
    assert.equal(val["d"], true);
  });

  it("evaluates string comparison", async () => {
    const src = `let a = "b" > "a"\nlet b = "apple" < "banana"\nreturn { a: a, b: b }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["a"], true);
    assert.equal(val["b"], true);
  });

  it("throws E_TYPE for arithmetic on non-numbers", async () => {
    const src = `let x = "hello" + 1\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        return true;
      }
    );
  });

  it("throws E_TYPE for division by zero", async () => {
    const src = `let x = 10 / 0\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        return true;
      }
    );
  });

  it("throws E_TYPE for modulo by zero", async () => {
    const src = `let x = 10 % 0\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        return true;
      }
    );
  });

  it("throws E_TYPE for unary minus on non-number", async () => {
    const src = `let x = -"hello"\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        return true;
      }
    );
  });

  it("throws E_TYPE for ordering comparison on mixed types", async () => {
    const src = `let x = 1 > "hello"\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        return true;
      }
    );
  });

  it("evaluates arithmetic with variables", async () => {
    const src = `let a = 10\nlet b = 3\nlet c = a + b * 2\nreturn { c: c }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.equal(val["c"], 16);
  });

  // --- map tests ---

  it("map with single-param function", async () => {
    const src = `fn double { x } {\n  return { val: x * 2 }\n}\nlet nums = [1, 2, 3]\nlet result = map { in: nums, fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const mapped = val["result"] as A0Record[];
    assert.equal(mapped.length, 3);
    assert.equal(mapped[0]["val"], 2);
    assert.equal(mapped[1]["val"], 4);
    assert.equal(mapped[2]["val"], 6);
  });

  it("map with empty list returns []", async () => {
    const src = `fn double { x } {\n  return { val: x * 2 }\n}\nlet result = map { in: [], fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    assert.deepEqual(val["result"], []);
  });

  it("map E_TYPE when in is not a list", async () => {
    const src = `fn double { x } {\n  return { val: x * 2 }\n}\nlet result = map { in: 42, fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        assert.ok(err.message.includes("list"));
        return true;
      }
    );
  });

  it("map E_TYPE when fn is not a string", async () => {
    const src = `let result = map { in: [1, 2], fn: 42 }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_TYPE");
        assert.ok(err.message.includes("string"));
        return true;
      }
    );
  });

  it("map E_UNKNOWN_FN when function does not exist", async () => {
    const src = `let result = map { in: [1, 2], fn: "nonexistent" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_UNKNOWN_FN");
        assert.ok(err.message.includes("nonexistent"));
        return true;
      }
    );
  });

  it("map propagates errors from mapped function", async () => {
    const src = `fn boom { x } {\n  assert { that: false, msg: "fail" }\n  return { x: x }\n}\nlet result = map { in: [1], fn: "boom" }\nreturn { result: result }`;
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

  it("map respects maxIterations budget", async () => {
    const src = `budget { maxIterations: 2 }\nfn double { x } {\n  return { val: x * 2 }\n}\nlet result = map { in: [1, 2, 3], fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions()),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("maxIterations"));
        return true;
      }
    );
  });

  it("map emits map_start/map_end and fn_call_start/fn_call_end trace events", async () => {
    const events: import("./evaluator.js").TraceEvent[] = [];
    const src = `fn double { x } {\n  return { val: x * 2 }\n}\nlet result = map { in: [1, 2], fn: "double" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ trace: (ev) => events.push(ev) }));

    const eventNames = events.map((e) => e.event);
    assert.ok(eventNames.includes("map_start"));
    assert.ok(eventNames.includes("map_end"));
    assert.ok(eventNames.includes("fn_call_start"));
    assert.ok(eventNames.includes("fn_call_end"));

    const mapStart = events.find((e) => e.event === "map_start");
    assert.ok(mapStart!.data);
    assert.equal(mapStart!.data!["fn"], "double");
    assert.equal(mapStart!.data!["listLength"], 2);
  });

  it("map with multi-param function on record items", async () => {
    const src = `fn fullName { first, last } {\n  let name = str.concat { parts: [first, " ", last] }\n  return { name: name }\n}\nlet people = [{ first: "Alice", last: "Smith" }, { first: "Bob", last: "Jones" }]\nlet result = map { in: people, fn: "fullName" }\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    // Provide str.concat stdlib
    const strConcat: StdlibFn = {
      name: "str.concat",
      execute(args: A0Record): A0Value {
        const parts = args["parts"] as A0Value[];
        return parts.map(String).join("");
      },
    };
    const stdlib = new Map([["str.concat", strConcat]]);

    const result = await execute(pr.program, makeOptions({ stdlib }));
    const val = result.value as A0Record;
    const mapped = val["result"] as A0Record[];
    assert.deepEqual(mapped[0]["name"], "Alice Smith");
    assert.deepEqual(mapped[1]["name"], "Bob Jones");
  });

  it("evaluates match with parenthesized expression subject", async () => {
    const src = `let x = match ({ ok: 42 }) {\n  ok { v } {\n    return { v: v }\n  }\n  err { e } {\n    return { e: e }\n  }\n}\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const x = val["x"] as A0Record;
    assert.equal(x["v"], 42);
  });

  it("evaluates match with inline record expression subject", async () => {
    const src = `let x = match ({ err: "fail" }) {\n  ok { v } {\n    return { v: v }\n  }\n  err { e } {\n    return { e: e }\n  }\n}\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    const result = await execute(pr.program, makeOptions());
    const val = result.value as A0Record;
    const x = val["x"] as A0Record;
    assert.equal(x["e"], "fail");
  });

  it("enforces timeMs budget after tool call in return expression", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.slow",
      mode: "read",
      capabilityId: "test.slow",
      async execute(): Promise<A0Value> {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "done";
      },
    };
    const tools = new Map([["test.slow", mockTool]]);
    const caps = new Set(["test.slow"]);

    const src = `budget { timeMs: 10 }\ncap { test.slow: true }\nreturn { result: call? test.slow { key: "1" } }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ tools, allowedCapabilities: caps })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("timeMs"));
        return true;
      }
    );
  });

  it("enforces timeMs budget after stdlib call in return expression", async () => {
    const slowFn: StdlibFn = {
      name: "slow.fn",
      execute(): A0Value {
        const start = Date.now();
        while (Date.now() - start < 30) {
          // Intentional busy wait for budget test.
        }
        return "done";
      },
    };
    const stdlib = new Map([["slow.fn", slowFn]]);

    const src = `budget { timeMs: 1 }\nreturn { result: slow.fn { in: "x" } }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await assert.rejects(
      () => execute(pr.program!, makeOptions({ stdlib })),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_BUDGET");
        assert.ok(err.message.includes("timeMs"));
        return true;
      }
    );
  });

  it("tool_start trace includes mode", async () => {
    const mockTool: import("./evaluator.js").ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> { return "data"; },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);
    const events: import("./evaluator.js").TraceEvent[] = [];

    const src = `let x = call? test.read { key: "val" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(pr.program, makeOptions({ tools, allowedCapabilities: caps, trace: (ev) => events.push(ev) }));

    const toolStart = events.find((e) => e.event === "tool_start");
    assert.ok(toolStart);
    assert.ok(toolStart!.data);
    assert.equal(toolStart!.data!["mode"], "read");
  });
});
