/**
 * Tests for a0 trace command behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTrace } from "./cmd-trace.js";

async function captureTrace(
  file: string,
  opts: { json?: boolean }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(" "));

  try {
    const code = await runTrace(file, opts);
    return { code, stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe("a0 trace summary", () => {
  it("does not double-count tool failure and run_end error", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-trace-test-"));
    const tracePath = path.join(tmpDir, "trace.jsonl");
    const events = [
      { ts: "2026-01-01T00:00:00.000Z", runId: "r1", event: "run_start" },
      { ts: "2026-01-01T00:00:00.010Z", runId: "r1", event: "tool_start", data: { tool: "fs.read" } },
      { ts: "2026-01-01T00:00:00.020Z", runId: "r1", event: "tool_end", data: { tool: "fs.read", outcome: "err" } },
      { ts: "2026-01-01T00:00:00.030Z", runId: "r1", event: "run_end", data: { error: "E_TOOL" } },
    ];
    fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    try {
      const result = await captureTrace(tracePath, { json: true });
      assert.equal(result.code, 0);
      const summary = JSON.parse(result.stdout) as { failures: number; toolInvocations: number };
      assert.equal(summary.toolInvocations, 1);
      assert.equal(summary.failures, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("counts run_end error when no other failure events are present", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-trace-test-"));
    const tracePath = path.join(tmpDir, "trace.jsonl");
    const events = [
      { ts: "2026-01-01T00:00:00.000Z", runId: "r2", event: "run_start" },
      { ts: "2026-01-01T00:00:00.050Z", runId: "r2", event: "run_end", data: { error: "E_BUDGET" } },
    ];
    fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    try {
      const result = await captureTrace(tracePath, { json: true });
      assert.equal(result.code, 0);
      const summary = JSON.parse(result.stdout) as { failures: number };
      assert.equal(summary.failures, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
