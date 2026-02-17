/**
 * Golden trace tests — verify the evaluator emits the correct trace event
 * sequence with the expected data shapes.
 *
 * Non-deterministic fields (timestamps, durationMs) are validated for type
 * correctness rather than exact value.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parse } from "./parser.js";
import { execute, A0RuntimeError } from "./evaluator.js";
import type {
  ExecOptions,
  TraceEvent,
  A0Value,
  A0Record,
  ToolDef,
} from "./evaluator.js";

function makeOptions(overrides?: Partial<ExecOptions>): ExecOptions {
  return {
    allowedCapabilities: new Set(),
    tools: new Map(),
    stdlib: new Map(),
    runId: "test-run",
    ...overrides,
  };
}

/**
 * Sanitize non-deterministic fields for golden comparison.
 * Keeps event name and data (minus timestamps/durations/file paths).
 */
function sanitizeEvents(events: TraceEvent[]): unknown[] {
  return events.map((ev) => {
    const sanitized: Record<string, unknown> = {
      event: ev.event,
    };
    if (ev.data) {
      const data = { ...ev.data };
      // Remove non-deterministic fields
      if ("durationMs" in data) delete data["durationMs"];
      if ("file" in data) data["file"] = "<FILE>";
      if (Object.keys(data).length > 0) sanitized["data"] = data;
    }
    return sanitized;
  });
}

describe("Trace Golden Tests", () => {
  it("simple program emits run_start, stmt events, run_end", async () => {
    const events: TraceEvent[] = [];
    const src = `let x = 1\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const eventNames = events.map((e) => e.event);
    assert.deepEqual(eventNames, [
      "run_start",
      "stmt_start",
      "stmt_end", // let x = 1
      "stmt_start",
      "stmt_end", // return { x: x }
      "run_end",
    ]);

    // run_start should have file info
    assert.ok(events[0].data);
    assert.equal(events[0].data!["file"], "test.a0");

    // run_end should have durationMs
    const runEnd = events[events.length - 1];
    assert.equal(runEnd.event, "run_end");
    assert.ok(runEnd.data);
    assert.equal(typeof (runEnd.data as A0Record)["durationMs"], "number");

    // All events should have correct runId and timestamp
    for (const ev of events) {
      assert.equal(ev.runId, "test-run");
      assert.ok(ev.ts);
    }
  });

  it("tool call emits tool_start and tool_end with enriched data", async () => {
    const mockTool: ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> {
        return "data";
      },
    };
    const tools = new Map([["test.read", mockTool]]);
    const caps = new Set(["test.read"]);
    const events: TraceEvent[] = [];

    const src = `cap { test.read: true }\nlet x = call? test.read { key: "val" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({
        tools,
        allowedCapabilities: caps,
        trace: (ev) => events.push(ev),
      })
    );

    // Find tool events
    const toolStart = events.find((e) => e.event === "tool_start");
    const toolEnd = events.find((e) => e.event === "tool_end");

    assert.ok(toolStart);
    assert.ok(toolEnd);

    // tool_start should have tool name, args, and mode
    assert.equal((toolStart!.data as A0Record)["tool"], "test.read");
    assert.equal((toolStart!.data as A0Record)["mode"], "read");
    assert.ok((toolStart!.data as A0Record)["args"]);

    // tool_end should have outcome and durationMs
    assert.equal((toolEnd!.data as A0Record)["tool"], "test.read");
    assert.equal((toolEnd!.data as A0Record)["outcome"], "ok");
    assert.equal(
      typeof (toolEnd!.data as A0Record)["durationMs"],
      "number"
    );
  });

  it("evidence emits evidence trace event", async () => {
    const events: TraceEvent[] = [];
    const src = `assert { that: true, msg: "test passes" } -> ev\nreturn { ev: ev }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const evidenceEvents = events.filter((e) => e.event === "evidence");
    assert.equal(evidenceEvents.length, 1);

    const evData = evidenceEvents[0].data as A0Record;
    assert.equal(evData["ok"], true);
    assert.equal(evData["msg"], "test passes");
    assert.equal(evData["kind"], "assert");
  });

  it("failed assertion emits evidence then stops", async () => {
    const events: TraceEvent[] = [];
    const src = `assert { that: false, msg: "fails" }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    try {
      await execute(
        pr.program!,
        makeOptions({ trace: (ev) => events.push(ev) })
      );
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e instanceof A0RuntimeError);
      assert.equal((e as A0RuntimeError).code, "E_ASSERT");
    }

    const evidenceEvents = events.filter((e) => e.event === "evidence");
    assert.equal(evidenceEvents.length, 1);
    assert.equal((evidenceEvents[0].data as A0Record)["ok"], false);

    // Should still have run_start
    assert.ok(events.some((e) => e.event === "run_start"));

    // run_end SHOULD be emitted even on failure, with error info
    const runEnd = events.find((e) => e.event === "run_end");
    assert.ok(runEnd, "run_end should be emitted even on failure");
    assert.ok(runEnd!.data);
    assert.equal((runEnd!.data as A0Record)["error"], "E_ASSERT");
    assert.equal(typeof (runEnd!.data as A0Record)["durationMs"], "number");
  });

  it("run_start includes declared capabilities", async () => {
    const events: TraceEvent[] = [];
    const src = `cap { fs.read: true, http.get: true }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({
        allowedCapabilities: new Set(["fs.read", "http.get"]),
        trace: (ev) => events.push(ev),
      })
    );

    const runStart = events.find((e) => e.event === "run_start");
    assert.ok(runStart);
    const data = runStart!.data as A0Record;
    const capsList = data["capabilities"] as string[];
    assert.ok(Array.isArray(capsList));
    assert.ok(capsList.includes("fs.read"));
    assert.ok(capsList.includes("http.get"));
  });

  it("budget info included in run_start trace", async () => {
    const events: TraceEvent[] = [];
    const src = `budget { maxToolCalls: 5 }\nreturn {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const runStart = events.find((e) => e.event === "run_start");
    assert.ok(runStart);
    const data = runStart!.data as A0Record;
    const budgetData = data["budget"] as A0Record;
    assert.ok(budgetData);
    assert.equal(budgetData["maxToolCalls"], 5);
  });

  it("trace event sequence is ordered correctly for mixed operations", async () => {
    const mockTool: ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> {
        return "result";
      },
    };
    const events: TraceEvent[] = [];
    const src = `cap { test.read: true }\nlet x = call? test.read { key: "val" }\nassert { that: true, msg: "ok" } -> ev\nreturn { x: x, ev: ev }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({
        tools: new Map([["test.read", mockTool]]),
        allowedCapabilities: new Set(["test.read"]),
        trace: (ev) => events.push(ev),
      })
    );

    const eventNames = events.map((e) => e.event);

    // Expected sequence:
    // run_start
    // stmt_start (let x = call? ...)
    //   tool_start
    //   tool_end
    // stmt_end
    // stmt_start (assert ...)
    //   evidence
    // stmt_end
    // stmt_start (return ...)
    // stmt_end
    // run_end
    assert.equal(eventNames[0], "run_start");
    assert.equal(eventNames[eventNames.length - 1], "run_end");

    // tool_start should come before tool_end
    const toolStartIdx = eventNames.indexOf("tool_start");
    const toolEndIdx = eventNames.indexOf("tool_end");
    assert.ok(toolStartIdx >= 0, "tool_start must be present");
    assert.ok(toolEndIdx >= 0, "tool_end must be present");
    assert.ok(
      toolStartIdx < toolEndIdx,
      "tool_start must precede tool_end"
    );

    // tool events should be nested within stmt_start/stmt_end
    // Find the stmt_start that precedes tool_start
    const stmtStartBeforeTool = eventNames.lastIndexOf(
      "stmt_start",
      toolStartIdx
    );
    const stmtEndAfterTool = eventNames.indexOf("stmt_end", toolEndIdx);
    assert.ok(
      stmtStartBeforeTool < toolStartIdx,
      "stmt_start should precede tool_start"
    );
    assert.ok(
      toolEndIdx < stmtEndAfterTool,
      "tool_end should precede stmt_end"
    );

    // evidence should be present
    assert.ok(eventNames.includes("evidence"));
  });

  it("failed tool emits tool_end with outcome err", async () => {
    const mockTool: ToolDef = {
      name: "test.fail",
      mode: "read",
      capabilityId: "test.fail",
      async execute(): Promise<A0Value> {
        throw new Error("tool broke");
      },
    };
    const tools = new Map([["test.fail", mockTool]]);
    const caps = new Set(["test.fail"]);
    const events: TraceEvent[] = [];

    const src = `cap { test.fail: true }\nlet x = call? test.fail { key: "val" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    try {
      await execute(
        pr.program!,
        makeOptions({
          tools,
          allowedCapabilities: caps,
          trace: (ev) => events.push(ev),
        })
      );
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e instanceof A0RuntimeError);
      assert.equal((e as A0RuntimeError).code, "E_TOOL");
    }

    // tool_end with outcome "err" should have been emitted
    const toolEnd = events.find((e) => e.event === "tool_end");
    assert.ok(toolEnd);
    assert.equal((toolEnd!.data as A0Record)["outcome"], "err");
    assert.equal((toolEnd!.data as A0Record)["tool"], "test.fail");
    assert.equal(typeof (toolEnd!.data as A0Record)["durationMs"], "number");
    assert.equal((toolEnd!.data as A0Record)["error"], "tool broke");
  });

  it("sanitizeEvents removes non-deterministic fields", () => {
    const events: TraceEvent[] = [
      {
        ts: "2026-01-01T00:00:00.000Z",
        runId: "test-run",
        event: "run_start",
        data: { file: "test.a0", capabilities: [] as unknown as A0Value },
      },
      {
        ts: "2026-01-01T00:00:01.000Z",
        runId: "test-run",
        event: "run_end",
        data: { durationMs: 42 },
      },
    ];

    const sanitized = sanitizeEvents(events);
    assert.equal(sanitized.length, 2);

    // file should be replaced with <FILE>
    const start = sanitized[0] as Record<string, unknown>;
    assert.equal(start["event"], "run_start");
    const startData = start["data"] as Record<string, unknown>;
    assert.equal(startData["file"], "<FILE>");

    // durationMs should be removed; run_end data is empty so no data key
    const end = sanitized[1] as Record<string, unknown>;
    assert.equal(end["event"], "run_end");
    assert.equal(end["data"], undefined);
  });

  it("check expression emits evidence with kind check", async () => {
    const events: TraceEvent[] = [];
    const src = `check { that: true, msg: "all good" } -> ev\nreturn { ev: ev }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const evidenceEvents = events.filter((e) => e.event === "evidence");
    assert.equal(evidenceEvents.length, 1);

    const evData = evidenceEvents[0].data as A0Record;
    assert.equal(evData["kind"], "check");
    assert.equal(evData["ok"], true);
    assert.equal(evData["msg"], "all good");
  });

  it("do statement emits tool events with mode effect", async () => {
    const mockTool: ToolDef = {
      name: "test.write",
      mode: "effect",
      capabilityId: "test.write",
      async execute(args: A0Record): Promise<A0Value> {
        return { written: args["data"] };
      },
    };
    const tools = new Map([["test.write", mockTool]]);
    const caps = new Set(["test.write"]);
    const events: TraceEvent[] = [];

    const src = `cap { test.write: true }\ndo test.write { data: "hello" } -> result\nreturn { result: result }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({
        tools,
        allowedCapabilities: caps,
        trace: (ev) => events.push(ev),
      })
    );

    const toolStart = events.find((e) => e.event === "tool_start");
    assert.ok(toolStart);
    assert.equal((toolStart!.data as A0Record)["tool"], "test.write");
    assert.equal((toolStart!.data as A0Record)["mode"], "effect");

    const toolEnd = events.find((e) => e.event === "tool_end");
    assert.ok(toolEnd);
    assert.equal((toolEnd!.data as A0Record)["outcome"], "ok");
  });

  it("timestamps are valid ISO strings and monotonically non-decreasing", async () => {
    const events: TraceEvent[] = [];
    const src = `let x = 1\nlet y = 2\nreturn { x: x, y: y }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    for (let i = 0; i < events.length; i++) {
      const ts = new Date(events[i].ts);
      assert.ok(!isNaN(ts.getTime()), `event ${i} has valid ISO timestamp`);

      if (i > 0) {
        const prevTs = new Date(events[i - 1].ts);
        assert.ok(
          ts.getTime() >= prevTs.getTime(),
          `event ${i} timestamp should be >= event ${i - 1}`
        );
      }
    }
  });

  it("no-op program emits minimal trace", async () => {
    const events: TraceEvent[] = [];
    const src = `return {}`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const eventNames = events.map((e) => e.event);
    assert.deepEqual(eventNames, [
      "run_start",
      "stmt_start",
      "stmt_end", // return {}
      "run_end",
    ]);
  });

  it("golden snapshot for simple program", async () => {
    const events: TraceEvent[] = [];
    const src = `let x = 42\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({ trace: (ev) => events.push(ev) })
    );

    const golden = sanitizeEvents(events);
    assert.deepEqual(golden, [
      { event: "run_start", data: { file: "<FILE>", capabilities: [] } },
      { event: "stmt_start" },
      { event: "stmt_end" },
      { event: "stmt_start" },
      { event: "stmt_end" },
      { event: "run_end" },
    ]);
  });

  it("golden snapshot for tool call program", async () => {
    const mockTool: ToolDef = {
      name: "test.read",
      mode: "read",
      capabilityId: "test.read",
      async execute(): Promise<A0Value> {
        return "hello";
      },
    };
    const events: TraceEvent[] = [];
    const src = `cap { test.read: true }\nlet x = call? test.read { key: "val" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);
    await execute(
      pr.program,
      makeOptions({
        tools: new Map([["test.read", mockTool]]),
        allowedCapabilities: new Set(["test.read"]),
        trace: (ev) => events.push(ev),
      })
    );

    const golden = sanitizeEvents(events);
    assert.deepEqual(golden, [
      {
        event: "run_start",
        data: {
          file: "<FILE>",
          capabilities: ["test.read"],
        },
      },
      { event: "stmt_start" },
      {
        event: "tool_start",
        data: {
          tool: "test.read",
          args: { key: "val" },
          mode: "read",
        },
      },
      {
        event: "tool_end",
        data: {
          tool: "test.read",
          outcome: "ok",
        },
      },
      { event: "stmt_end" },
      { event: "stmt_start" },
      { event: "stmt_end" },
      { event: "run_end" },
    ]);
  });
});
