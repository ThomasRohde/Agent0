/**
 * A0 Evaluator - executes A0 programs step by step.
 */
import type * as AST from "./ast.js";
import type { Span } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { makeDiag } from "./diagnostics.js";

// --- Value types ---
export type A0Value =
  | null
  | boolean
  | number
  | string
  | A0Value[]
  | A0Record;

export type A0Record = { [key: string]: A0Value };

// --- Evidence ---
export interface Evidence {
  kind: "assert" | "check";
  ok: boolean;
  msg: string;
  details?: A0Record;
  span?: Span;
}

// --- Trace events ---
export interface TraceEvent {
  ts: string;
  runId: string;
  event: string;
  span?: Span;
  data?: A0Record;
}

// --- Tool interface ---
export interface ToolDef {
  name: string;
  mode: "read" | "effect";
  capabilityId: string;
  execute(args: A0Record, signal?: AbortSignal): Promise<A0Value>;
}

// --- Stdlib function interface ---
export interface StdlibFn {
  name: string;
  execute(args: A0Record): A0Value;
}

// --- Runtime error ---
export class A0RuntimeError extends Error {
  code: string;
  span?: Span;
  details?: A0Record;

  constructor(code: string, message: string, span?: Span, details?: A0Record) {
    super(message);
    this.name = "A0RuntimeError";
    this.code = code;
    this.span = span;
    this.details = details;
  }
}

// --- Execution context ---
export interface ExecOptions {
  allowedCapabilities: Set<string>;
  tools: Map<string, ToolDef>;
  stdlib: Map<string, StdlibFn>;
  trace?: (event: TraceEvent) => void;
  signal?: AbortSignal;
  runId: string;
}

export interface ExecResult {
  value: A0Value;
  evidence: Evidence[];
  diagnostics: Diagnostic[];
}

// --- Environment ---
class Env {
  private bindings = new Map<string, A0Value>();

  set(name: string, value: A0Value): void {
    this.bindings.set(name, value);
  }

  get(name: string): A0Value | undefined {
    return this.bindings.get(name);
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }
}

// --- Evaluator ---
export async function execute(
  program: AST.Program,
  options: ExecOptions
): Promise<ExecResult> {
  const env = new Env();
  const evidence: Evidence[] = [];
  const diagnostics: Diagnostic[] = [];

  const emitTrace = (event: string, span?: Span, data?: A0Record) => {
    if (options.trace) {
      options.trace({
        ts: new Date().toISOString(),
        runId: options.runId,
        event,
        span,
        data,
      });
    }
  };

  // Validate capabilities
  const requestedCaps = extractCapabilities(program);
  for (const cap of requestedCaps) {
    if (!options.allowedCapabilities.has(cap)) {
      throw new A0RuntimeError(
        "E_CAP_DENIED",
        `Capability '${cap}' is not allowed by policy.`,
        program.headers.find((h) => h.kind === "CapDecl")?.span,
        { capability: cap }
      );
    }
  }

  emitTrace("run_start", program.span, { file: program.span.file });

  let result: A0Value = null;

  for (const stmt of program.statements) {
    emitTrace("stmt_start", stmt.span);

    if (stmt.kind === "LetStmt") {
      const val = await evalExpr(stmt.value, env, options, evidence, emitTrace);
      env.set(stmt.name, val);
    } else if (stmt.kind === "ExprStmt") {
      const val = await evalExpr(stmt.expr, env, options, evidence, emitTrace);
      if (stmt.target) {
        env.set(stmt.target.parts[0], val);
      }
    } else if (stmt.kind === "ReturnStmt") {
      result = await evalExpr(stmt.value, env, options, evidence, emitTrace);
      emitTrace("stmt_end", stmt.span);
      break;
    }

    emitTrace("stmt_end", stmt.span);
  }

  emitTrace("run_end", program.span);

  return { value: result, evidence, diagnostics };
}

function extractCapabilities(program: AST.Program): string[] {
  const caps: string[] = [];
  for (const h of program.headers) {
    if (h.kind === "CapDecl") {
      for (const p of h.capabilities.pairs) {
        caps.push(p.key);
      }
    }
  }
  return caps;
}

async function evalExpr(
  expr: AST.Expr,
  env: Env,
  options: ExecOptions,
  evidence: Evidence[],
  emitTrace: (event: string, span?: Span, data?: A0Record) => void
): Promise<A0Value> {
  switch (expr.kind) {
    case "IntLiteral":
    case "FloatLiteral":
      return expr.value;
    case "BoolLiteral":
      return expr.value;
    case "StrLiteral":
      return expr.value;
    case "NullLiteral":
      return null;

    case "IdentPath": {
      const base = env.get(expr.parts[0]);
      if (base === undefined) {
        throw new A0RuntimeError(
          "E_UNBOUND",
          `Unbound variable '${expr.parts[0]}'.`,
          expr.span
        );
      }
      // Traverse path
      let val: A0Value = base;
      for (let i = 1; i < expr.parts.length; i++) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          val = (val as A0Record)[expr.parts[i]] ?? null;
        } else {
          throw new A0RuntimeError(
            "E_PATH",
            `Cannot access '${expr.parts[i]}' on non-record value.`,
            expr.span
          );
        }
      }
      return val;
    }

    case "RecordExpr": {
      const rec: A0Record = {};
      for (const p of expr.pairs) {
        rec[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace);
      }
      return rec;
    }

    case "ListExpr": {
      const arr: A0Value[] = [];
      for (const e of expr.elements) {
        arr.push(await evalExpr(e, env, options, evidence, emitTrace));
      }
      return arr;
    }

    case "CallExpr":
    case "DoExpr": {
      const toolName = expr.tool.parts.join(".");
      const tool = options.tools.get(toolName);
      if (!tool) {
        throw new A0RuntimeError(
          "E_UNKNOWN_TOOL",
          `Unknown tool '${toolName}'.`,
          expr.span
        );
      }

      // Enforce call? vs do semantics
      if (expr.kind === "CallExpr" && tool.mode === "effect") {
        throw new A0RuntimeError(
          "E_CALL_EFFECT",
          `Cannot use 'call?' with effectful tool '${toolName}'. Use 'do' instead.`,
          expr.span
        );
      }

      // Check capability
      if (!options.allowedCapabilities.has(tool.capabilityId)) {
        throw new A0RuntimeError(
          "E_CAP_DENIED",
          `Capability '${tool.capabilityId}' required by tool '${toolName}' is not allowed.`,
          expr.span,
          { capability: tool.capabilityId, tool: toolName }
        );
      }

      // Evaluate args
      const args: A0Record = {};
      for (const p of expr.args.pairs) {
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace);
      }

      emitTrace("tool_start", expr.span, { tool: toolName, args });
      const startMs = Date.now();

      try {
        const result = await tool.execute(args, options.signal);
        const durationMs = Date.now() - startMs;
        emitTrace("tool_end", expr.span, {
          tool: toolName,
          outcome: "ok",
          durationMs,
        });
        return result;
      } catch (e) {
        const durationMs = Date.now() - startMs;
        const errMsg = e instanceof Error ? e.message : String(e);
        emitTrace("tool_end", expr.span, {
          tool: toolName,
          outcome: "err",
          durationMs,
          error: errMsg,
        });
        throw new A0RuntimeError(
          "E_TOOL",
          `Tool '${toolName}' failed: ${errMsg}`,
          expr.span,
          { tool: toolName }
        );
      }
    }

    case "AssertExpr":
    case "CheckExpr": {
      const args: A0Record = {};
      for (const p of expr.args.pairs) {
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace);
      }

      const ok = Boolean(args["that"]);
      const msg = typeof args["msg"] === "string" ? args["msg"] : "";
      const ev: Evidence = {
        kind: expr.kind === "AssertExpr" ? "assert" : "check",
        ok,
        msg,
        span: expr.span,
      };
      if (args["details"] && typeof args["details"] === "object" && !Array.isArray(args["details"])) {
        ev.details = args["details"] as A0Record;
      }

      evidence.push(ev);
      emitTrace("evidence", expr.span, ev as unknown as A0Record);

      if (!ok) {
        throw new A0RuntimeError(
          expr.kind === "AssertExpr" ? "E_ASSERT" : "E_CHECK",
          `${expr.kind === "AssertExpr" ? "Assertion" : "Check"} failed: ${msg}`,
          expr.span,
          { evidence: ev as unknown as A0Record }
        );
      }

      return ev as unknown as A0Value;
    }

    case "FnCallExpr": {
      const fnName = expr.name.parts.join(".");
      const fn = options.stdlib.get(fnName);
      if (!fn) {
        throw new A0RuntimeError(
          "E_UNKNOWN_FN",
          `Unknown function '${fnName}'.`,
          expr.span
        );
      }

      const args: A0Record = {};
      for (const p of expr.args.pairs) {
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace);
      }

      try {
        return fn.execute(args);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw new A0RuntimeError(
          "E_FN",
          `Function '${fnName}' failed: ${errMsg}`,
          expr.span,
          { fn: fnName }
        );
      }
    }
  }
}
