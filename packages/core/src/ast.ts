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

export type Expr =
  | Literal
  | IdentPath
  | RecordExpr
  | ListExpr
  | CallExpr
  | DoExpr
  | AssertExpr
  | CheckExpr
  | FnCallExpr;

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

export type Stmt = LetStmt | ExprStmt | ReturnStmt;

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
