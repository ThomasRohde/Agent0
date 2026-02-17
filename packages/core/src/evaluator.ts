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
export type TraceEventType = "run_start" | "run_end" | "stmt_start" | "stmt_end" | "tool_start" | "tool_end" | "evidence" | "budget_exceeded" | "for_start" | "for_end" | "fn_call_start" | "fn_call_end" | "match_start" | "match_end";

export interface TraceEvent {
  ts: string;
  runId: string;
  event: TraceEventType;
  span?: Span;
  data?: A0Record;
}

// --- Tool interface ---
export interface ToolDef {
  name: string;
  mode: "read" | "effect";
  capabilityId: string;
  inputSchema?: unknown;   // ZodSchema at runtime, core doesn't depend on zod
  outputSchema?: unknown;
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

// --- Budget ---
interface Budget {
  timeMs?: number;
  maxToolCalls?: number;
  maxBytesWritten?: number;
  maxIterations?: number;
}

interface BudgetTracker {
  toolCalls: number;
  bytesWritten: number;
  iterations: number;
  startMs: number;
}

function extractBudget(program: AST.Program): Budget {
  for (const h of program.headers) {
    if (h.kind === "BudgetDecl") {
      const budget: Budget = {};
      for (const p of h.budget.pairs) {
        if (p.key === "timeMs" && p.value.kind === "IntLiteral") {
          budget.timeMs = p.value.value;
        }
        if (p.key === "maxToolCalls" && p.value.kind === "IntLiteral") {
          budget.maxToolCalls = p.value.value;
        }
        if (p.key === "maxBytesWritten" && p.value.kind === "IntLiteral") {
          budget.maxBytesWritten = p.value.value;
        }
        if (p.key === "maxIterations" && p.value.kind === "IntLiteral") {
          budget.maxIterations = p.value.value;
        }
      }
      return budget;
    }
  }
  return {};
}

// --- Truthiness ---
export function isTruthy(v: A0Value): boolean {
  if (v === null || v === false || v === 0 || v === "") return false;
  return true;
}

// --- Environment ---
class Env {
  private bindings = new Map<string, A0Value>();
  private parent: Env | null;

  constructor(parent: Env | null = null) {
    this.parent = parent;
  }

  child(): Env {
    return new Env(this);
  }

  set(name: string, value: A0Value): void {
    this.bindings.set(name, value);
  }

  get(name: string): A0Value | undefined {
    const val = this.bindings.get(name);
    if (val !== undefined) return val;
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  has(name: string): boolean {
    if (this.bindings.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
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

  const runStartMs = Date.now();

  const emitTrace = (event: TraceEventType, span?: Span, data?: A0Record) => {
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

  const budget = extractBudget(program);
  const tracker: BudgetTracker = { toolCalls: 0, bytesWritten: 0, iterations: 0, startMs: Date.now() };

  emitTrace("run_start", program.span, {
    file: program.span.file,
    capabilities: requestedCaps as unknown as A0Value,
    ...(Object.keys(budget).length > 0 ? { budget: budget as unknown as A0Record } : {}),
  });

  const userFns = new Map<string, AST.FnDecl>();
  const result = await executeBlock(program.statements, env, options, evidence, emitTrace, budget, tracker, userFns);

  emitTrace("run_end", program.span, { durationMs: Date.now() - runStartMs });

  return { value: result, evidence, diagnostics };
}

/**
 * Execute a list of statements in a given scope. Returns the value from the ReturnStmt.
 */
async function executeBlock(
  stmts: AST.Stmt[],
  env: Env,
  options: ExecOptions,
  evidence: Evidence[],
  emitTrace: (event: TraceEventType, span?: Span, data?: A0Record) => void,
  budget: Budget,
  tracker: BudgetTracker,
  userFns: Map<string, AST.FnDecl>
): Promise<A0Value> {
  let result: A0Value = null;

  for (const stmt of stmts) {
    if (budget.timeMs !== undefined) {
      const elapsed = Date.now() - tracker.startMs;
      if (elapsed > budget.timeMs) {
        throw new A0RuntimeError(
          "E_BUDGET",
          `Budget exceeded: timeMs limit of ${budget.timeMs}ms exceeded (${elapsed}ms elapsed).`,
          stmt.span,
          { budget: "timeMs", limit: budget.timeMs, actual: elapsed }
        );
      }
    }

    emitTrace("stmt_start", stmt.span);

    if (stmt.kind === "LetStmt") {
      const val = await evalExpr(stmt.value, env, options, evidence, emitTrace, budget, tracker, userFns);
      env.set(stmt.name, val);
    } else if (stmt.kind === "ExprStmt") {
      const val = await evalExpr(stmt.expr, env, options, evidence, emitTrace, budget, tracker, userFns);
      if (stmt.target) {
        env.set(stmt.target.parts[0], val);
      }
    } else if (stmt.kind === "FnDecl") {
      userFns.set(stmt.name, stmt);
    } else if (stmt.kind === "ReturnStmt") {
      result = await evalExpr(stmt.value, env, options, evidence, emitTrace, budget, tracker, userFns);
      emitTrace("stmt_end", stmt.span);
      break;
    }

    emitTrace("stmt_end", stmt.span);
  }

  return result;
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
  emitTrace: (event: TraceEventType, span?: Span, data?: A0Record) => void,
  budget: Budget,
  tracker: BudgetTracker,
  userFns: Map<string, AST.FnDecl>
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
        rec[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace, budget, tracker, userFns);
      }
      return rec;
    }

    case "ListExpr": {
      const arr: A0Value[] = [];
      for (const e of expr.elements) {
        arr.push(await evalExpr(e, env, options, evidence, emitTrace, budget, tracker, userFns));
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
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace, budget, tracker, userFns);
      }

      // Validate input schema if present
      if (tool.inputSchema) {
        try {
          const schema = tool.inputSchema as { parse: (data: unknown) => unknown };
          schema.parse(args);
        } catch (e: unknown) {
          const zodError = e as { issues?: Array<{ path: (string|number)[]; message: string }> };
          const issues = zodError.issues ?? [];
          const msg = issues.map((i: { path: (string|number)[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join("; ");
          throw new A0RuntimeError(
            "E_TOOL_ARGS",
            `Invalid arguments for tool '${toolName}': ${msg || (e instanceof Error ? e.message : String(e))}`,
            expr.args.span,
            { tool: toolName }
          );
        }
      }

      // Budget: maxToolCalls check
      tracker.toolCalls++;
      if (budget.maxToolCalls !== undefined && tracker.toolCalls > budget.maxToolCalls) {
        throw new A0RuntimeError(
          "E_BUDGET",
          `Budget exceeded: maxToolCalls limit of ${budget.maxToolCalls} reached.`,
          expr.span,
          { budget: "maxToolCalls", limit: budget.maxToolCalls, actual: tracker.toolCalls }
        );
      }

      emitTrace("tool_start", expr.span, { tool: toolName, args, mode: tool.mode });
      const startMs = Date.now();

      try {
        const result = await tool.execute(args, options.signal);
        const durationMs = Date.now() - startMs;
        emitTrace("tool_end", expr.span, {
          tool: toolName,
          outcome: "ok",
          durationMs,
        });

        // Budget: maxBytesWritten check
        if (typeof result === "object" && result !== null && !Array.isArray(result)) {
          const rec = result as A0Record;
          if (typeof rec["bytes"] === "number") {
            tracker.bytesWritten += rec["bytes"] as number;
            if (budget.maxBytesWritten !== undefined && tracker.bytesWritten > budget.maxBytesWritten) {
              throw new A0RuntimeError(
                "E_BUDGET",
                `Budget exceeded: maxBytesWritten limit of ${budget.maxBytesWritten} bytes exceeded (${tracker.bytesWritten} bytes written).`,
                expr.span,
                { budget: "maxBytesWritten", limit: budget.maxBytesWritten, actual: tracker.bytesWritten }
              );
            }
          }
        }

        return result;
      } catch (e) {
        if (e instanceof A0RuntimeError) {
          throw e;
        }
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
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace, budget, tracker, userFns);
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

      // Check user-defined functions first, then stdlib
      const userFn = userFns.get(fnName);
      if (userFn) {
        emitTrace("fn_call_start", expr.span, { fn: fnName });

        // Evaluate call arguments
        const args: A0Record = {};
        for (const p of expr.args.pairs) {
          args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace, budget, tracker, userFns);
        }

        // Create child scope with param bindings
        const fnEnv = env.child();
        for (const param of userFn.params) {
          fnEnv.set(param, args[param] ?? null);
        }

        const result = await executeBlock(userFn.body, fnEnv, options, evidence, emitTrace, budget, tracker, userFns);
        emitTrace("fn_call_end", expr.span, { fn: fnName });
        return result;
      }

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
        args[p.key] = await evalExpr(p.value, env, options, evidence, emitTrace, budget, tracker, userFns);
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

    case "IfExpr": {
      const condVal = await evalExpr(expr.cond, env, options, evidence, emitTrace, budget, tracker, userFns);
      if (isTruthy(condVal)) {
        return evalExpr(expr.then, env, options, evidence, emitTrace, budget, tracker, userFns);
      } else {
        return evalExpr(expr.else, env, options, evidence, emitTrace, budget, tracker, userFns);
      }
    }

    case "ForExpr": {
      const listVal = await evalExpr(expr.list, env, options, evidence, emitTrace, budget, tracker, userFns);
      if (!Array.isArray(listVal)) {
        throw new A0RuntimeError(
          "E_FOR_NOT_LIST",
          `for-in expression must evaluate to a list, got ${typeof listVal}.`,
          expr.list.span
        );
      }

      emitTrace("for_start", expr.span, { listLength: listVal.length, as: expr.binding });

      const results: A0Value[] = [];
      for (const item of listVal) {
        // Budget: maxIterations check
        tracker.iterations++;
        if (budget.maxIterations !== undefined && tracker.iterations > budget.maxIterations) {
          throw new A0RuntimeError(
            "E_BUDGET",
            `Budget exceeded: maxIterations limit of ${budget.maxIterations} reached.`,
            expr.span,
            { budget: "maxIterations", limit: budget.maxIterations, actual: tracker.iterations }
          );
        }

        const iterEnv = env.child();
        iterEnv.set(expr.binding, item);
        const iterResult = await executeBlock(expr.body, iterEnv, options, evidence, emitTrace, budget, tracker, userFns);
        results.push(iterResult);
      }

      emitTrace("for_end", expr.span, { iterations: listVal.length });
      return results;
    }

    case "MatchExpr": {
      const subject = await evalExpr(expr.subject, env, options, evidence, emitTrace, budget, tracker, userFns);
      if (subject === null || typeof subject !== "object" || Array.isArray(subject)) {
        throw new A0RuntimeError(
          "E_MATCH_NOT_RECORD",
          `match subject must be a record, got ${subject === null ? "null" : Array.isArray(subject) ? "list" : typeof subject}.`,
          expr.subject.span
        );
      }

      const rec = subject as A0Record;
      if ("ok" in rec) {
        emitTrace("match_start", expr.span, { arm: "ok" });
        const armEnv = env.child();
        armEnv.set(expr.okArm.binding, rec["ok"]);
        const result = await executeBlock(expr.okArm.body, armEnv, options, evidence, emitTrace, budget, tracker, userFns);
        emitTrace("match_end", expr.span, { arm: "ok" });
        return result;
      } else if ("err" in rec) {
        emitTrace("match_start", expr.span, { arm: "err" });
        const armEnv = env.child();
        armEnv.set(expr.errArm.binding, rec["err"]);
        const result = await executeBlock(expr.errArm.body, armEnv, options, evidence, emitTrace, budget, tracker, userFns);
        emitTrace("match_end", expr.span, { arm: "err" });
        return result;
      } else {
        throw new A0RuntimeError(
          "E_MATCH_NO_ARM",
          `match subject record has neither 'ok' nor 'err' key.`,
          expr.subject.span
        );
      }
    }
  }
}
