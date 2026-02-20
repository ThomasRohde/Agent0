import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { validateScenarioConfig } from "./types.js";

function expectInvalid(raw: unknown, messageFragment: string): void {
  assert.throws(
    () => validateScenarioConfig(raw, "test-scenario"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes(messageFragment), err.message);
      return true;
    }
  );
}

describe("validateScenarioConfig", () => {
  it("accepts a valid config with optional fields", () => {
    const raw = {
      cmd: ["run", "program.a0"],
      stdin: "input",
      timeoutMs: 1500,
      policy: {
        allow: ["fs.read"],
        deny: ["sh.exec"],
        limits: { maxToolCalls: 2 },
      },
      capture: { trace: true, evidence: true },
      meta: { tags: ["smoke", "harness"] },
      expect: {
        exitCode: 0,
        stdoutJsonSubset: { ok: true },
        stderrContains: "warn",
        evidenceJsonSubset: [{ ok: true }],
        traceSummarySubset: { failures: 0 },
        stdoutContainsAll: ["ok"],
        stderrContainsAll: ["warn"],
        files: [{ path: "out.txt", text: "ok" }],
      },
    };
    const validated = validateScenarioConfig(raw, "test-scenario");
    assert.equal(validated.expect.exitCode, 0);
  });

  it("rejects non-object roots and missing required fields", () => {
    expectInvalid(null, "must be a JSON object");
    expectInvalid({}, "'cmd' is required");
    expectInvalid({ cmd: ["run", "program.a0"] }, "'expect' is required");
    expectInvalid(
      { cmd: ["run", "program.a0"], expect: {} },
      "'expect.exitCode' is required"
    );
  });

  it("rejects invalid cmd entries", () => {
    expectInvalid(
      { cmd: [], expect: { exitCode: 0 } },
      "'cmd' is required and must be a non-empty string array"
    );
    expectInvalid(
      { cmd: ["run", 42], expect: { exitCode: 0 } },
      "'cmd[1]' must be a string"
    );
  });

  it("rejects mutually exclusive JSON expectations", () => {
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, stdoutJson: {}, stdoutJsonSubset: {} },
      },
      "'expect.stdoutJson' and 'expect.stdoutJsonSubset' are mutually exclusive"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, stderrJson: {}, stderrJsonSubset: {} },
      },
      "'expect.stderrJson' and 'expect.stderrJsonSubset' are mutually exclusive"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, evidenceJson: [], evidenceJsonSubset: [] },
      },
      "'expect.evidenceJson' and 'expect.evidenceJsonSubset' are mutually exclusive"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: {
          exitCode: 0,
          traceSummary: {
            totalEvents: 1,
            toolInvocations: 0,
            toolsByName: {},
            evidenceCount: 0,
            failures: 0,
            budgetExceeded: 0,
          },
          traceSummarySubset: { failures: 0 },
        },
      },
      "'expect.traceSummary' and 'expect.traceSummarySubset' are mutually exclusive"
    );
  });

  it("rejects invalid primitive field types", () => {
    expectInvalid(
      { cmd: ["run", "program.a0"], stdin: 1, expect: { exitCode: 0 } },
      "'stdin' must be a string"
    );
    expectInvalid(
      { cmd: ["run", "program.a0"], timeoutMs: "fast", expect: { exitCode: 0 } },
      "'timeoutMs' must be a number"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, stdoutRegex: 123 },
      },
      "'expect.stdoutRegex' must be a string"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, stdoutContainsAll: "ok" },
      },
      "'expect.stdoutContainsAll' must be a non-empty string array"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, stderrContainsAll: ["ok", ""] },
      },
      "'expect.stderrContainsAll[1]' must be a non-empty string"
    );
  });

  it("rejects invalid policy, capture, and meta shapes", () => {
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        policy: { allow: "fs.read" },
        expect: { exitCode: 0 },
      },
      "'policy.allow' must be a string array"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        policy: { allow: ["fs.read"], deny: [1] },
        expect: { exitCode: 0 },
      },
      "'policy.deny[0]' must be a string"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        capture: { trace: "yes" },
        expect: { exitCode: 0 },
      },
      "'capture.trace' must be a boolean"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        meta: { tags: ["ok", 7] },
        expect: { exitCode: 0 },
      },
      "'meta.tags[1]' must be a string"
    );
  });

  it("rejects malformed file assertions", () => {
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, files: [{ path: "x" }] },
      },
      "must define exactly one of 'sha256', 'text', 'json', or 'absent'"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: {
          exitCode: 0,
          files: [{ path: "x", text: "ok", sha256: "abc" }],
        },
      },
      "must define exactly one of 'sha256', 'text', 'json', or 'absent'"
    );
    expectInvalid(
      {
        cmd: ["run", "program.a0"],
        expect: { exitCode: 0, files: [{ path: "x", absent: false }] },
      },
      "'expect.files[0].absent' must be true"
    );
  });
});
