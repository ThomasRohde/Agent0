/**
 * Tests for A0 diagnostics.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { makeDiag, formatDiagnostic, formatDiagnostics } from "./diagnostics.js";

describe("A0 Diagnostics", () => {
  it("creates a diagnostic with all fields", () => {
    const d = makeDiag(
      "E_TEST",
      "Something went wrong",
      { file: "test.a0", startLine: 1, startCol: 5, endLine: 1, endCol: 10 },
      "Try fixing it"
    );
    assert.equal(d.code, "E_TEST");
    assert.equal(d.message, "Something went wrong");
    assert.equal(d.span?.file, "test.a0");
    assert.equal(d.span?.startLine, 1);
    assert.equal(d.hint, "Try fixing it");
  });

  it("creates a diagnostic without span or hint", () => {
    const d = makeDiag("E_TEST", "Error message");
    assert.equal(d.code, "E_TEST");
    assert.equal(d.message, "Error message");
    assert.equal(d.span, undefined);
    assert.equal(d.hint, undefined);
  });

  it("formats diagnostic as JSON", () => {
    const d = makeDiag("E_PARSE", "Unexpected token");
    const out = formatDiagnostic(d, false);
    const parsed = JSON.parse(out);
    assert.equal(parsed.code, "E_PARSE");
    assert.equal(parsed.message, "Unexpected token");
  });

  it("formats diagnostic in pretty mode with span", () => {
    const d = makeDiag(
      "E_PARSE",
      "Unexpected token",
      { file: "test.a0", startLine: 3, startCol: 7, endLine: 3, endCol: 12 },
      "Check syntax"
    );
    const out = formatDiagnostic(d, true);
    assert.ok(out.includes("error[E_PARSE]"));
    assert.ok(out.includes("Unexpected token"));
    assert.ok(out.includes("test.a0:3:7"));
    assert.ok(out.includes("hint: Check syntax"));
  });

  it("formats diagnostic in pretty mode without span", () => {
    const d = makeDiag("E_PARSE", "Unexpected token");
    const out = formatDiagnostic(d, true);
    assert.ok(out.includes("<unknown>"));
  });

  it("formats diagnostic in pretty mode without hint", () => {
    const d = makeDiag(
      "E_PARSE",
      "Unexpected token",
      { file: "test.a0", startLine: 1, startCol: 1, endLine: 1, endCol: 5 }
    );
    const out = formatDiagnostic(d, true);
    assert.ok(!out.includes("hint:"));
  });

  it("formats multiple diagnostics as JSON", () => {
    const diags = [
      makeDiag("E_1", "First error"),
      makeDiag("E_2", "Second error"),
    ];
    const out = formatDiagnostics(diags, false);
    const parsed = JSON.parse(out);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].code, "E_1");
    assert.equal(parsed[1].code, "E_2");
  });

  it("formats multiple diagnostics in pretty mode", () => {
    const diags = [
      makeDiag("E_1", "First error"),
      makeDiag("E_2", "Second error"),
    ];
    const out = formatDiagnostics(diags, true);
    assert.ok(out.includes("error[E_1]"));
    assert.ok(out.includes("error[E_2]"));
    assert.ok(out.includes("\n\n")); // separated by blank line
  });
});
