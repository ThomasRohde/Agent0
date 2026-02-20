/**
 * @a0/core - A0 Language Core
 */
export * from "./ast.js";
export * from "./diagnostics.js";
export { parse } from "./parser.js";
export type { ParseResult, ParseOptions } from "./parser.js";
export { validate, KNOWN_CAPABILITIES, KNOWN_TOOLS } from "./validator.js";
export { format } from "./formatter.js";
export {
  execute,
  isTruthy,
  A0RuntimeError,
} from "./evaluator.js";
export type {
  A0Value,
  A0Record,
  Evidence,
  TraceEvent,
  TraceEventType,
  ToolDef,
  StdlibFn,
  ExecOptions,
  ExecResult,
} from "./evaluator.js";
export { loadPolicy, resolvePolicy, buildAllowedCaps } from "./capabilities.js";
export type { Policy, ResolvedPolicy } from "./capabilities.js";
