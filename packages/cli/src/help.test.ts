/**
 * Tests for A0 CLI help content.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createRequire } from "node:module";
import { QUICKREF, TOPICS, TOPIC_LIST } from "./help-content.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

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
});
