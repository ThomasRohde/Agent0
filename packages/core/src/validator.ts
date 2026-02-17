/**
 * A0 Semantic Validator
 * Checks parsed programs for semantic correctness.
 */
import type * as AST from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { makeDiag } from "./diagnostics.js";

export const KNOWN_CAPABILITIES = new Set([
  "fs.read",
  "fs.write",
  "http.get",
  "sh.exec",
]);

export const KNOWN_BUDGET_FIELDS = new Set([
  "timeMs",
  "maxToolCalls",
  "maxBytesWritten",
]);

export function validate(program: AST.Program): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // Check return statement exists
  const hasReturn = program.statements.some((s) => s.kind === "ReturnStmt");
  if (!hasReturn) {
    diags.push(
      makeDiag(
        "E_NO_RETURN",
        "Program must end with a return statement.",
        program.span,
        "Add a 'return { ... }' statement at the end of your program."
      )
    );
  }

  // Check return is last statement
  for (let i = 0; i < program.statements.length; i++) {
    const s = program.statements[i];
    if (s.kind === "ReturnStmt" && i < program.statements.length - 1) {
      diags.push(
        makeDiag(
          "E_RETURN_NOT_LAST",
          "Return statement must be the last statement in the program.",
          s.span,
          "Move any statements after return before it, or remove them."
        )
      );
    }
  }

  // Validate capability identifiers
  for (const h of program.headers) {
    if (h.kind === "CapDecl") {
      for (const pair of h.capabilities.pairs) {
        if (!KNOWN_CAPABILITIES.has(pair.key)) {
          diags.push(
            makeDiag(
              "E_UNKNOWN_CAP",
              `Unknown capability '${pair.key}'.`,
              pair.span,
              `Valid capabilities: ${[...KNOWN_CAPABILITIES].join(", ")}`
            )
          );
        }
      }
    }
  }

  // Validate budget field names
  for (const h of program.headers) {
    if (h.kind === "BudgetDecl") {
      for (const pair of h.budget.pairs) {
        if (!KNOWN_BUDGET_FIELDS.has(pair.key)) {
          diags.push(
            makeDiag(
              "E_UNKNOWN_BUDGET",
              `Unknown budget field '${pair.key}'.`,
              pair.span,
              `Valid budget fields: ${[...KNOWN_BUDGET_FIELDS].join(", ")}`
            )
          );
        }
      }
    }
  }

  // Validate let bindings are unique and referenced before use
  const bindings = new Set<string>();
  for (const stmt of program.statements) {
    if (stmt.kind === "LetStmt") {
      if (bindings.has(stmt.name)) {
        diags.push(
          makeDiag(
            "E_DUP_BINDING",
            `Duplicate binding '${stmt.name}'.`,
            stmt.span,
            "Use a different variable name."
          )
        );
      }
      bindings.add(stmt.name);
      validateExprBindings(stmt.value, bindings, diags);
    } else if (stmt.kind === "ExprStmt") {
      validateExprBindings(stmt.expr, bindings, diags);
      if (stmt.target) {
        // target introduces a binding
        bindings.add(stmt.target.parts[0]);
      }
    } else if (stmt.kind === "ReturnStmt") {
      validateExprBindings(stmt.value, bindings, diags);
    }
  }

  // Validate call?/do args are records (already enforced by grammar, but check)
  for (const stmt of program.statements) {
    visitExprInStmt(stmt, (expr) => {
      if (expr.kind === "CallExpr" || expr.kind === "DoExpr") {
        if (expr.args.kind !== "RecordExpr") {
          diags.push(
            makeDiag(
              "E_TOOL_ARGS",
              "Tool arguments must be a record.",
              expr.args.span,
              "Pass arguments as { key: value, ... }."
            )
          );
        }
      }
    });
  }

  // Validate declared caps match used tools
  validateCapUsage(program, diags);

  return diags;
}

function validateCapUsage(
  program: AST.Program,
  diags: Diagnostic[]
): void {
  // Collect all capabilities declared in cap { ... } headers
  const declaredCaps = new Set<string>();
  for (const h of program.headers) {
    if (h.kind === "CapDecl") {
      for (const p of h.capabilities.pairs) {
        declaredCaps.add(p.key);
      }
    }
  }

  // Walk all statements and check tool calls against declared caps
  for (const stmt of program.statements) {
    visitExprInStmt(stmt, (expr) => {
      if (expr.kind === "CallExpr" || expr.kind === "DoExpr") {
        const toolName = expr.tool.parts.join(".");
        if (!declaredCaps.has(toolName)) {
          diags.push(
            makeDiag(
              "E_UNDECLARED_CAP",
              `Tool '${toolName}' is used but its capability is not declared in a 'cap { ... }' header.`,
              expr.tool.span,
              `Add '${toolName}: true' to your cap { ... } declaration.`
            )
          );
        }
      }
    });
  }
}

function validateExprBindings(
  expr: AST.Expr,
  bindings: Set<string>,
  diags: Diagnostic[]
): void {
  switch (expr.kind) {
    case "IdentPath":
      if (!bindings.has(expr.parts[0])) {
        diags.push(
          makeDiag(
            "E_UNBOUND",
            `Unbound variable '${expr.parts[0]}'.`,
            expr.span,
            "Make sure the variable is defined with 'let' before use."
          )
        );
      }
      break;
    case "RecordExpr":
      for (const p of expr.pairs) {
        validateExprBindings(p.value, bindings, diags);
      }
      break;
    case "ListExpr":
      for (const e of expr.elements) {
        validateExprBindings(e, bindings, diags);
      }
      break;
    case "CallExpr":
    case "DoExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, diags);
      }
      break;
    case "AssertExpr":
    case "CheckExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, diags);
      }
      break;
    case "FnCallExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, diags);
      }
      break;
    // Literals don't reference bindings
    default:
      break;
  }
}

function visitExprInStmt(
  stmt: AST.Stmt,
  visitor: (expr: AST.Expr) => void
): void {
  switch (stmt.kind) {
    case "LetStmt":
      visitExpr(stmt.value, visitor);
      break;
    case "ExprStmt":
      visitExpr(stmt.expr, visitor);
      break;
    case "ReturnStmt":
      visitExpr(stmt.value, visitor);
      break;
  }
}

function visitExpr(
  expr: AST.Expr,
  visitor: (expr: AST.Expr) => void
): void {
  visitor(expr);
  switch (expr.kind) {
    case "RecordExpr":
      for (const p of expr.pairs) visitExpr(p.value, visitor);
      break;
    case "ListExpr":
      for (const e of expr.elements) visitExpr(e, visitor);
      break;
    case "CallExpr":
    case "DoExpr":
      for (const p of expr.args.pairs) visitExpr(p.value, visitor);
      break;
    case "AssertExpr":
    case "CheckExpr":
      for (const p of expr.args.pairs) visitExpr(p.value, visitor);
      break;
    case "FnCallExpr":
      for (const p of expr.args.pairs) visitExpr(p.value, visitor);
      break;
    default:
      break;
  }
}
