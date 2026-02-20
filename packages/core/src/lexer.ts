/**
 * A0 Language Lexer using Chevrotain.
 */
import { createToken, Lexer } from "chevrotain";

// Keywords
export const Cap = createToken({ name: "Cap", pattern: /cap/, longer_alt: undefined });
export const Budget = createToken({ name: "Budget", pattern: /budget/, longer_alt: undefined });
export const Import = createToken({ name: "Import", pattern: /import/, longer_alt: undefined });
export const As = createToken({ name: "As", pattern: /as/, longer_alt: undefined });
export const Let = createToken({ name: "Let", pattern: /let/, longer_alt: undefined });
export const Return = createToken({ name: "Return", pattern: /return/, longer_alt: undefined });
export const CallQ = createToken({ name: "CallQ", pattern: /call\?/ });
export const Do = createToken({ name: "Do", pattern: /do/, longer_alt: undefined });
export const Assert = createToken({ name: "Assert", pattern: /assert/, longer_alt: undefined });
export const Check = createToken({ name: "Check", pattern: /check/, longer_alt: undefined });
export const True = createToken({ name: "True", pattern: /true/, longer_alt: undefined });
export const False = createToken({ name: "False", pattern: /false/, longer_alt: undefined });
export const Null = createToken({ name: "Null", pattern: /null/, longer_alt: undefined });

// v0.3 keywords
export const If = createToken({ name: "If", pattern: /if/, longer_alt: undefined });
export const Else = createToken({ name: "Else", pattern: /else/, longer_alt: undefined });
export const For = createToken({ name: "For", pattern: /for/, longer_alt: undefined });
export const Fn = createToken({ name: "Fn", pattern: /fn/, longer_alt: undefined });
export const Match = createToken({ name: "Match", pattern: /match/, longer_alt: undefined });

// v0.4 keywords
export const Try = createToken({ name: "Try", pattern: /try/, longer_alt: undefined });
export const Catch = createToken({ name: "Catch", pattern: /catch/, longer_alt: undefined });

// Identifiers (must come after all keywords)
export const Ident = createToken({ name: "Ident", pattern: /[A-Za-z_][A-Za-z0-9_]*/ });

// Ensure keywords have longer_alt pointing to Ident
Cap.LONGER_ALT = Ident;
Budget.LONGER_ALT = Ident;
Import.LONGER_ALT = Ident;
As.LONGER_ALT = Ident;
Let.LONGER_ALT = Ident;
Return.LONGER_ALT = Ident;
Do.LONGER_ALT = Ident;
Assert.LONGER_ALT = Ident;
Check.LONGER_ALT = Ident;
True.LONGER_ALT = Ident;
False.LONGER_ALT = Ident;
Null.LONGER_ALT = Ident;
If.LONGER_ALT = Ident;
Else.LONGER_ALT = Ident;
For.LONGER_ALT = Ident;
Fn.LONGER_ALT = Ident;
Match.LONGER_ALT = Ident;
Try.LONGER_ALT = Ident;
Catch.LONGER_ALT = Ident;

// Literals (no leading minus — unary minus is now an operator)
export const FloatLit = createToken({
  name: "FloatLit",
  pattern: /(?:0|[1-9]\d*)\.\d+(?:[eE][+-]?\d+)?/,
});
export const IntLit = createToken({
  name: "IntLit",
  pattern: /(?:0|[1-9]\d*)(?![.\deE])/,
});
export const StringLit = createToken({
  name: "StringLit",
  pattern: /"(?:[^"\\]|\\["\\\/bfnrt]|\\u[0-9a-fA-F]{4})*"/,
});

// Punctuation
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const DotDotDot = createToken({ name: "DotDotDot", pattern: /\.\.\./ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const Arrow = createToken({ name: "Arrow", pattern: /->/ });
export const Equals = createToken({ name: "Equals", pattern: /=/ });

// Comparison operators (multi-char before single-char)
export const GtEq = createToken({ name: "GtEq", pattern: />=/ });
export const LtEq = createToken({ name: "LtEq", pattern: /<=/ });
export const EqEq = createToken({ name: "EqEq", pattern: /==/ });
export const BangEq = createToken({ name: "BangEq", pattern: /!=/ });
export const Gt = createToken({ name: "Gt", pattern: />/ });
export const Lt = createToken({ name: "Lt", pattern: /</ });

// Arithmetic operators
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });
export const Star = createToken({ name: "Star", pattern: /\*/ });
export const Slash = createToken({ name: "Slash", pattern: /\// });
export const Percent = createToken({ name: "Percent", pattern: /%/ });

// Whitespace and comments
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t]+/,
  group: Lexer.SKIPPED,
});
export const Newline = createToken({
  name: "Newline",
  pattern: /\r?\n/,
  group: Lexer.SKIPPED,
});
export const Comment = createToken({
  name: "Comment",
  pattern: /#[^\n\r]*/,
  group: Lexer.SKIPPED,
});

// Token order matters: longer/more specific tokens first
export const allTokens = [
  WhiteSpace,
  Newline,
  Comment,
  // Multi-char operators first (order critical)
  Arrow,    // -> before Minus and Gt
  GtEq,     // >= before Gt and Equals
  LtEq,     // <= before Lt and Equals
  EqEq,     // == before Equals
  BangEq,   // != before single chars
  // Keywords (before Ident) - longer prefixes first
  CallQ,
  Cap,
  Budget,
  Import,
  Assert,
  As,
  Let,
  Return,
  Do,
  Check,
  Match,
  Catch,
  If,
  Else,
  For,
  Fn,
  Try,
  True,
  False,
  Null,
  // Literals
  FloatLit,
  IntLit,
  StringLit,
  // Ident after keywords
  Ident,
  // Punctuation & single-char operators
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  LParen,
  RParen,
  Colon,
  Comma,
  DotDotDot,
  Dot,
  Equals,
  Gt,
  Lt,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
];

export const A0Lexer = new Lexer(allTokens);
