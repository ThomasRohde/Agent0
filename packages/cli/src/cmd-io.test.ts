/**
 * Tests for CLI command I/O error behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { runCheck } from "./cmd-check.js";
import { runFmt } from "./cmd-fmt.js";
import { runRun } from "./cmd-run.js";

const require = createRequire(import.meta.url);

async function captureCmd(
  fn: () => Promise<number>
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(" "));

  try {
    const code = await fn();
    return { code, stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe("CLI I/O errors", () => {
  it("a0 check returns exit code 4 with E_IO on file read failure", async () => {
    const missing = path.join(os.tmpdir(), `a0-missing-check-${Date.now()}.a0`);
    const result = await captureCmd(() => runCheck(missing, {}));
    assert.equal(result.code, 4);
    assert.ok(result.stderr.includes('"code":"E_IO"'));
  });

  it("a0 fmt returns exit code 4 with E_IO on file read failure", async () => {
    const missing = path.join(os.tmpdir(), `a0-missing-fmt-${Date.now()}.a0`);
    const result = await captureCmd(() => runFmt(missing, {}));
    assert.equal(result.code, 4);
    assert.ok(result.stderr.includes("error[E_IO]"));
  });

  it("a0 run --pretty returns exit code 4 with pretty E_IO on file read failure", async () => {
    const missing = path.join(os.tmpdir(), `a0-missing-run-${Date.now()}.a0`);
    const result = await captureCmd(() => runRun(missing, { pretty: true }));
    assert.equal(result.code, 4);
    assert.ok(result.stderr.includes("error[E_IO]"));
  });

  it("a0 run returns top-level JSON diagnostic for E_IO when --pretty is not set", async () => {
    const missing = path.join(os.tmpdir(), `a0-missing-run-json-${Date.now()}.a0`);
    const result = await captureCmd(() => runRun(missing, {}));
    assert.equal(result.code, 4);
    const diag = JSON.parse(result.stderr) as { code: string; err?: unknown };
    assert.equal(diag.code, "E_IO");
    assert.equal(diag.err, undefined);
  });

  it("a0 fmt --write returns exit code 4 with E_IO on file write failure", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-fmt-write-fail-"));
    const filePath = path.join(tmpDir, "format-me.a0");
    fs.writeFileSync(filePath, "return { ok: true }\n", "utf-8");

    const fsCjs = require("fs") as typeof import("node:fs");
    const originalWriteFileSync = fsCjs.writeFileSync;
    fsCjs.writeFileSync = (() => {
      throw new Error("simulated fmt write failure");
    }) as typeof fsCjs.writeFileSync;
    syncBuiltinESMExports();

    try {
      const result = await captureCmd(() => runFmt(filePath, { write: true }));
      assert.equal(result.code, 4);
      assert.ok(result.stderr.includes("error[E_IO]"));
    } finally {
      fsCjs.writeFileSync = originalWriteFileSync;
      syncBuiltinESMExports();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
