/**
 * Tests for the A0 lexer.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { A0Lexer } from "./lexer.js";

describe("A0 Lexer", () => {
  it("tokenizes keywords", () => {
    const result = A0Lexer.tokenize("cap budget import as let return do assert check true false null");
    assert.equal(result.errors.length, 0);
    const names = result.tokens.map((t) => t.tokenType.name);
    assert.deepEqual(names, [
      "Cap", "Budget", "Import", "As", "Let", "Return",
      "Do", "Assert", "Check", "True", "False", "Null",
    ]);
  });

  it("tokenizes call? as a single token", () => {
    const result = A0Lexer.tokenize("call?");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0].tokenType.name, "CallQ");
  });

  it("tokenizes identifiers", () => {
    const result = A0Lexer.tokenize("foo bar_baz _x myVar123");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 4);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "Ident");
    }
    assert.equal(result.tokens[0].image, "foo");
    assert.equal(result.tokens[1].image, "bar_baz");
  });

  it("distinguishes keywords from identifiers with longer names", () => {
    const result = A0Lexer.tokenize("capital letting returned doing assertion checker");
    assert.equal(result.errors.length, 0);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "Ident", `Expected '${t.image}' to be Ident`);
    }
  });

  it("tokenizes integer literals", () => {
    const result = A0Lexer.tokenize("0 1 42 100");
    assert.equal(result.errors.length, 0);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "IntLit");
    }
  });

  it("tokenizes negative integer literals", () => {
    const result = A0Lexer.tokenize("-1 -42");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens[0].tokenType.name, "IntLit");
    assert.equal(result.tokens[0].image, "-1");
  });

  it("tokenizes float literals", () => {
    const result = A0Lexer.tokenize("3.14 0.5 -2.7");
    assert.equal(result.errors.length, 0);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "FloatLit");
    }
  });

  it("tokenizes float with exponent", () => {
    const result = A0Lexer.tokenize("1.5e10 3.0E-2");
    assert.equal(result.errors.length, 0);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "FloatLit");
    }
  });

  it("tokenizes string literals", () => {
    const result = A0Lexer.tokenize('"hello" "world"');
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 2);
    for (const t of result.tokens) {
      assert.equal(t.tokenType.name, "StringLit");
    }
  });

  it("tokenizes strings with escape sequences", () => {
    const result = A0Lexer.tokenize('"hello\\nworld" "tab\\there" "quote\\"inside"');
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 3);
  });

  it("tokenizes punctuation", () => {
    const result = A0Lexer.tokenize("{ } [ ] : , . -> =");
    assert.equal(result.errors.length, 0);
    const names = result.tokens.map((t) => t.tokenType.name);
    assert.deepEqual(names, [
      "LBrace", "RBrace", "LBracket", "RBracket",
      "Colon", "Comma", "Dot", "Arrow", "Equals",
    ]);
  });

  it("skips whitespace and newlines", () => {
    const result = A0Lexer.tokenize("let  \t  x\n=\n42");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 4); // let x = 42
  });

  it("skips comments", () => {
    const result = A0Lexer.tokenize("# this is a comment\nlet x = 1");
    assert.equal(result.errors.length, 0);
    const names = result.tokens.map((t) => t.tokenType.name);
    assert.deepEqual(names, ["Let", "Ident", "Equals", "IntLit"]);
  });

  it("skips inline comments", () => {
    const result = A0Lexer.tokenize("let x = 1 # inline comment");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 4);
  });

  it("reports errors on invalid characters", () => {
    const result = A0Lexer.tokenize("let x = @");
    assert.ok(result.errors.length > 0);
  });

  it("tokenizes a complete program", () => {
    const src = `cap { fs.read: true }
let x = call? fs.read { path: "test.txt" }
return { x: x }`;
    const result = A0Lexer.tokenize(src);
    assert.equal(result.errors.length, 0);
    assert.ok(result.tokens.length > 0);
  });

  it("tokenizes empty string as no tokens", () => {
    const result = A0Lexer.tokenize("");
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 0);
  });

  it("tokenizes string with unicode escape", () => {
    const result = A0Lexer.tokenize('"\\u0041"');
    assert.equal(result.errors.length, 0);
    assert.equal(result.tokens.length, 1);
    assert.equal(result.tokens[0].tokenType.name, "StringLit");
  });
});
