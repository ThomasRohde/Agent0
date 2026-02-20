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

function captureHelp(
  topic?: string,
  opts: { index?: boolean } = {}
): { stdout: string; stderr: string; exitCode: number | undefined } {
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
    runHelp(topic, opts);
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

  it("QUICKREF lists help topics as indented commands", () => {
    assert.ok(QUICKREF.includes("HELP TOPICS"));
    assert.ok(QUICKREF.includes("  a0 help syntax"));
    assert.ok(QUICKREF.includes("  a0 help stdlib --index"));
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

  it("budget topic documents duplicate budget header restriction", () => {
    assert.ok(TOPICS.budget.includes("E_DUP_BUDGET"));
  });

  it("diagnostics topic documents unsupported import headers", () => {
    assert.ok(TOPICS.diagnostics.includes("E_IMPORT_UNSUPPORTED"));
  });

  it("diagnostics topic documents E_IO for CLI file errors", () => {
    assert.ok(TOPICS.diagnostics.includes("E_IO"));
  });

  it("diagnostics topic documents E_TRACE for invalid trace input", () => {
    assert.ok(TOPICS.diagnostics.includes("E_TRACE"));
  });

  it("diagnostics topic documents E_RUNTIME for unexpected runtime failures", () => {
    assert.ok(TOPICS.diagnostics.includes("E_RUNTIME"));
  });

  it("tools topic documents unknown-tool validation behavior", () => {
    assert.ok(TOPICS.tools.includes("Unknown tool name"));
    assert.ok(TOPICS.tools.includes("usually exit 2"));
  });

  it("syntax topic documents nested-scope shadowing", () => {
    assert.ok(TOPICS.syntax.includes("Shadowing is allowed in nested scopes"));
  });

  it("help documents optional assert/check msg field", () => {
    assert.ok(TOPICS.syntax.includes("msg?:"));
    assert.ok(QUICKREF.includes("msg?:"));
  });

  it("syntax topic documents top-level statement/function interleaving", () => {
    assert.ok(TOPICS.syntax.includes("cap/budget headers must come first; fn and other statements may be interleaved"));
  });

  it("runHelp supports unique prefix matching", () => {
    const result = captureHelp("diag");
    assert.ok(result.stdout.includes("A0 DIAGNOSTICS REFERENCE"));
    assert.equal(result.stderr, "");
    assert.equal(result.exitCode, undefined);
  });

  it("runHelp prints stdlib index with --index", () => {
    const result = captureHelp("stdlib", { index: true });
    assert.ok(result.stdout.includes("A0 STDLIB INDEX"));
    assert.ok(result.stdout.includes("parse.json"));
    assert.ok(result.stdout.includes("Total:"));
    assert.equal(result.stderr, "");
    assert.equal(result.exitCode, undefined);
  });

  it("runHelp rejects --index for non-stdlib topics", () => {
    const result = captureHelp("tools", { index: true });
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("only supported with the stdlib topic"));
    assert.ok(result.stderr.includes("Usage:"));
    assert.ok(result.stderr.includes("  a0 help stdlib --index"));
  });

  it("runHelp rejects --index when no topic is provided", () => {
    const result = captureHelp(undefined, { index: true });
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("only supported with the stdlib topic"));
    assert.ok(result.stderr.includes("Usage:"));
    assert.ok(result.stderr.includes("  a0 help stdlib --index"));
  });

  it("runHelp sets exit code 1 for unknown topic", () => {
    const result = captureHelp("no-such-topic");
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("Unknown help topic"));
    assert.ok(result.stderr.includes("Available topics:"));
    assert.ok(result.stderr.includes("  - syntax"));
    assert.ok(result.stderr.includes("Usage:"));
    assert.ok(result.stderr.includes("  a0 help <topic>"));
  });

  it("stdlib topic documents new stdlib functions", () => {
    assert.ok(TOPICS.stdlib.includes("coalesce"));
    assert.ok(TOPICS.stdlib.includes("typeof"));
    assert.ok(TOPICS.stdlib.includes("pluck"));
    assert.ok(TOPICS.stdlib.includes("flat"));
    assert.ok(TOPICS.stdlib.includes("entries"));
    assert.ok(TOPICS.stdlib.includes("str.template"));
  });

  it("stdlib topic documents filter fn: overload", () => {
    assert.ok(TOPICS.stdlib.includes('filter { in: list, fn: "fnName" }'));
  });

  it("flow topic documents filter fn: overload", () => {
    assert.ok(TOPICS.flow.includes("filter"));
    assert.ok(TOPICS.flow.includes("Predicate-based list filtering"));
  });

  it("runHelp stdlib --index lists all 34 functions", () => {
    const result = captureHelp("stdlib", { index: true });
    assert.ok(result.stdout.includes("coalesce"));
    assert.ok(result.stdout.includes("typeof"));
    assert.ok(result.stdout.includes("pluck"));
    assert.ok(result.stdout.includes("flat"));
    assert.ok(result.stdout.includes("entries"));
    assert.ok(result.stdout.includes("str.template"));
    assert.ok(result.stdout.includes("Total: 34"));
  });

  it("runHelp rejects prototype property names as topics", () => {
    const constructorResult = captureHelp("constructor");
    assert.equal(constructorResult.exitCode, 1);
    assert.ok(constructorResult.stderr.includes("Unknown help topic"));

    const protoResult = captureHelp("__proto__");
    assert.equal(protoResult.exitCode, 1);
    assert.ok(protoResult.stderr.includes("Unknown help topic"));
  });
});
