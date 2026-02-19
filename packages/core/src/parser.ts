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
  If,
  For,
  Fn,
  Match,
  Ident,
  FloatLit,
  IntLit,
  StringLit,
  LBrace,
  RBrace,
  LBracket,
  RBracket,
  LParen,
  RParen,
  Colon,
  Comma,
  Dot,
  Arrow,
  Equals,
  GtEq,
  LtEq,
  EqEq,
  BangEq,
  Gt,
  Lt,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
} from "./lexer.js";
import type * as AST from "./ast.js";
import type { Span } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { A0Lexer } from "./lexer.js";
import { makeDiag } from "./diagnostics.js";

class A0CstParser extends CstParser {
  constructor() {
    super(allTokens, { recoveryEnabled: false, nodeLocationTracking: "full" });
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
      { ALT: () => this.SUBRULE(this.fnDecl) },
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

  // v0.3: fn declaration
  fnDecl = this.RULE("fnDecl", () => {
    this.CONSUME(Fn);
    this.CONSUME(Ident);
    this.SUBRULE(this.paramList);
    this.SUBRULE(this.block);
  });

  // Shared: parameter list { a, b, c }
  paramList = this.RULE("paramList", () => {
    this.CONSUME(LBrace);
    this.OPTION(() => {
      this.CONSUME(Ident);
      this.MANY(() => {
        this.CONSUME(Comma);
        this.CONSUME2(Ident);
      });
      this.OPTION2(() => {
        this.CONSUME2(Comma); // trailing comma
      });
    });
    this.CONSUME(RBrace);
  });

  // Shared: block of statements { stmt* }
  block = this.RULE("block", () => {
    this.CONSUME(LBrace);
    this.MANY(() => {
      this.SUBRULE(this.stmt);
    });
    this.CONSUME(RBrace);
  });

  // Precedence-climbing expression grammar:
  // expr       → if | for | match | call? | do | assert | check | comparison
  // comparison → additive ((>|<|>=|<=|==|!=) additive)?
  // additive   → multiplicative ((+|-) multiplicative)*
  // multiplicative → unaryExpr ((*|/|%) unaryExpr)*
  // unaryExpr  → - unaryExpr | primary
  // primary    → ( expr ) | record | list | literal | identOrFnCall

  expr = this.RULE("expr", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.ifExpr) },
      { ALT: () => this.SUBRULE(this.forExpr) },
      { ALT: () => this.SUBRULE(this.matchExpr) },
      { ALT: () => this.SUBRULE(this.callExpr) },
      { ALT: () => this.SUBRULE(this.doExpr) },
      { ALT: () => this.SUBRULE(this.assertExpr) },
      { ALT: () => this.SUBRULE(this.checkExpr) },
      { ALT: () => this.SUBRULE(this.comparison) },
    ]);
  });

  comparison = this.RULE("comparison", () => {
    this.SUBRULE(this.additive);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(Gt) },
        { ALT: () => this.CONSUME(Lt) },
        { ALT: () => this.CONSUME(GtEq) },
        { ALT: () => this.CONSUME(LtEq) },
        { ALT: () => this.CONSUME(EqEq) },
        { ALT: () => this.CONSUME(BangEq) },
      ]);
      this.SUBRULE2(this.additive);
    });
  });

  additive = this.RULE("additive", () => {
    this.SUBRULE(this.multiplicative);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Plus) },
        { ALT: () => this.CONSUME(Minus) },
      ]);
      this.SUBRULE2(this.multiplicative);
    });
  });

  multiplicative = this.RULE("multiplicative", () => {
    this.SUBRULE(this.unaryExpr);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Star) },
        { ALT: () => this.CONSUME(Slash) },
        { ALT: () => this.CONSUME(Percent) },
      ]);
      this.SUBRULE2(this.unaryExpr);
    });
  });

  unaryExpr = this.RULE("unaryExpr", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Minus);
          this.SUBRULE(this.unaryExpr);
        },
      },
      { ALT: () => this.SUBRULE(this.primary) },
    ]);
  });

  primary = this.RULE("primary", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.expr);
          this.CONSUME(RParen);
        },
      },
      { ALT: () => this.SUBRULE(this.record) },
      { ALT: () => this.SUBRULE(this.list) },
      { ALT: () => this.SUBRULE(this.literal) },
      { ALT: () => this.SUBRULE(this.identOrFnCall) },
    ]);
  });

  // v0.3: if { cond: ..., then: ..., else: ... }
  ifExpr = this.RULE("ifExpr", () => {
    this.CONSUME(If);
    this.SUBRULE(this.record);
  });

  // v0.3: for { in: ..., as: "..." } { body }
  forExpr = this.RULE("forExpr", () => {
    this.CONSUME(For);
    this.SUBRULE(this.record);
    this.SUBRULE(this.block);
  });

  // v0.3: match <identPath|( expr )> { ok { binding } { body } err { binding } { body } }
  matchExpr = this.RULE("matchExpr", () => {
    this.CONSUME(Match);
    this.SUBRULE(this.matchSubject);
    this.CONSUME(LBrace);
    this.SUBRULE(this.matchArm);
    this.SUBRULE2(this.matchArm);
    this.CONSUME(RBrace);
  });

  matchSubject = this.RULE("matchSubject", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.expr);
          this.CONSUME(RParen);
        },
      },
      { ALT: () => this.SUBRULE(this.identPath) },
    ]);
  });

  matchArm = this.RULE("matchArm", () => {
    this.CONSUME(Ident);       // "ok" or "err"
    this.SUBRULE(this.matchBinding);
    this.SUBRULE(this.block);
  });

  matchBinding = this.RULE("matchBinding", () => {
    this.CONSUME(LBrace);
    this.CONSUME(Ident);
    this.CONSUME(RBrace);
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
    this.SUBRULE(this.pairKey);
    this.CONSUME(Colon);
    this.SUBRULE(this.expr);
  });

  // Record pair keys: identOrKeyword with optional dotted segments (e.g., "as", "fs.read")
  private pairKey = this.RULE("pairKey", () => {
    this.SUBRULE(this.identOrKeyword);
    this.MANY(() => {
      this.CONSUME(Dot);
      this.SUBRULE2(this.identOrKeyword);
    });
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

  // Accept Ident or any keyword token as a path segment (e.g., nonexistent.fn, foo.match)
  private identOrKeyword = this.RULE("identOrKeyword", () => {
    this.OR([
      { ALT: () => this.CONSUME(Ident) },
      { ALT: () => this.CONSUME(If) },
      { ALT: () => this.CONSUME(For) },
      { ALT: () => this.CONSUME(Fn) },
      { ALT: () => this.CONSUME(Match) },
      { ALT: () => this.CONSUME(Cap) },
      { ALT: () => this.CONSUME(Budget) },
      { ALT: () => this.CONSUME(Import) },
      { ALT: () => this.CONSUME(As) },
      { ALT: () => this.CONSUME(Let) },
      { ALT: () => this.CONSUME(Return) },
      { ALT: () => this.CONSUME(Do) },
      { ALT: () => this.CONSUME(Assert) },
      { ALT: () => this.CONSUME(Check) },
    ]);
  });

  identPath = this.RULE("identPath", () => {
    this.CONSUME(Ident);
    this.MANY(() => {
      this.CONSUME(Dot);
      this.SUBRULE(this.identOrKeyword);
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

class AstBuildError extends Error {
  code: "E_PARSE" | "E_AST";
  span?: Span;
  hint?: string;

  constructor(code: "E_PARSE" | "E_AST", message: string, span?: Span, hint?: string) {
    super(message);
    this.name = "AstBuildError";
    this.code = code;
    this.span = span;
    this.hint = hint;
  }
}

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
  if (children["fnDecl"]) {
    return visitFnDecl((children["fnDecl"] as CstNode[])[0], file);
  }
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

function visitFnDecl(cst: CstNode, file: string): AST.FnDecl {
  const nameToken = (cst.children["Ident"] as IToken[])[0];
  const paramListNode = (cst.children["paramList"] as CstNode[])[0];
  const blockNode = (cst.children["block"] as CstNode[])[0];

  const params: string[] = [];
  if (paramListNode.children["Ident"]) {
    for (const t of paramListNode.children["Ident"] as IToken[]) {
      params.push(t.image);
    }
  }

  const body: AST.Stmt[] = [];
  if (blockNode.children["stmt"]) {
    for (const s of blockNode.children["stmt"] as CstNode[]) {
      body.push(visitStmt(s, file));
    }
  }

  return {
    kind: "FnDecl",
    span: cstSpan(cst, file),
    name: nameToken.image,
    params,
    body,
  };
}

function visitBlock(cst: CstNode, file: string): AST.Stmt[] {
  const body: AST.Stmt[] = [];
  if (cst.children["stmt"]) {
    for (const s of cst.children["stmt"] as CstNode[]) {
      body.push(visitStmt(s, file));
    }
  }
  return body;
}

function visitExpr(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  if (children["ifExpr"]) return visitIfExpr((children["ifExpr"] as CstNode[])[0], file);
  if (children["forExpr"]) return visitForExpr((children["forExpr"] as CstNode[])[0], file);
  if (children["matchExpr"]) return visitMatchExpr((children["matchExpr"] as CstNode[])[0], file);
  if (children["callExpr"]) return visitCallExpr((children["callExpr"] as CstNode[])[0], file);
  if (children["doExpr"]) return visitDoExpr((children["doExpr"] as CstNode[])[0], file);
  if (children["assertExpr"]) return visitAssertExpr((children["assertExpr"] as CstNode[])[0], file);
  if (children["checkExpr"]) return visitCheckExpr((children["checkExpr"] as CstNode[])[0], file);
  if (children["comparison"]) return visitComparison((children["comparison"] as CstNode[])[0], file);
  throw new Error("Unknown expression type");
}

const COMPARISON_TOKEN_NAMES = new Set(["Gt", "Lt", "GtEq", "LtEq", "EqEq", "BangEq"]);
const COMPARISON_OP_MAP: Record<string, AST.BinaryOp> = {
  Gt: ">", Lt: "<", GtEq: ">=", LtEq: "<=", EqEq: "==", BangEq: "!=",
};

const ADDITIVE_TOKEN_NAMES = new Set(["Plus", "Minus"]);
const ADDITIVE_OP_MAP: Record<string, AST.BinaryOp> = { Plus: "+", Minus: "-" };

const MULT_TOKEN_NAMES = new Set(["Star", "Slash", "Percent"]);
const MULT_OP_MAP: Record<string, AST.BinaryOp> = { Star: "*", Slash: "/", Percent: "%" };

function findOperatorTokens(children: Record<string, unknown>, tokenNames: Set<string>): IToken[] {
  const ops: IToken[] = [];
  for (const name of tokenNames) {
    if (children[name]) {
      for (const t of children[name] as IToken[]) {
        ops.push(t);
      }
    }
  }
  // Sort by position to maintain order
  ops.sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
  return ops;
}

function visitComparison(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  const additives = children["additive"] as CstNode[];
  let left = visitAdditive(additives[0], file);

  if (additives.length > 1) {
    const ops = findOperatorTokens(children, COMPARISON_TOKEN_NAMES);
    const op = COMPARISON_OP_MAP[ops[0].tokenType.name];
    const right = visitAdditive(additives[1], file);
    left = { kind: "BinaryExpr", span: cstSpan(cst, file), op, left, right };
  }

  return left;
}

function visitAdditive(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  const mults = children["multiplicative"] as CstNode[];
  let left = visitMultiplicative(mults[0], file);

  if (mults.length > 1) {
    const ops = findOperatorTokens(children, ADDITIVE_TOKEN_NAMES);
    for (let i = 1; i < mults.length; i++) {
      const op = ADDITIVE_OP_MAP[ops[i - 1].tokenType.name];
      const right = visitMultiplicative(mults[i], file);
      left = { kind: "BinaryExpr", span: cstSpan(cst, file), op, left, right };
    }
  }

  return left;
}

function visitMultiplicative(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  const unaries = children["unaryExpr"] as CstNode[];
  let left = visitUnaryExpr(unaries[0], file);

  if (unaries.length > 1) {
    const ops = findOperatorTokens(children, MULT_TOKEN_NAMES);
    for (let i = 1; i < unaries.length; i++) {
      const op = MULT_OP_MAP[ops[i - 1].tokenType.name];
      const right = visitUnaryExpr(unaries[i], file);
      left = { kind: "BinaryExpr", span: cstSpan(cst, file), op, left, right };
    }
  }

  return left;
}

function visitUnaryExpr(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  if (children["Minus"]) {
    // Unary minus: recurse into nested unaryExpr
    const inner = visitUnaryExpr((children["unaryExpr"] as CstNode[])[0], file);
    return { kind: "UnaryExpr", span: cstSpan(cst, file), op: "-", operand: inner };
  }
  return visitPrimary((children["primary"] as CstNode[])[0], file);
}

function visitPrimary(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  if (children["expr"]) return visitExpr((children["expr"] as CstNode[])[0], file);
  if (children["record"]) return visitRecord((children["record"] as CstNode[])[0], file);
  if (children["list"]) return visitList((children["list"] as CstNode[])[0], file);
  if (children["literal"]) return visitLiteral((children["literal"] as CstNode[])[0], file);
  if (children["identOrFnCall"]) return visitIdentOrFnCall((children["identOrFnCall"] as CstNode[])[0], file);
  throw new Error("Unknown primary expression type");
}

function visitIfExpr(cst: CstNode, file: string): AST.IfExpr {
  const rec = visitRecord((cst.children["record"] as CstNode[])[0], file);
  let cond: AST.Expr | undefined;
  let thenExpr: AST.Expr | undefined;
  let elseExpr: AST.Expr | undefined;
  for (const p of rec.pairs) {
    if (p.key === "cond") cond = p.value;
    if (p.key === "then") thenExpr = p.value;
    if (p.key === "else") elseExpr = p.value;
  }
  if (!cond || !thenExpr || !elseExpr) {
    throw new AstBuildError(
      "E_PARSE",
      "if expression requires cond, then, and else fields",
      cstSpan(cst, file),
      "Use syntax: if { cond: ..., then: ..., else: ... }."
    );
  }
  return {
    kind: "IfExpr",
    span: cstSpan(cst, file),
    cond,
    then: thenExpr,
    else: elseExpr,
  };
}

function visitForExpr(cst: CstNode, file: string): AST.ForExpr {
  const rec = visitRecord((cst.children["record"] as CstNode[])[0], file);
  const blockNode = (cst.children["block"] as CstNode[])[0];

  let list: AST.Expr | undefined;
  let binding: string | undefined;
  for (const p of rec.pairs) {
    if (p.key === "in") list = p.value;
    if (p.key === "as" && p.value.kind === "StrLiteral") binding = p.value.value;
  }
  if (!list || !binding) {
    throw new AstBuildError(
      "E_PARSE",
      "for expression requires 'in' and 'as' fields",
      cstSpan(cst, file),
      "Use syntax: for { in: <list>, as: \"name\" } { ... }."
    );
  }

  return {
    kind: "ForExpr",
    span: cstSpan(cst, file),
    list,
    binding,
    body: visitBlock(blockNode, file),
  };
}

function visitMatchSubject(cst: CstNode, file: string): AST.Expr {
  const children = cst.children;
  if (children["expr"]) {
    return visitExpr((children["expr"] as CstNode[])[0], file);
  }
  if (children["identPath"]) {
    return visitIdentPath((children["identPath"] as CstNode[])[0], file);
  }
  throw new Error("Unknown match subject type");
}

function visitMatchExpr(cst: CstNode, file: string): AST.MatchExpr {
  const subject = visitMatchSubject((cst.children["matchSubject"] as CstNode[])[0], file);
  const arms = cst.children["matchArm"] as CstNode[];

  let okArm: AST.MatchArm | undefined;
  let errArm: AST.MatchArm | undefined;

  for (const arm of arms) {
    const tagToken = (arm.children["Ident"] as IToken[])[0];
    const tag = tagToken.image;
    const bindingNode = (arm.children["matchBinding"] as CstNode[])[0];
    const blockNode = (arm.children["block"] as CstNode[])[0];
    const binding = visitMatchBinding(bindingNode);

    const matchArm: AST.MatchArm = {
      kind: "MatchArm",
      span: cstSpan(arm, file),
      tag: tag as "ok" | "err",
      binding,
      body: visitBlock(blockNode, file),
    };

    if (tag === "ok") okArm = matchArm;
    else if (tag === "err") errArm = matchArm;
    else {
      throw new AstBuildError(
        "E_PARSE",
        `match arm must be 'ok' or 'err', got '${tag}'`,
        cstSpan(arm, file),
        "Use exactly two arms: ok {v} { ... } and err {e} { ... }."
      );
    }
  }

  if (!okArm || !errArm) {
    throw new AstBuildError(
      "E_PARSE",
      "match expression requires both ok and err arms",
      cstSpan(cst, file),
      "Provide both arms: ok {v} { ... } and err {e} { ... }."
    );
  }

  return {
    kind: "MatchExpr",
    span: cstSpan(cst, file),
    subject,
    okArm,
    errArm,
  };
}

function visitMatchBinding(cst: CstNode): string {
  const identToken = (cst.children["Ident"] as IToken[])[0];
  return identToken.image;
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
  const keyNode = (cst.children["pairKey"] as CstNode[])[0];
  const key = visitPairKey(keyNode);
  const valueNode = (cst.children["expr"] as CstNode[])[0];
  return {
    kind: "RecordPair",
    span: cstSpan(cst, file),
    key,
    value: visitExpr(valueNode, file),
  };
}

function visitPairKey(cst: CstNode): string {
  const parts: string[] = [];
  if (cst.children["identOrKeyword"]) {
    for (const node of cst.children["identOrKeyword"] as CstNode[]) {
      parts.push(extractIdentOrKeyword(node));
    }
  }
  return parts.join(".");
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
  // First segment is always a direct Ident child
  if (cst.children["Ident"]) {
    parts.push((cst.children["Ident"] as IToken[])[0].image);
  }
  // Subsequent segments come from identOrKeyword subrule nodes
  if (cst.children["identOrKeyword"]) {
    for (const node of cst.children["identOrKeyword"] as CstNode[]) {
      parts.push(extractIdentOrKeyword(node));
    }
  }
  return { kind: "IdentPath", span: cstSpan(cst, file), parts };
}

function extractIdentOrKeyword(cst: CstNode): string {
  // identOrKeyword rule matches exactly one token (Ident or any keyword)
  for (const children of Object.values(cst.children)) {
    if (children && children.length > 0) {
      return (children[0] as IToken).image;
    }
  }
  return "";
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
    if (e instanceof AstBuildError) {
      diagnostics.push(
        makeDiag(e.code, e.message, e.span, e.hint)
      );
      return { diagnostics };
    }
    diagnostics.push(
      makeDiag("E_AST", (e as Error).message)
    );
    return { diagnostics };
  }
}
