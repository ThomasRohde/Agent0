/**
 * Tests for a0 run command behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { runRun } from "./cmd-run.js";

const require = createRequire(import.meta.url);

function withCapturedConsole<T>(fn: () => Promise<T>): Promise<T> {
  const origLog = console.log;
  const origError = console.error;
  console.log = () => {};
  console.error = () => {};
  return fn().finally(() => {
    console.log = origLog;
    console.error = origError;
  });
}

describe("a0 run evidence output", () => {
  it("writes [] to evidence file when no evidence is produced", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-run-test-"));
    const programPath = path.join(tmpDir, "ok.a0");
    const evidencePath = path.join(tmpDir, "evidence.json");

    fs.writeFileSync(programPath, `return { ok: true }\n`, "utf-8");
    fs.writeFileSync(evidencePath, `[{"kind":"assert","ok":false}]`, "utf-8");

    try {
      const code = await withCapturedConsole(() =>
        runRun(programPath, { evidence: evidencePath, unsafeAllowAll: true })
      );

      assert.equal(code, 0);
      const parsed = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
      assert.deepEqual(parsed, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("writes assert evidence on fatal assertion failure", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-run-test-"));
    const programPath = path.join(tmpDir, "assert-fail.a0");
    const evidencePath = path.join(tmpDir, "evidence.json");

    fs.writeFileSync(programPath, `assert { that: false, msg: "boom" }\nreturn { ok: true }\n`, "utf-8");

    try {
      const code = await withCapturedConsole(() =>
        runRun(programPath, { evidence: evidencePath, unsafeAllowAll: true })
      );

      assert.equal(code, 5);
      const parsed = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
      assert.equal(Array.isArray(parsed), true);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].kind, "assert");
      assert.equal(parsed[0].ok, false);
      assert.equal(parsed[0].msg, "boom");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns E_IO when trace write fails after trace file is opened", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-run-test-"));
    const programPath = path.join(tmpDir, "ok.a0");
    const tracePath = path.join(tmpDir, "trace.jsonl");

    fs.writeFileSync(programPath, `return { ok: true }\n`, "utf-8");

    const fsCjs = require("fs") as typeof import("node:fs");
    const originalWriteSync = fsCjs.writeSync;

    fsCjs.writeSync = (() => {
      throw new Error("simulated trace write failure");
    }) as typeof fsCjs.writeSync;
    syncBuiltinESMExports();

    try {
      const code = await withCapturedConsole(() =>
        runRun(programPath, { trace: tracePath, unsafeAllowAll: true })
      );
      assert.equal(code, 4);
    } finally {
      fsCjs.writeSync = originalWriteSync;
      syncBuiltinESMExports();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns E_IO when trace close fails in finalization", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-run-test-"));
    const programPath = path.join(tmpDir, "ok.a0");
    const tracePath = path.join(tmpDir, "trace.jsonl");

    fs.writeFileSync(programPath, `return { ok: true }\n`, "utf-8");

    const fsCjs = require("fs") as typeof import("node:fs");
    const originalCloseSync = fsCjs.closeSync;

    fsCjs.closeSync = (() => {
      throw new Error("simulated trace close failure");
    }) as typeof fsCjs.closeSync;
    syncBuiltinESMExports();

    try {
      const code = await withCapturedConsole(() =>
        runRun(programPath, { trace: tracePath, unsafeAllowAll: true })
      );
      assert.equal(code, 4);
    } finally {
      fsCjs.closeSync = originalCloseSync;
      syncBuiltinESMExports();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
