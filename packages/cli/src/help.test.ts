/**
 * Tests for A0 CLI help content.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createRequire } from "node:module";
import { QUICKREF, TOPICS, TOPIC_LIST } from "./help-content.js";
import { runHelp } from "./cmd-help.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function captureHelp(topic?: string): { stdout: string; stderr: string; exitCode: number | undefined } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  const prevExitCode = process.exitCode;

  process.exitCode = undefined;
  console.log = (...args: unknown[]) => {
    stdout.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(" "));
  };

  try {
    runHelp(topic);
    return {
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      exitCode: process.exitCode,
    };
  } finally {
    console.log = origLog;
    console.error = origError;
    process.exitCode = prevExitCode;
  }
}

describe("A0 CLI Help Content", () => {
  it("QUICKREF is non-empty", () => {
    assert.ok(QUICKREF.length > 0);
  });

  it("QUICKREF contains version matching package.json", () => {
    const expectedVersion = `v${pkg.version.replace(/\.\d+$/, "")}`;
    assert.ok(
      QUICKREF.includes(expectedVersion),
      `Expected QUICKREF to contain '${expectedVersion}', got: ${QUICKREF.slice(0, 100)}`
    );
  });

  it("all TOPIC_LIST entries exist in TOPICS", () => {
    for (const topic of TOPIC_LIST) {
      assert.ok(topic in TOPICS, `Topic '${topic}' listed but not in TOPICS`);
    }
  });

  it("TOPICS has expected keys", () => {
    const expectedKeys = ["syntax", "types", "tools", "stdlib", "caps", "budget", "flow", "diagnostics", "examples"];
    for (const key of expectedKeys) {
      assert.ok(key in TOPICS, `Expected topic '${key}' not found in TOPICS`);
    }
  });

  it("each topic value is a non-empty string", () => {
    for (const [key, value] of Object.entries(TOPICS)) {
      assert.equal(typeof value, "string", `Topic '${key}' is not a string`);
      assert.ok(value.length > 0, `Topic '${key}' is empty`);
    }
  });

  it("TOPIC_LIST length matches TOPICS key count", () => {
    assert.equal(TOPIC_LIST.length, Object.keys(TOPICS).length);
  });

  it("caps topic documents literal true requirement", () => {
    assert.ok(TOPICS.caps.includes("must be literal true"));
    assert.ok(TOPICS.caps.includes("E_CAP_VALUE"));
  });

  it("budget topic documents integer literal requirement", () => {
    assert.ok(TOPICS.budget.includes("integer literals"));
    assert.ok(TOPICS.budget.includes("E_BUDGET_TYPE"));
  });

  it("runHelp supports unique prefix matching", () => {
    const result = captureHelp("diag");
    assert.ok(result.stdout.includes("A0 DIAGNOSTICS REFERENCE"));
    assert.equal(result.stderr, "");
    assert.equal(result.exitCode, undefined);
  });

  it("runHelp sets exit code 1 for unknown topic", () => {
    const result = captureHelp("no-such-topic");
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("Unknown help topic"));
    assert.ok(result.stderr.includes("Available topics:"));
    assert.ok(result.stderr.includes("Usage: a0 help <topic>"));
  });
});
