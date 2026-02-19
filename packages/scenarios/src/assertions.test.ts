import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { assertJsonSubset, assertMatchesRegex } from "./assertions.js";

describe("assertJsonSubset", () => {
  it("matches nested object subsets", () => {
    const actual = {
      code: "E_TYPE",
      span: { file: "program.a0", startLine: 1, startCol: 9, endCol: 16 },
      details: { runtime: true },
    };
    const subset = {
      code: "E_TYPE",
      span: { file: "program.a0", startCol: 9 },
    };
    assert.doesNotThrow(() => assertJsonSubset(actual, subset, "subset-check"));
  });

  it("matches array prefixes", () => {
    const actual = { nums: [1, 2, 3, 4] };
    const subset = { nums: [1, 2] };
    assert.doesNotThrow(() => assertJsonSubset(actual, subset, "array-subset"));
  });

  it("fails on missing keys", () => {
    assert.throws(
      () =>
        assertJsonSubset(
          { code: "E_TYPE" },
          { code: "E_TYPE", span: { file: "x.a0" } },
          "missing-key"
        ),
      /key missing/
    );
  });
});

describe("assertMatchesRegex", () => {
  it("matches valid regex patterns", () => {
    assert.doesNotThrow(() =>
      assertMatchesRegex("error[E_IO]: failed", "error\\[E_IO\\]", "regex-pass")
    );
  });

  it("fails when text does not match regex", () => {
    assert.throws(
      () => assertMatchesRegex("hello", "^world$", "regex-fail"),
      /did not match regex/
    );
  });

  it("fails on invalid regex patterns", () => {
    assert.throws(
      () => assertMatchesRegex("hello", "[unterminated", "regex-invalid"),
      /invalid regex/
    );
  });
});
