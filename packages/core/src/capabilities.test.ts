/**
 * Tests for A0 capability policy loader.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadPolicy, resolvePolicy, buildAllowedCaps } from "./capabilities.js";

describe("A0 Capabilities", () => {
  describe("loadPolicy", () => {
    it("returns deny-all policy when no policy files exist", () => {
      // Use a temp dir with no policy file
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      try {
        const policy = loadPolicy(tmpDir, tmpDir);
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
        const policy = loadPolicy(tmpDir, tmpDir);
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
        const policy = loadPolicy(tmpDir, tmpDir);
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
        const policy = loadPolicy(tmpDir, tmpDir);
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
        const policy = loadPolicy(tmpDir, tmpDir);
        assert.deepEqual(policy.allow, []);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("falls through to user policy when project policy has invalid shape", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-project-"));
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-home-"));
      const projectPolicyPath = path.join(tmpDir, ".a0policy.json");
      const userPolicyDir = path.join(fakeHome, ".a0");
      const userPolicyPath = path.join(userPolicyDir, "policy.json");

      fs.writeFileSync(projectPolicyPath, JSON.stringify({ version: 1, allow: "fs.read" }));
      fs.mkdirSync(userPolicyDir, { recursive: true });
      fs.writeFileSync(userPolicyPath, JSON.stringify({ version: 1, allow: ["http.get"] }));

      try {
        const policy = loadPolicy(tmpDir, fakeHome);
        assert.deepEqual(policy.allow, ["http.get"]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    it("loads deny list from policy file", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, JSON.stringify({
        version: 1,
        allow: ["fs.read", "sh.exec"],
        deny: ["sh.exec"],
      }));
      try {
        const policy = loadPolicy(tmpDir, tmpDir);
        assert.deepEqual(policy.deny, ["sh.exec"]);
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
        const policy = loadPolicy(tmpDir, tmpDir);
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
      assert.ok(caps.has("http.get"));
      assert.ok(caps.has("sh.exec"));
      assert.equal(caps.size, 4);
    });

    it("returns empty set for deny-all policy", () => {
      const policy = { version: 1, allow: [] };
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 0);
    });

    it("deny list filters out allowed caps", () => {
      const policy = { version: 1, allow: ["fs.read", "sh.exec"], deny: ["sh.exec"] };
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 1);
      assert.ok(caps.has("fs.read"));
      assert.ok(!caps.has("sh.exec"));
    });

    it("deny overrides allow", () => {
      const policy = { version: 1, allow: ["fs.read", "fs.write", "http.get"], deny: ["fs.read", "http.get"] };
      const caps = buildAllowedCaps(policy, false);
      assert.equal(caps.size, 1);
      assert.ok(caps.has("fs.write"));
    });

    it("deny is ignored with unsafeAllowAll", () => {
      const policy = { version: 1, allow: ["fs.read"], deny: ["fs.read"] };
      const caps = buildAllowedCaps(policy, true);
      assert.ok(caps.has("fs.read"));
      assert.equal(caps.size, 4);
    });
  });

  describe("resolvePolicy", () => {
    it("returns project source metadata when project policy is valid", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-project-"));
      const policyPath = path.join(tmpDir, ".a0policy.json");
      fs.writeFileSync(policyPath, JSON.stringify({ version: 1, allow: ["fs.read"] }));

      try {
        const resolved = resolvePolicy(tmpDir, tmpDir);
        assert.equal(resolved.source, "project");
        assert.equal(resolved.path, policyPath);
        assert.deepEqual(resolved.policy.allow, ["fs.read"]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns user source metadata when no project policy exists", () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-project-"));
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-home-"));
      const userPolicyDir = path.join(fakeHome, ".a0");
      const userPolicyPath = path.join(userPolicyDir, "policy.json");
      fs.mkdirSync(userPolicyDir, { recursive: true });
      fs.writeFileSync(userPolicyPath, JSON.stringify({ version: 1, allow: ["http.get"] }));

      try {
        const resolved = resolvePolicy(projectDir, fakeHome);
        assert.equal(resolved.source, "user");
        assert.equal(resolved.path, userPolicyPath);
        assert.deepEqual(resolved.policy.allow, ["http.get"]);
      } finally {
        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    it("returns default source metadata when no valid policy exists", () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-project-"));
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-home-"));

      try {
        const resolved = resolvePolicy(projectDir, fakeHome);
        assert.equal(resolved.source, "default");
        assert.equal(resolved.path, null);
        assert.deepEqual(resolved.policy.allow, []);
      } finally {
        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    it("falls through malformed project policy to user policy with user metadata", () => {
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-project-"));
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-home-"));
      const projectPolicyPath = path.join(projectDir, ".a0policy.json");
      const userPolicyDir = path.join(fakeHome, ".a0");
      const userPolicyPath = path.join(userPolicyDir, "policy.json");
      fs.mkdirSync(userPolicyDir, { recursive: true });

      fs.writeFileSync(projectPolicyPath, JSON.stringify({ version: 1, allow: "fs.read" }));
      fs.writeFileSync(userPolicyPath, JSON.stringify({ version: 1, allow: ["sh.exec"] }));

      try {
        const resolved = resolvePolicy(projectDir, fakeHome);
        assert.equal(resolved.source, "user");
        assert.equal(resolved.path, userPolicyPath);
        assert.deepEqual(resolved.policy.allow, ["sh.exec"]);
      } finally {
        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    });
  });
});
