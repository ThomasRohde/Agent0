/**
 * Tests for a0 check command behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCheck } from "./cmd-check.js";

async function captureCheck(
  file: string,
  opts: { pretty?: boolean; stableJson?: boolean; debugParse?: boolean }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(" "));

  try {
    const code = await runCheck(file, opts);
    return { code, stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe("a0 check", () => {
  it("prints [] on success by default", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-check-test-"));
    const filePath = path.join(tmpDir, "ok.a0");
    fs.writeFileSync(filePath, "return { ok: true }\n", "utf-8");

    try {
      const result = await captureCheck(filePath, {});
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "[]");
      assert.equal(result.stderr, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prints stable success JSON with --stable-json", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-check-test-"));
    const filePath = path.join(tmpDir, "ok.a0");
    fs.writeFileSync(filePath, "return { ok: true }\n", "utf-8");

    try {
      const result = await captureCheck(filePath, { stableJson: true });
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "{\"ok\":true,\"errors\":[]}");
      assert.equal(result.stderr, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("prints pretty success output with --pretty", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-check-test-"));
    const filePath = path.join(tmpDir, "ok.a0");
    fs.writeFileSync(filePath, "return { ok: true }\n", "utf-8");

    try {
      const result = await captureCheck(filePath, { pretty: true });
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "No errors found.");
      assert.equal(result.stderr, "");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("emits concise parse errors by default", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-check-test-"));
    const filePath = path.join(tmpDir, "bad.a0");
    fs.writeFileSync(filePath, "let x =\nreturn {}\n", "utf-8");

    try {
      const result = await captureCheck(filePath, {});
      assert.equal(result.code, 2);
      assert.ok(result.stderr.includes("Unexpected token 'return'."));
      assert.equal(result.stderr.includes("one of these possible Token sequences"), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("emits verbose parse internals with --debug-parse", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-check-test-"));
    const filePath = path.join(tmpDir, "bad.a0");
    fs.writeFileSync(filePath, "let x =\nreturn {}\n", "utf-8");

    try {
      const result = await captureCheck(filePath, { debugParse: true });
      assert.equal(result.code, 2);
      assert.ok(result.stderr.includes("Expecting: one of these possible Token sequences"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

