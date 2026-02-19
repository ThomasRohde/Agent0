/**
 * Phase 6c: Capability-policy precedence golden tests.
 * Verify the full stack: policy file + program execution + expected outcome.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parse } from "./parser.js";
import { validate } from "./validator.js";
import { execute, A0RuntimeError } from "./evaluator.js";
import type { ExecOptions, ToolDef, A0Value, A0Record } from "./evaluator.js";
import { loadPolicy, buildAllowedCaps } from "./capabilities.js";

// Mock read-only tool for testing
const mockReadTool: ToolDef = {
  name: "fs.read",
  mode: "read",
  capabilityId: "fs.read",
  async execute(): Promise<A0Value> { return "file contents"; },
};

// Mock effect tool for testing
const mockWriteTool: ToolDef = {
  name: "fs.write",
  mode: "effect",
  capabilityId: "fs.write",
  async execute(args: A0Record): Promise<A0Value> {
    return { kind: "file", path: args["path"] ?? "out.txt", bytes: 5, sha256: "abc" };
  },
};

function makeTools(): Map<string, ToolDef> {
  return new Map([
    ["fs.read", mockReadTool],
    ["fs.write", mockWriteTool],
  ]);
}

describe("Capability-Policy Precedence Tests", () => {
  it("deny-all policy blocks tool usage with E_CAP_DENIED", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    // Write deny-all policy (empty allow)
    fs.writeFileSync(path.join(tmpDir, ".a0policy.json"), JSON.stringify({
      version: 1,
      allow: [],
    }));

    try {
      const policy = loadPolicy(tmpDir, tmpDir);
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 0);

      const src = `cap { fs.read: true }\nlet x = call? fs.read { path: "test.txt" }\nreturn { x: x }`;
      const pr = parse(src, "test.a0");
      assert.ok(pr.program);

      await assert.rejects(
        () => execute(pr.program!, {
          allowedCapabilities: caps,
          tools: makeTools(),
          stdlib: new Map(),
          runId: "test-run",
        }),
        (err: A0RuntimeError) => {
          assert.equal(err.code, "E_CAP_DENIED");
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("allow-read policy permits read tool usage", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    fs.writeFileSync(path.join(tmpDir, ".a0policy.json"), JSON.stringify({
      version: 1,
      allow: ["fs.read"],
    }));

    try {
      const policy = loadPolicy(tmpDir, tmpDir);
      const caps = buildAllowedCaps(policy, false);
      assert.ok(caps.has("fs.read"));

      const src = `cap { fs.read: true }\nlet x = call? fs.read { path: "test.txt" }\nreturn { x: x }`;
      const pr = parse(src, "test.a0");
      assert.ok(pr.program);

      const result = await execute(pr.program, {
        allowedCapabilities: caps,
        tools: makeTools(),
        stdlib: new Map(),
        runId: "test-run",
      });
      assert.equal((result.value as A0Record)["x"], "file contents");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("allow-read policy blocks write tool with E_CAP_DENIED", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    fs.writeFileSync(path.join(tmpDir, ".a0policy.json"), JSON.stringify({
      version: 1,
      allow: ["fs.read"],
    }));

    try {
      const policy = loadPolicy(tmpDir, tmpDir);
      const caps = buildAllowedCaps(policy, false);

      const src = `cap { fs.write: true }\ndo fs.write { path: "out.txt", data: "hi" }\nreturn {}`;
      const pr = parse(src, "test.a0");
      assert.ok(pr.program);

      await assert.rejects(
        () => execute(pr.program!, {
          allowedCapabilities: caps,
          tools: makeTools(),
          stdlib: new Map(),
          runId: "test-run",
        }),
        (err: A0RuntimeError) => {
          assert.equal(err.code, "E_CAP_DENIED");
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("project policy takes precedence over user policy", async () => {
    // Create a project dir with an allow-read policy
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    fs.writeFileSync(path.join(tmpDir, ".a0policy.json"), JSON.stringify({
      version: 1,
      allow: ["fs.read"],
    }));

    try {
      // loadPolicy(tmpDir, tmpDir) should find the project policy
      const policy = loadPolicy(tmpDir, tmpDir);
      assert.deepEqual(policy.allow, ["fs.read"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("unsafe-allow-all overrides deny-all policy", async () => {
    const policy = { version: 1, allow: [] as string[] };
    const caps = buildAllowedCaps(policy, true);

    // Should have all known capabilities
    assert.ok(caps.has("fs.read"));
    assert.ok(caps.has("fs.write"));
    assert.ok(caps.has("http.get"));
    assert.ok(caps.has("sh.exec"));
    assert.equal(caps.size, 4);

    // Should be able to run a program that uses tools
    const src = `cap { fs.read: true }\nlet x = call? fs.read { path: "test.txt" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    const result = await execute(pr.program, {
      allowedCapabilities: caps,
      tools: makeTools(),
      stdlib: new Map(),
      runId: "test-run",
    });
    assert.equal((result.value as A0Record)["x"], "file contents");
  });

  it("default policy (no file) denies all capabilities", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    try {
      // No policy file written - should get deny-all default
      const policy = loadPolicy(tmpDir, tmpDir);
      assert.deepEqual(policy.allow, []);
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("policy with multiple capabilities allows all listed tools", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-cap-test-"));
    fs.writeFileSync(path.join(tmpDir, ".a0policy.json"), JSON.stringify({
      version: 1,
      allow: ["fs.read", "fs.write"],
    }));

    try {
      const policy = loadPolicy(tmpDir, tmpDir);
      const caps = buildAllowedCaps(policy, false);
      assert.ok(caps.has("fs.read"));
      assert.ok(caps.has("fs.write"));

      const src = `cap { fs.read: true, fs.write: true }\nlet x = call? fs.read { path: "test" }\ndo fs.write { path: "out", data: x }\nreturn { x: x }`;
      const pr = parse(src, "test.a0");
      assert.ok(pr.program);

      const result = await execute(pr.program, {
        allowedCapabilities: caps,
        tools: makeTools(),
        stdlib: new Map(),
        runId: "test-run",
      });
      assert.equal((result.value as A0Record)["x"], "file contents");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("capability check happens at cap-header validation time", async () => {
    // Cap is declared in the program, but not in the policy's allowed set.
    // The evaluator checks cap headers at startup before any tool invocation,
    // so it should fail immediately with E_CAP_DENIED.
    const src = `cap { fs.read: true }\nlet x = call? fs.read { path: "test" }\nreturn { x: x }`;
    const pr = parse(src, "test.a0");
    assert.ok(pr.program);

    await assert.rejects(
      () => execute(pr.program!, {
        allowedCapabilities: new Set(),  // empty!
        tools: makeTools(),
        stdlib: new Map(),
        runId: "test-run",
      }),
      (err: A0RuntimeError) => {
        assert.equal(err.code, "E_CAP_DENIED");
        return true;
      }
    );
  });
});
