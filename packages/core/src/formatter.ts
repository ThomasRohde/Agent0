/**
 * A0 Canonical Formatter (AST pretty-printer).
 * Produces deterministic, idempotent output.
 */
import type * as AST from "./ast.js";

const INDENT = "  ";

export function format(program: AST.Program): string {
  const lines: string[] = [];

  // Headers
  for (const h of program.headers) {
    lines.push(formatHeader(h));
  }

  if (program.headers.length > 0 && program.statements.length > 0) {
    lines.push("");
  }

  // Statements
  for (const s of program.statements) {
    lines.push(formatStmt(s));
  }

  return lines.join("\n") + "\n";
}

function formatHeader(h: AST.Header): string {
  switch (h.kind) {
    case "CapDecl":
      return `cap ${formatRecord(h.capabilities, 0)}`;
    case "BudgetDecl":
      return `budget ${formatRecord(h.budget, 0)}`;
    case "ImportDecl":
      return `import ${JSON.stringify(h.path)} as ${h.alias}`;
  }
}

function formatStmt(s: AST.Stmt): string {
  switch (s.kind) {
    case "LetStmt":
      return `let ${s.name} = ${formatExpr(s.value, 0)}`;
    case "ExprStmt": {
      let out = formatExpr(s.expr, 0);
      if (s.target) {
        out += ` -> ${formatIdentPath(s.target)}`;
      }
      return out;
    }
    case "ReturnStmt":
      return `return ${formatRecord(s.value, 0)}`;
  }
}

function formatExpr(e: AST.Expr, depth: number): string {
  switch (e.kind) {
    case "IntLiteral":
      return String(e.value);
    case "FloatLiteral":
      return String(e.value);
    case "BoolLiteral":
      return String(e.value);
    case "StrLiteral":
      return JSON.stringify(e.value);
    case "NullLiteral":
      return "null";
    case "IdentPath":
      return formatIdentPath(e);
    case "RecordExpr":
      return formatRecord(e, depth);
    case "ListExpr":
      return formatList(e, depth);
    case "CallExpr":
      return `call? ${formatIdentPath(e.tool)} ${formatRecord(e.args, depth)}`;
    case "DoExpr":
      return `do ${formatIdentPath(e.tool)} ${formatRecord(e.args, depth)}`;
    case "AssertExpr":
      return `assert ${formatRecord(e.args, depth)}`;
    case "CheckExpr":
      return `check ${formatRecord(e.args, depth)}`;
    case "FnCallExpr":
      return `${formatIdentPath(e.name)} ${formatRecord(e.args, depth)}`;
  }
}

function formatIdentPath(ip: AST.IdentPath): string {
  return ip.parts.join(".");
}

function formatRecord(rec: AST.RecordExpr, depth: number): string {
  if (rec.pairs.length === 0) return "{}";

  // Inline for short records
  const inlineParts = rec.pairs.map(
    (p) => `${p.key}: ${formatExpr(p.value, depth + 1)}`
  );
  const inline = `{ ${inlineParts.join(", ")} }`;
  if (inline.length <= 72) return inline;

  // Multi-line for long records
  const inner = INDENT.repeat(depth + 1);
  const outer = INDENT.repeat(depth);
  const parts = rec.pairs.map(
    (p) => `${inner}${p.key}: ${formatExpr(p.value, depth + 1)}`
  );
  return `{\n${parts.join(",\n")}\n${outer}}`;
}

function formatList(list: AST.ListExpr, depth: number): string {
  if (list.elements.length === 0) return "[]";

  const inlineParts = list.elements.map((e) => formatExpr(e, depth + 1));
  const inline = `[${inlineParts.join(", ")}]`;
  if (inline.length <= 72) return inline;

  const inner = INDENT.repeat(depth + 1);
  const outer = INDENT.repeat(depth);
  const parts = list.elements.map(
    (e) => `${inner}${formatExpr(e, depth + 1)}`
  );
  return `[\n${parts.join(",\n")}\n${outer}]`;
}
