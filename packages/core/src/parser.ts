/**
 * A0 Language Parser using Chevrotain.
 * Produces an A0 AST from tokens.
 */
import { CstParser, type IToken, type CstNode } from "chevrotain";
import {
  allTokens,
  Cap,
  Budget,
  Import,
  As,
  Let,
  Return,
  CallQ,
  Do,
  Assert,
  Check,
  True,
  False,
  Null,
  Ident,
  FloatLit,
  IntLit,
  StringLit,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  Colon,
  Comma,
  Dot,
  Arrow,
  Equals,
} from "./lexer.js";
import type * as AST from "./ast.js";
import type { Span } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { A0Lexer } from "./lexer.js";
import { makeDiag } from "./diagnostics.js";

class A0CstParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: false });
    this.performSelfAnalysis();
  }

  program = this.RULE("program", () => {
    this.MANY(() => {
      this.SUBRULE(this.header);
    });
    this.MANY2(() => {
      this.SUBRULE(this.stmt);
    });
  });

  header = this.RULE("header", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.capDecl) },
      { ALT: () => this.SUBRULE(this.budgetDecl) },
      { ALT: () => this.SUBRULE(this.importDecl) },
    ]);
  });

  capDecl = this.RULE("capDecl", () => {
    this.CONSUME(Cap);
    this.SUBRULE(this.record);
  });

  budgetDecl = this.RULE("budgetDecl", () => {
    this.CONSUME(Budget);
    this.SUBRULE(this.record);
  });

  importDecl = this.RULE("importDecl", () => {
    this.CONSUME(Import);
    this.CONSUME(StringLit);
    this.CONSUME(As);
    this.CONSUME(Ident);
  });

  stmt = this.RULE("stmt", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.letStmt) },
      { ALT: () => this.SUBRULE(this.returnStmt) },
      { ALT: () => this.SUBRULE(this.exprStmt) },
    ]);
  });

  letStmt = this.RULE("letStmt", () => {
    this.CONSUME(Let);
    this.CONSUME(Ident);
    this.CONSUME(Equals);
    this.SUBRULE(this.expr);
  });

  returnStmt = this.RULE("returnStmt", () => {
    this.CONSUME(Return);
    this.SUBRULE(this.record);
  });

  exprStmt = this.RULE("exprStmt", () => {
    this.SUBRULE(this.expr);
    this.OPTION(() => {
      this.CONSUME(Arrow);
      this.SUBRULE(this.identPath);
    });
  });

  expr = this.RULE("expr", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.callExpr) },
      { ALT: () => this.SUBRULE(this.doExpr) },
      { ALT: () => this.SUBRULE(this.assertExpr) },
      { ALT: () => this.SUBRULE(this.checkExpr) },
      { ALT: () => this.SUBRULE(this.record) },
      { ALT: () => this.SUBRULE(this.list) },
      { ALT: () => this.SUBRULE(this.literal) },
      { ALT: () => this.SUBRULE(this.identOrFnCall) },
    ]);
  });

  callExpr = this.RULE("callExpr", () => {
    this.CONSUME(CallQ);
    this.SUBRULE(this.identPath);
    this.SUBRULE(this.record);
  });

  doExpr = this.RULE("doExpr", () => {
    this.CONSUME(Do);
    this.SUBRULE(this.identPath);
    this.SUBRULE(this.record);
  });

  assertExpr = this.RULE("assertExpr", () => {
    this.CONSUME(Assert);
    this.SUBRULE(this.record);
  });

  checkExpr = this.RULE("checkExpr", () => {
    this.CONSUME(Check);
    this.SUBRULE(this.record);
  });

  // ident that might be followed by a record (function call)
  identOrFnCall = this.RULE("identOrFnCall", () => {
    this.SUBRULE(this.identPath);
    this.OPTION(() => {
      this.SUBRULE(this.record);
    });
  });

  record = this.RULE("record", () => {
    this.CONSUME(LBrace);
    this.OPTION(() => {
      this.SUBRULE(this.pair);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE2(this.pair);
      });
      this.OPTION2(() => {
        this.CONSUME2(Comma); // trailing comma
      });
    });
    this.CONSUME(RBrace);
  });

  pair = this.RULE("pair", () => {
    this.SUBRULE(this.identPath);
    this.CONSUME(Colon);
    this.SUBRULE(this.expr);
  });

  list = this.RULE("list", () => {
    this.CONSUME(LBracket);
    this.OPTION(() => {
      this.SUBRULE(this.expr);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.SUBRULE2(this.expr);
      });
      this.OPTION2(() => {
        this.CONSUME2(Comma); // trailing comma
      });
    });
    this.CONSUME(RBracket);
  });

  identPath = this.RULE("identPath", () => {
    this.CONSUME(Ident);
    this.MANY(() => {
      this.CONSUME(Dot);
      this.CONSUME2(Ident);
    });
  });

  literal = this.RULE("literal", () => {
    this.OR([
      { ALT: () => this.CONSUME(IntLit) },
      { ALT: () => this.CONSUME(FloatLit) },
      { ALT: () => this.CONSUME(StringLit) },
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
      { ALT: () => this.CONSUME(Null) },
    ]);
  });
}

// Singleton parser instance
const cstParser = new A0CstParser();

// --- CST to AST visitor ---

function tokenSpan(token: IToken, file: string): Span {
  return {
    file,
    startLine: token.startLine ?? 1,
    startCol: token.startColumn ?? 1,
    endLine: token.endLine ?? 1,
    endCol: (token.endColumn ?? 1) + 1,
  };
}

function cstSpan(node: CstNode, file: string): Span {
  const loc = node.location;
  if (loc) {
    return {
      file,
      startLine: loc.startLine ?? 1,
      startCol: loc.startColumn ?? 1,
      endLine: loc.endLine ?? 1,
      endCol: (loc.endColumn ?? 1) + 1,
    };
  }
  return { file, startLine: 1, startCol: 1, endLine: 1, endCol: 1 };
}

function visitProgram(cst: CstNode, file: string): AST.Program {
  const headers: AST.Header[] = [];
  const statements: AST.Stmt[] = [];
  const children = cst.children;

  if (children["header"]) {
    for (const h of children["header"] as CstNode[]) {
      headers.push(visitHeader(h, file));
    }
  }
  if (children["stmt"]) {
    for (const s of children["stmt"] as CstNode[]) {
      statements.push(visitStmt(s, file));
    }
  }

  return {
    kind: "Program",
    span: cstSpan(cst, file),
    headers,
    statements,
  };
}

function visitHeader(cst: CstNode, file: string): AST.Header {
  const children = cst.children;
  if (children["capDecl"]) {
    return visitCapDecl((children["capDecl"] as CstNode[])[0], file);
  }
  if (children["budgetDecl"]) {
    return visitBudgetDecl((children["budgetDecl"] as CstNode[])[0], file);
  }
  if (children["importDecl"]) {
    return visitImportDecl((children["importDecl"] as CstNode[])[0], file);
  }
  throw new Error("Unknown header type");
}

function visitCapDecl(cst: CstNode, file: string): AST.CapDecl {
  const rec = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "CapDecl", span: cstSpan(cst, file), capabilities: rec };
}

function visitBudgetDecl(cst: CstNode, file: string): AST.BudgetDecl {
  const rec = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "BudgetDecl", span: cstSpan(cst, file), budget: rec };
}

function visitImportDecl(cst: CstNode, file: string): AST.ImportDecl {
  const pathToken = (cst.children["StringLit"] as IToken[])[0];
  const aliasToken = (cst.children["Ident"] as IToken[])[0];
  return {
    kind: "ImportDecl",
    span: cstSpan(cst, file),
    path: JSON.parse(pathToken.image),
    alias: aliasToken.image,
  };
}

function visitStmt(cst: CstNode, file: string): AST.Stmt {
  const children = cst.children;
  if (children["letStmt"]) {
    return visitLetStmt((children["letStmt"] as CstNode[])[0], file);
  }
  if (children["returnStmt"]) {
    return visitReturnStmt((children["returnStmt"] as CstNode[])[0], file);
  }
  if (children["exprStmt"]) {
    return visitExprStmt((children["exprStmt"] as CstNode[])[0], file);
  }
  throw new Error("Unknown statement type");
}

function visitLetStmt(cst: CstNode, file: string): AST.LetStmt {
  const nameToken = (cst.children["Ident"] as IToken[])[0];
  const exprNode = (cst.children["expr"] as CstNode[])[0];
  return {
    kind: "LetStmt",
    span: cstSpan(cst, file),
    name: nameToken.image,
    value: visitExpr(exprNode, file),
  };
}

function visitReturnStmt(cst: CstNode, file: string): AST.ReturnStmt {
  const rec = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "ReturnStmt", span: cstSpan(cst, file), value: rec };
}

function visitExprStmt(cst: CstNode, file: string): AST.ExprStmt {
  const exprNode = (cst.children["expr"] as CstNode[])[0];
  const result: AST.ExprStmt = {
    kind: "ExprStmt",
    span: cstSpan(cst, file),
    expr: visitExpr(exprNode, file),
  };
  if (cst.children["identPath"]) {
    result.target = visitIdentPath((cst.children["identPath"] as CstNode[])[0], file);
  }
  return result;
}

function visitExpr(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  if (children["callExpr"]) return visitCallExpr((children["callExpr"] as CstNode[])[0], file);
  if (children["doExpr"]) return visitDoExpr((children["doExpr"] as CstNode[])[0], file);
  if (children["assertExpr"]) return visitAssertExpr((children["assertExpr"] as CstNode[])[0], file);
  if (children["checkExpr"]) return visitCheckExpr((children["checkExpr"] as CstNode[])[0], file);
  if (children["record"]) return visitRecord((children["record"] as CstNode[])[0], file);
  if (children["list"]) return visitList((children["list"] as CstNode[])[0], file);
  if (children["literal"]) return visitLiteral((children["literal"] as CstNode[])[0], file);
  if (children["identOrFnCall"]) return visitIdentOrFnCall((children["identOrFnCall"] as CstNode[])[0], file);
  throw new Error("Unknown expression type");
}

function visitCallExpr(cst: CstNode, file: string): AST.CallExpr {
  const tool = visitIdentPath((cst.children["identPath"] as CstNode[])[0], file);
  const args = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "CallExpr", span: cstSpan(cst, file), tool, args };
}

function visitDoExpr(cst: CstNode, file: string): AST.DoExpr {
  const tool = visitIdentPath((cst.children["identPath"] as CstNode[])[0], file);
  const args = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "DoExpr", span: cstSpan(cst, file), tool, args };
}

function visitAssertExpr(cst: CstNode, file: string): AST.AssertExpr {
  const args = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "AssertExpr", span: cstSpan(cst, file), args };
}

function visitCheckExpr(cst: CstNode, file: string): AST.CheckExpr {
  const args = visitRecord((cst.children["record"] as CstNode[])[0], file);
  return { kind: "CheckExpr", span: cstSpan(cst, file), args };
}

function visitIdentOrFnCall(cst: CstNode, file: string): AST.Expr {
  const idPath = visitIdentPath((cst.children["identPath"] as CstNode[])[0], file);
  if (cst.children["record"]) {
    const args = visitRecord((cst.children["record"] as CstNode[])[0], file);
    return { kind: "FnCallExpr", span: cstSpan(cst, file), name: idPath, args };
  }
  return idPath;
}

function visitRecord(cst: CstNode, file: string): AST.RecordExpr {
  const pairs: AST.RecordPair[] = [];
  if (cst.children["pair"]) {
    for (const p of cst.children["pair"] as CstNode[]) {
      pairs.push(visitPair(p, file));
    }
  }
  return { kind: "RecordExpr", span: cstSpan(cst, file), pairs };
}

function visitPair(cst: CstNode, file: string): AST.RecordPair {
  const keyPath = visitIdentPath((cst.children["identPath"] as CstNode[])[0], file);
  const valueNode = (cst.children["expr"] as CstNode[])[0];
  return {
    kind: "RecordPair",
    span: cstSpan(cst, file),
    key: keyPath.parts.join("."),
    value: visitExpr(valueNode, file),
  };
}

function visitList(cst: CstNode, file: string): AST.ListExpr {
  const elements: AST.Expr[] = [];
  if (cst.children["expr"]) {
    for (const e of cst.children["expr"] as CstNode[]) {
      elements.push(visitExpr(e, file));
    }
  }
  return { kind: "ListExpr", span: cstSpan(cst, file), elements };
}

function visitIdentPath(cst: CstNode, file: string): AST.IdentPath {
  const parts: string[] = [];
  if (cst.children["Ident"]) {
    for (const t of cst.children["Ident"] as IToken[]) {
      parts.push(t.image);
    }
  }
  return { kind: "IdentPath", span: cstSpan(cst, file), parts };
}

function visitLiteral(cst: CstNode, file: string): AST.Literal {
  const children = cst.children;
  if (children["IntLit"]) {
    const t = (children["IntLit"] as IToken[])[0];
    return { kind: "IntLiteral", span: tokenSpan(t, file), value: parseInt(t.image, 10) };
  }
  if (children["FloatLit"]) {
    const t = (children["FloatLit"] as IToken[])[0];
    return { kind: "FloatLiteral", span: tokenSpan(t, file), value: parseFloat(t.image) };
  }
  if (children["StringLit"]) {
    const t = (children["StringLit"] as IToken[])[0];
    return { kind: "StrLiteral", span: tokenSpan(t, file), value: JSON.parse(t.image) };
  }
  if (children["True"]) {
    const t = (children["True"] as IToken[])[0];
    return { kind: "BoolLiteral", span: tokenSpan(t, file), value: true };
  }
  if (children["False"]) {
    const t = (children["False"] as IToken[])[0];
    return { kind: "BoolLiteral", span: tokenSpan(t, file), value: false };
  }
  if (children["Null"]) {
    const t = (children["Null"] as IToken[])[0];
    return { kind: "NullLiteral", span: tokenSpan(t, file) };
  }
  throw new Error("Unknown literal type");
}

// --- Public API ---

export interface ParseResult {
  program?: AST.Program;
  diagnostics: Diagnostic[];
}

export function parse(source: string, file: string = "<stdin>"): ParseResult {
  const lexResult = A0Lexer.tokenize(source);
  const diagnostics: Diagnostic[] = [];

  for (const err of lexResult.errors) {
    diagnostics.push(
      makeDiag(
        "E_LEX",
        err.message,
        {
          file,
          startLine: err.line ?? 1,
          startCol: err.column ?? 1,
          endLine: err.line ?? 1,
          endCol: (err.column ?? 1) + (err.length ?? 1),
        },
        "Check for invalid characters or unclosed strings."
      )
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  cstParser.input = lexResult.tokens;
  const cst = cstParser.program();

  for (const err of cstParser.errors) {
    const token = err.token;
    diagnostics.push(
      makeDiag(
        "E_PARSE",
        err.message,
        {
          file,
          startLine: token.startLine ?? 1,
          startCol: token.startColumn ?? 1,
          endLine: token.endLine ?? 1,
          endCol: (token.endColumn ?? 1) + 1,
        },
        "Check syntax near this location."
      )
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  try {
    const program = visitProgram(cst, file);
    return { program, diagnostics: [] };
  } catch (e) {
    diagnostics.push(
      makeDiag("E_AST", (e as Error).message)
    );
    return { diagnostics };
  }
}
