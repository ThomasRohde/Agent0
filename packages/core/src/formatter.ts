/**
 * A0 Canonical Formatter (AST pretty-printer).
 * Produces deterministic, idempotent output.
 */
import type * as AST from "./ast.js";

const INDENT = "  ";

// Precedence table for binary operators (higher = tighter binding)
const PRECEDENCE: Record<string, number> = {
  "==": 1, "!=": 1,
  ">": 2, "<": 2, ">=": 2, "<=": 2,
  "+": 3, "-": 3,
  "*": 4, "/": 4, "%": 4,
};

function needsParens(child: AST.Expr, parentOp: string, isRight: boolean): boolean {
  if (child.kind !== "BinaryExpr") return false;
  const childPrec = PRECEDENCE[child.op] ?? 0;
  const parentPrec = PRECEDENCE[parentOp] ?? 0;
  if (childPrec < parentPrec) return true;
  // Right-associativity: for same-precedence on right side, add parens
  // to maintain left-associativity (e.g. a - (b - c))
  if (childPrec === parentPrec && isRight) return true;
  return false;
}

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

function formatStmt(s: AST.Stmt, depth: number = 0): string {
  const prefix = INDENT.repeat(depth);
  switch (s.kind) {
    case "LetStmt":
      return `${prefix}let ${s.name} = ${formatExpr(s.value, depth)}`;
    case "ExprStmt": {
      let out = `${prefix}${formatExpr(s.expr, depth)}`;
      if (s.target) {
        out += ` -> ${formatIdentPath(s.target)}`;
      }
      return out;
    }
    case "ReturnStmt":
      return `${prefix}return ${formatExpr(s.value, depth)}`;
    case "FnDecl": {
      const params = s.params.join(", ");
      const bodyLines = formatBlock(s.body, depth);
      return `${prefix}fn ${s.name} { ${params} } {\n${bodyLines}\n${prefix}}`;
    }
  }
}

function formatBlock(stmts: AST.Stmt[], depth: number): string {
  return stmts.map((s) => formatStmt(s, depth + 1)).join("\n");
}

function formatExpr(e: AST.Expr, depth: number): string {
  switch (e.kind) {
    case "IntLiteral":
      return String(e.value);
    case "FloatLiteral":
      return formatFloatLiteral(e.value);
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
    case "IfExpr":
      return `if { cond: ${formatExpr(e.cond, depth + 1)}, then: ${formatExpr(e.then, depth + 1)}, else: ${formatExpr(e.else, depth + 1)} }`;
    case "IfBlockExpr": {
      const thenLines = formatBlock(e.thenBody, depth);
      const elseLines = formatBlock(e.elseBody, depth);
      const prefix = INDENT.repeat(depth);
      return `if (${formatExpr(e.cond, depth)}) {\n${thenLines}\n${prefix}} else {\n${elseLines}\n${prefix}}`;
    }
    case "TryExpr": {
      const tryLines = formatBlock(e.tryBody, depth);
      const catchLines = formatBlock(e.catchBody, depth);
      const prefix = INDENT.repeat(depth);
      return `try {\n${tryLines}\n${prefix}} catch { ${e.catchBinding} } {\n${catchLines}\n${prefix}}`;
    }
    case "ForExpr": {
      const bodyLines = formatBlock(e.body, depth);
      return `for { in: ${formatExpr(e.list, depth + 1)}, as: ${JSON.stringify(e.binding)} } {\n${bodyLines}\n${INDENT.repeat(depth)}}`;
    }
    case "MatchExpr": {
      const inner = INDENT.repeat(depth + 1);
      const okBody = formatBlock(e.okArm.body, depth + 1);
      const errBody = formatBlock(e.errArm.body, depth + 1);
      const subjectStr = e.subject.kind === "IdentPath"
        ? formatExpr(e.subject, depth)
        : `(${formatExpr(e.subject, depth)})`;
      return `match ${subjectStr} {\n${inner}ok { ${e.okArm.binding} } {\n${okBody}\n${inner}}\n${inner}err { ${e.errArm.binding} } {\n${errBody}\n${inner}}\n${INDENT.repeat(depth)}}`;
    }
    case "FilterBlockExpr": {
      const bodyLines = formatBlock(e.body, depth);
      return `filter { in: ${formatExpr(e.list, depth + 1)}, as: ${JSON.stringify(e.binding)} } {\n${bodyLines}\n${INDENT.repeat(depth)}}`;
    }
    case "LoopExpr": {
      const bodyLines = formatBlock(e.body, depth);
      return `loop { in: ${formatExpr(e.init, depth + 1)}, times: ${formatExpr(e.times, depth + 1)}, as: ${JSON.stringify(e.binding)} } {\n${bodyLines}\n${INDENT.repeat(depth)}}`;
    }
    case "BinaryExpr": {
      let leftStr = formatExpr(e.left, depth);
      let rightStr = formatExpr(e.right, depth);
      if (needsParens(e.left, e.op, false)) leftStr = `(${leftStr})`;
      if (needsParens(e.right, e.op, true)) rightStr = `(${rightStr})`;
      return `${leftStr} ${e.op} ${rightStr}`;
    }
    case "UnaryExpr": {
      const operandStr = formatExpr(e.operand, depth);
      // Parenthesize if operand is binary or unary to avoid ambiguity
      if (e.operand.kind === "BinaryExpr" || e.operand.kind === "UnaryExpr") {
        return `-(${operandStr})`;
      }
      return `-${operandStr}`;
    }
  }
}

function formatFloatLiteral(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const raw = String(value);
  const expanded = /e/i.test(raw) ? expandScientificNotation(raw) : raw;
  return expanded.includes(".") ? expanded : `${expanded}.0`;
}

function expandScientificNotation(value: string): string {
  const [mantissa, exponentPart] = value.toLowerCase().split("e");
  const exponent = Number.parseInt(exponentPart, 10);
  if (!Number.isFinite(exponent)) return value;

  let sign = "";
  let digits = mantissa;
  if (digits.startsWith("-")) {
    sign = "-";
    digits = digits.slice(1);
  } else if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  const dot = digits.indexOf(".");
  const intPart = dot >= 0 ? digits.slice(0, dot) : digits;
  const fracPart = dot >= 0 ? digits.slice(dot + 1) : "";
  const compact = intPart + fracPart;
  const decimalIndex = intPart.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(-decimalIndex)}${compact}`;
  }
  if (decimalIndex >= compact.length) {
    return `${sign}${compact}${"0".repeat(decimalIndex - compact.length)}.0`;
  }
  return `${sign}${compact.slice(0, decimalIndex)}.${compact.slice(decimalIndex)}`;
}

function formatIdentPath(ip: AST.IdentPath): string {
  return ip.parts.join(".");
}

function formatPairOrSpread(p: AST.RecordPair | AST.SpreadPair, depth: number): string {
  if (p.kind === "SpreadPair") {
    return `...${formatExpr(p.expr, depth)}`;
  }
  return `${p.key}: ${formatExpr(p.value, depth)}`;
}

function formatRecord(rec: AST.RecordExpr, depth: number): string {
  if (rec.pairs.length === 0) return "{}";

  // Inline for short records
  const inlineParts = rec.pairs.map(
    (p) => formatPairOrSpread(p, depth + 1)
  );
  const inline = `{ ${inlineParts.join(", ")} }`;
  if (inline.length <= 72) return inline;

  // Multi-line for long records
  const inner = INDENT.repeat(depth + 1);
  const outer = INDENT.repeat(depth);
  const parts = rec.pairs.map(
    (p) => `${inner}${formatPairOrSpread(p, depth + 1)}`
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
