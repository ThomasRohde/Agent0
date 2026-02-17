/**
 * Tests for A0 capability policy loader.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadPolicy, buildAllowedCaps } from "./capabilities.js";

describe("A0 Capabilities", () => {
  describe("loadPolicy", () => {
    it("returns deny-all policy when no policy files exist", () => {
      // Use a temp dir with no policy file
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      try {
        const policy = loadPolicy(tmpDir);
        assert.equal(policy.version, 1);
        assert.deepEqual(policy.allow, []);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("loads project-local policy", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, JSON.stringify({
        version: 1,
        allow: ["fs.read", "http.get"],
      }));
      try {
        const policy = loadPolicy(tmpDir);
        assert.equal(policy.version, 1);
        assert.deepEqual(policy.allow, ["fs.read", "http.get"]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("policy includes limits when present", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, JSON.stringify({
        version: 1,
        allow: ["fs.read"],
        limits: { maxToolCalls: 10 },
      }));
      try {
        const policy = loadPolicy(tmpDir);
        assert.deepEqual(policy.limits, { maxToolCalls: 10 });
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("handles malformed policy JSON gracefully", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, "not valid json{{{");
      try {
        const policy = loadPolicy(tmpDir);
        // Falls through to deny-all default
        assert.deepEqual(policy.allow, []);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("handles non-object policy gracefully", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, '"just a string"');
      try {
        const policy = loadPolicy(tmpDir);
        assert.deepEqual(policy.allow, []);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("filters non-string items from allow array", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, JSON.stringify({
        version: 1,
        allow: ["fs.read", 42, null, "http.get"],
      }));
      try {
        const policy = loadPolicy(tmpDir);
        assert.deepEqual(policy.allow, ["fs.read", "http.get"]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("buildAllowedCaps", () => {
    it("returns caps from policy", () => {
      const policy = { version: 1, allow: ["fs.read", "http.get"] };
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 2);
      assert.ok(caps.has("fs.read"));
      assert.ok(caps.has("http.get"));
      assert.ok(!caps.has("fs.write"));
    });

    it("returns all caps when unsafeAllowAll is true", () => {
      const policy = { version: 1, allow: [] };
      const caps = buildAllowedCaps(policy, true);
      assert.ok(caps.has("fs.read"));
      assert.ok(caps.has("fs.write"));
      assert.ok(caps.has("http.read"));
      assert.ok(caps.has("http.get"));
      assert.ok(caps.has("sh.exec"));
      assert.equal(caps.size, 5);
    });

    it("returns empty set for deny-all policy", () => {
      const policy = { version: 1, allow: [] };
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 0);
    });
  });
});
