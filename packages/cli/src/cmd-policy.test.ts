/**
 * Tests for a0 policy command behavior.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runPolicy } from "./cmd-policy.js";

async function capturePolicy(
  opts: { json?: boolean; cwd?: string; homeDir?: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(" "));

  try {
    const code = await runPolicy(opts);
    return { code, stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe("a0 policy", () => {
  it("prints human-readable project policy summary", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-project-"));
    fs.writeFileSync(
      path.join(projectDir, ".a0policy.json"),
      JSON.stringify({ version: 1, allow: ["fs.read"], deny: ["sh.exec"] })
    );

    try {
      const result = await capturePolicy({ cwd: projectDir, homeDir: projectDir });
      assert.equal(result.code, 0);
      assert.equal(result.stderr, "");
      assert.ok(result.stdout.includes("Effective A0 policy"));
      assert.ok(result.stdout.includes("Source:          project"));
      assert.ok(result.stdout.includes("Allow:           fs.read"));
      assert.ok(result.stdout.includes("Deny:            sh.exec"));
      assert.ok(result.stdout.includes("Effective allow: fs.read"));
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns JSON with user source when project policy is invalid", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-project-"));
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-home-"));
    const userPolicyDir = path.join(fakeHome, ".a0");
    const userPolicyPath = path.join(userPolicyDir, "policy.json");
    fs.mkdirSync(userPolicyDir, { recursive: true });

    fs.writeFileSync(path.join(projectDir, ".a0policy.json"), JSON.stringify({ version: 1, allow: "fs.read" }));
    fs.writeFileSync(userPolicyPath, JSON.stringify({ version: 1, allow: ["http.get"] }));

    try {
      const result = await capturePolicy({ json: true, cwd: projectDir, homeDir: fakeHome });
      assert.equal(result.code, 0);
      assert.equal(result.stderr, "");
      const parsed = JSON.parse(result.stdout) as {
        source: string;
        path: string | null;
        policy: { allow: string[] };
        effectiveAllow: string[];
      };
      assert.equal(parsed.source, "user");
      assert.equal(parsed.path, userPolicyPath);
      assert.deepEqual(parsed.policy.allow, ["http.get"]);
      assert.deepEqual(parsed.effectiveAllow, ["http.get"]);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("returns default deny-all JSON when no policy files exist", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-project-"));
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-home-"));

    try {
      const result = await capturePolicy({ json: true, cwd: projectDir, homeDir: fakeHome });
      assert.equal(result.code, 0);
      const parsed = JSON.parse(result.stdout) as {
        source: string;
        path: string | null;
        policy: { allow: string[]; deny: string[] };
        effectiveAllow: string[];
      };
      assert.equal(parsed.source, "default");
      assert.equal(parsed.path, null);
      assert.deepEqual(parsed.policy.allow, []);
      assert.deepEqual(parsed.policy.deny, []);
      assert.deepEqual(parsed.effectiveAllow, []);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("applies deny-overrides-allow in effectiveAllow JSON output", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cli-policy-project-"));
    fs.writeFileSync(
      path.join(projectDir, ".a0policy.json"),
      JSON.stringify({ version: 1, allow: ["fs.read", "sh.exec"], deny: ["sh.exec"] })
    );

    try {
      const result = await capturePolicy({ json: true, cwd: projectDir, homeDir: projectDir });
      assert.equal(result.code, 0);
      const parsed = JSON.parse(result.stdout) as {
        policy: { allow: string[]; deny: string[] };
        effectiveAllow: string[];
      };
      assert.deepEqual(parsed.policy.allow, ["fs.read", "sh.exec"]);
      assert.deepEqual(parsed.policy.deny, ["sh.exec"]);
      assert.deepEqual(parsed.effectiveAllow, ["fs.read"]);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

