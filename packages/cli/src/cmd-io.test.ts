/**
 * Tests for CLI command I/O error behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { runCheck } from "./cmd-check.js";
import { runFmt } from "./cmd-fmt.js";
import { runRun } from "./cmd-run.js";

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
});
