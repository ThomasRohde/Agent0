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
  "maxIterations",
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

  // Validate let bindings, fn declarations, and variable references
  const bindings = new Set<string>();
  const fnNames = new Set<string>();

  for (const stmt of program.statements) {
    if (stmt.kind === "FnDecl") {
      if (fnNames.has(stmt.name) || bindings.has(stmt.name)) {
        diags.push(
          makeDiag(
            "E_FN_DUP",
            `Duplicate function definition '${stmt.name}'.`,
            stmt.span,
            "Use a different function name."
          )
        );
      }
      fnNames.add(stmt.name);
      // Validate body with params + fn name (for recursion) as extra bindings
      validateBlockBindings(stmt.body, bindings, fnNames, [...stmt.params, stmt.name], diags, true, `function '${stmt.name}'`);
    } else if (stmt.kind === "LetStmt") {
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
      validateExprBindings(stmt.value, bindings, fnNames, diags);
    } else if (stmt.kind === "ExprStmt") {
      validateExprBindings(stmt.expr, bindings, fnNames, diags);
      if (stmt.target) {
        bindings.add(stmt.target.parts[0]);
      }
    } else if (stmt.kind === "ReturnStmt") {
      validateExprBindings(stmt.value, bindings, fnNames, diags);
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

/**
 * Validate bindings inside a block body (for, fn, match arm).
 */
function validateBlockBindings(
  body: AST.Stmt[],
  parentBindings: Set<string>,
  parentFnNames: Set<string>,
  extraBindings: string[],
  diags: Diagnostic[],
  requireReturn: boolean,
  context: string
): void {
  const bindings = new Set(parentBindings);
  const fnNames = new Set(parentFnNames);
  for (const name of extraBindings) {
    bindings.add(name);
  }

  if (requireReturn) {
    const hasReturn = body.some((s) => s.kind === "ReturnStmt");
    if (!hasReturn) {
      diags.push(
        makeDiag(
          "E_NO_RETURN",
          `${context} must end with a return statement.`,
          body.length > 0 ? body[body.length - 1].span : undefined,
          "Add a 'return { ... }' statement at the end of the body."
        )
      );
    }
  }

  for (let i = 0; i < body.length; i++) {
    const s = body[i];
    if (s.kind === "ReturnStmt" && i < body.length - 1) {
      diags.push(
        makeDiag(
          "E_RETURN_NOT_LAST",
          `Return statement must be the last statement in ${context}.`,
          s.span,
          "Move any statements after return before it, or remove them."
        )
      );
    }
  }

  for (const stmt of body) {
    if (stmt.kind === "FnDecl") {
      if (fnNames.has(stmt.name) || bindings.has(stmt.name)) {
        diags.push(
          makeDiag(
            "E_FN_DUP",
            `Duplicate function definition '${stmt.name}'.`,
            stmt.span,
            "Use a different function name."
          )
        );
      }
      fnNames.add(stmt.name);
      validateBlockBindings(stmt.body, bindings, fnNames, [...stmt.params, stmt.name], diags, true, `function '${stmt.name}'`);
    } else if (stmt.kind === "LetStmt") {
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
      validateExprBindings(stmt.value, bindings, fnNames, diags);
    } else if (stmt.kind === "ExprStmt") {
      validateExprBindings(stmt.expr, bindings, fnNames, diags);
      if (stmt.target) {
        bindings.add(stmt.target.parts[0]);
      }
    } else if (stmt.kind === "ReturnStmt") {
      validateExprBindings(stmt.value, bindings, fnNames, diags);
    }
  }
}

function validateCapUsage(
  program: AST.Program,
  diags: Diagnostic[]
): void {
  const declaredCaps = new Set<string>();
  for (const h of program.headers) {
    if (h.kind === "CapDecl") {
      for (const p of h.capabilities.pairs) {
        declaredCaps.add(p.key);
      }
    }
  }

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
  fnNames: Set<string>,
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
        validateExprBindings(p.value, bindings, fnNames, diags);
      }
      break;
    case "ListExpr":
      for (const e of expr.elements) {
        validateExprBindings(e, bindings, fnNames, diags);
      }
      break;
    case "CallExpr":
    case "DoExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, fnNames, diags);
      }
      break;
    case "AssertExpr":
    case "CheckExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, fnNames, diags);
      }
      break;
    case "FnCallExpr":
      for (const p of expr.args.pairs) {
        validateExprBindings(p.value, bindings, fnNames, diags);
      }
      break;
    case "IfExpr":
      validateExprBindings(expr.cond, bindings, fnNames, diags);
      validateExprBindings(expr.then, bindings, fnNames, diags);
      validateExprBindings(expr.else, bindings, fnNames, diags);
      break;
    case "ForExpr":
      validateExprBindings(expr.list, bindings, fnNames, diags);
      validateBlockBindings(expr.body, bindings, fnNames, [expr.binding], diags, true, "for body");
      break;
    case "MatchExpr":
      validateExprBindings(expr.subject, bindings, fnNames, diags);
      validateBlockBindings(expr.okArm.body, bindings, fnNames, [expr.okArm.binding], diags, true, "match ok arm");
      validateBlockBindings(expr.errArm.body, bindings, fnNames, [expr.errArm.binding], diags, true, "match err arm");
      break;
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
    case "FnDecl":
      for (const bodyStmt of stmt.body) {
        visitExprInStmt(bodyStmt, visitor);
      }
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
    case "IfExpr":
      visitExpr(expr.cond, visitor);
      visitExpr(expr.then, visitor);
      visitExpr(expr.else, visitor);
      break;
    case "ForExpr":
      visitExpr(expr.list, visitor);
      for (const bodyStmt of expr.body) visitExprInStmt(bodyStmt, visitor);
      break;
    case "MatchExpr":
      visitExpr(expr.subject, visitor);
      for (const bodyStmt of expr.okArm.body) visitExprInStmt(bodyStmt, visitor);
      for (const bodyStmt of expr.errArm.body) visitExprInStmt(bodyStmt, visitor);
      break;
    default:
      break;
  }
}
