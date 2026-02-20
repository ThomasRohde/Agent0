/**
 * Tests for A0 built-in tools: fs and sh.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fsReadTool, fsWriteTool, fsListTool, fsExistsTool } from "./fs-tools.js";
import { shExecTool } from "./sh-tools.js";
import { httpGetTool } from "./http-tools.js";
import { registerBuiltinTools, getAllTools } from "./index.js";
import type { A0Record } from "@a0/core";

describe("fs.read", () => {
  it("reads a file as utf8", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello world", "utf-8");
    try {
      const result = await fsReadTool.execute({ path: filePath });
      assert.equal(result, "hello world");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("reads a file as base64 when encoding is not utf8", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "test.bin");
    fs.writeFileSync(filePath, "binary content", "utf-8");
    try {
      const result = await fsReadTool.execute({ path: filePath, encoding: "bytes" });
      assert.equal(typeof result, "string");
      // Decode base64 to check content
      assert.equal(Buffer.from(result as string, "base64").toString("utf-8"), "binary content");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws on missing path argument", async () => {
    await assert.rejects(
      () => fsReadTool.execute({}),
      (err: Error) => {
        assert.ok(err.message.includes("path"));
        return true;
      }
    );
  });

  it("throws on non-existent file", async () => {
    await assert.rejects(
      () => fsReadTool.execute({ path: "/nonexistent/file/abc123.txt" })
    );
  });

  it("has correct tool metadata", () => {
    assert.equal(fsReadTool.name, "fs.read");
    assert.equal(fsReadTool.mode, "read");
    assert.equal(fsReadTool.capabilityId, "fs.read");
  });
});

describe("fs.write", () => {
  it("writes string data to file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "out.txt");
    try {
      const result = await fsWriteTool.execute({ path: filePath, data: "hello" }) as A0Record;
      assert.equal(result["kind"], "file");
      assert.equal(typeof result["bytes"], "number");
      assert.equal(typeof result["sha256"], "string");
      const content = fs.readFileSync(filePath, "utf-8");
      assert.equal(content, "hello");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("writes JSON formatted data", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "out.json");
    try {
      const result = await fsWriteTool.execute({
        path: filePath, data: { key: "value" }, format: "json",
      }) as A0Record;
      assert.equal(result["kind"], "file");
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      assert.equal(parsed.key, "value");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("serializes non-string data as JSON by default", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "out.txt");
    try {
      await fsWriteTool.execute({ path: filePath, data: { x: 1 } });
      const content = fs.readFileSync(filePath, "utf-8");
      assert.equal(content, '{"x":1}');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("creates intermediate directories", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "nested", "dir", "out.txt");
    try {
      await fsWriteTool.execute({ path: filePath, data: "hello" });
      const content = fs.readFileSync(filePath, "utf-8");
      assert.equal(content, "hello");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws on missing path argument", async () => {
    await assert.rejects(
      () => fsWriteTool.execute({ data: "hello" }),
      (err: Error) => {
        assert.ok(err.message.includes("path"));
        return true;
      }
    );
  });

  it("has correct tool metadata", () => {
    assert.equal(fsWriteTool.name, "fs.write");
    assert.equal(fsWriteTool.mode, "effect");
    assert.equal(fsWriteTool.capabilityId, "fs.write");
  });
});

describe("fs.list", () => {
  it("lists files and directories", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "hello", "utf-8");
    fs.mkdirSync(path.join(tmpDir, "subdir"));
    try {
      const result = await fsListTool.execute({ path: tmpDir }) as A0Record[];
      assert.ok(Array.isArray(result));
      const names = result.map((e) => (e as A0Record)["name"]);
      assert.ok(names.includes("file.txt"));
      assert.ok(names.includes("subdir"));
      const file = result.find((e) => (e as A0Record)["name"] === "file.txt") as A0Record;
      assert.equal(file["type"], "file");
      const dir = result.find((e) => (e as A0Record)["name"] === "subdir") as A0Record;
      assert.equal(dir["type"], "directory");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("lists empty directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    try {
      const result = await fsListTool.execute({ path: tmpDir }) as A0Record[];
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws on nonexistent directory", async () => {
    await assert.rejects(
      () => fsListTool.execute({ path: "/nonexistent/dir/abc123" })
    );
  });

  it("has correct tool metadata", () => {
    assert.equal(fsListTool.name, "fs.list");
    assert.equal(fsListTool.mode, "read");
    assert.equal(fsListTool.capabilityId, "fs.read");
  });
});

describe("fs.exists", () => {
  it("returns true for existing file", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    try {
      const result = await fsExistsTool.execute({ path: filePath });
      assert.equal(result, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns true for existing directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-test-"));
    try {
      const result = await fsExistsTool.execute({ path: tmpDir });
      assert.equal(result, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns false for nonexistent path", async () => {
    const result = await fsExistsTool.execute({ path: "/nonexistent/file/abc123.txt" });
    assert.equal(result, false);
  });

  it("has correct tool metadata", () => {
    assert.equal(fsExistsTool.name, "fs.exists");
    assert.equal(fsExistsTool.mode, "read");
    assert.equal(fsExistsTool.capabilityId, "fs.read");
  });
});

describe("sh.exec", () => {
  it("executes a simple command", async () => {
    const result = await shExecTool.execute({ cmd: "echo hello" }) as A0Record;
    assert.equal(result["exitCode"], 0);
    assert.ok((result["stdout"] as string).includes("hello"));
    assert.equal(typeof result["durationMs"], "number");
  });

  it("captures stderr and non-zero exit code", async () => {
    // Use a command that will fail
    const result = await shExecTool.execute({ cmd: "node -e \"process.exit(42)\"" }) as A0Record;
    assert.equal(result["exitCode"], 42);
  });

  it("throws on missing cmd argument", async () => {
    await assert.rejects(
      () => shExecTool.execute({}),
      (err: Error) => {
        assert.ok(err.message.includes("cmd"));
        return true;
      }
    );
  });

  it("has correct tool metadata", () => {
    assert.equal(shExecTool.name, "sh.exec");
    assert.equal(shExecTool.mode, "effect");
    assert.equal(shExecTool.capabilityId, "sh.exec");
  });
});

describe("http.get", () => {
  it("has correct tool metadata", () => {
    assert.equal(httpGetTool.name, "http.get");
    assert.equal(httpGetTool.mode, "read");
    assert.equal(httpGetTool.capabilityId, "http.get");
  });

  it("throws on missing url argument", async () => {
    await assert.rejects(
      () => httpGetTool.execute({}),
      (err: Error) => {
        assert.ok(err.message.includes("url"));
        return true;
      }
    );
  });
});

describe("tool inputSchema", () => {
  it("fs.read has inputSchema", () => {
    assert.ok(fsReadTool.inputSchema, "fsReadTool should have an inputSchema");
  });

  it("fs.write has inputSchema", () => {
    assert.ok(fsWriteTool.inputSchema, "fsWriteTool should have an inputSchema");
  });

  it("http.get has inputSchema", () => {
    assert.ok(httpGetTool.inputSchema, "httpGetTool should have an inputSchema");
  });

  it("sh.exec has inputSchema", () => {
    assert.ok(shExecTool.inputSchema, "shExecTool should have an inputSchema");
  });
});

describe("registerBuiltinTools", () => {
  it("registers all built-in tools", () => {
    registerBuiltinTools();
    const all = getAllTools();
    assert.ok(all.has("fs.read"));
    assert.ok(all.has("fs.write"));
    assert.ok(all.has("fs.list"));
    assert.ok(all.has("fs.exists"));
    assert.ok(all.has("http.get"));
    assert.ok(all.has("sh.exec"));
  });
});
