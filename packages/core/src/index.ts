/**
 * @a0/core - A0 Language Core
 */
export * from "./ast.js";
export * from "./diagnostics.js";
export { parse } from "./parser.js";
export type { ParseResult } from "./parser.js";
export { validate } from "./validator.js";
export { format } from "./formatter.js";
export {
  execute,
  A0RuntimeError,
} from "./evaluator.js";
export type {
  A0Value,
  A0Record,
  Evidence,
  TraceEvent,
  ToolDef,
  StdlibFn,
  ExecOptions,
  ExecResult,
} from "./evaluator.js";
export { loadPolicy, buildAllowedCaps } from "./capabilities.js";
export type { Policy } from "./capabilities.js";
