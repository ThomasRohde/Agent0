/**
 * A0 Language AST Node Definitions
 */

export interface Span {
  file: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

// Base node with span
export interface BaseNode {
  kind: string;
  span: Span;
}

// --- Literals ---
export interface IntLiteral extends BaseNode {
  kind: "IntLiteral";
  value: number;
}

export interface FloatLiteral extends BaseNode {
  kind: "FloatLiteral";
  value: number;
}

export interface BoolLiteral extends BaseNode {
  kind: "BoolLiteral";
  value: boolean;
}

export interface StrLiteral extends BaseNode {
  kind: "StrLiteral";
  value: string;
}

export interface NullLiteral extends BaseNode {
  kind: "NullLiteral";
}

export type Literal = IntLiteral | FloatLiteral | BoolLiteral | StrLiteral | NullLiteral;

// --- Identifiers ---
export interface IdentPath extends BaseNode {
  kind: "IdentPath";
  parts: string[];
}

// --- Collections ---
export interface RecordPair extends BaseNode {
  kind: "RecordPair";
  key: string;
  value: Expr;
}

export interface RecordExpr extends BaseNode {
  kind: "RecordExpr";
  pairs: RecordPair[];
}

export interface ListExpr extends BaseNode {
  kind: "ListExpr";
  elements: Expr[];
}

// --- Expressions ---
export interface CallExpr extends BaseNode {
  kind: "CallExpr";
  tool: IdentPath;
  args: RecordExpr;
}

export interface DoExpr extends BaseNode {
  kind: "DoExpr";
  tool: IdentPath;
  args: RecordExpr;
}

export interface AssertExpr extends BaseNode {
  kind: "AssertExpr";
  args: RecordExpr;
}

export interface CheckExpr extends BaseNode {
  kind: "CheckExpr";
  args: RecordExpr;
}

export interface FnCallExpr extends BaseNode {
  kind: "FnCallExpr";
  name: IdentPath;
  args: RecordExpr;
}

// --- v0.3: Control flow & composition ---

export interface IfExpr extends BaseNode {
  kind: "IfExpr";
  cond: Expr;
  then: Expr;
  else: Expr;
}

export interface ForExpr extends BaseNode {
  kind: "ForExpr";
  list: Expr;
  binding: string;
  body: Stmt[];
}

export interface MatchArm extends BaseNode {
  kind: "MatchArm";
  tag: "ok" | "err";
  binding: string;
  body: Stmt[];
}

export interface MatchExpr extends BaseNode {
  kind: "MatchExpr";
  subject: Expr;
  okArm: MatchArm;
  errArm: MatchArm;
}

// --- v0.35: Arithmetic & comparison expressions ---

export type BinaryOp = "+" | "-" | "*" | "/" | "%" | ">" | "<" | ">=" | "<=" | "==" | "!=";

export interface BinaryExpr extends BaseNode {
  kind: "BinaryExpr";
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export type UnaryOp = "-";

export interface UnaryExpr extends BaseNode {
  kind: "UnaryExpr";
  op: UnaryOp;
  operand: Expr;
}

export type Expr =
  | Literal
  | IdentPath
  | RecordExpr
  | ListExpr
  | CallExpr
  | DoExpr
  | AssertExpr
  | CheckExpr
  | FnCallExpr
  | IfExpr
  | ForExpr
  | MatchExpr
  | BinaryExpr
  | UnaryExpr;

// --- Statements ---
export interface LetStmt extends BaseNode {
  kind: "LetStmt";
  name: string;
  value: Expr;
}

export interface ExprStmt extends BaseNode {
  kind: "ExprStmt";
  expr: Expr;
  target?: IdentPath; // the `-> name` part
}

export interface ReturnStmt extends BaseNode {
  kind: "ReturnStmt";
  value: RecordExpr;
}

export interface FnDecl extends BaseNode {
  kind: "FnDecl";
  name: string;
  params: string[];
  body: Stmt[];
}

export type Stmt = LetStmt | ExprStmt | ReturnStmt | FnDecl;

// --- Headers ---
export interface CapDecl extends BaseNode {
  kind: "CapDecl";
  capabilities: RecordExpr;
}

export interface BudgetDecl extends BaseNode {
  kind: "BudgetDecl";
  budget: RecordExpr;
}

export interface ImportDecl extends BaseNode {
  kind: "ImportDecl";
  path: string;
  alias: string;
}

export type Header = CapDecl | BudgetDecl | ImportDecl;

// --- Program ---
export interface Program extends BaseNode {
  kind: "Program";
  headers: Header[];
  statements: Stmt[];
}
