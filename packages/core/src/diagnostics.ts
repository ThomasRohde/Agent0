/**
 * A0 Diagnostic types for parse/validation/runtime errors.
 */
import type { Span } from "./ast.js";

export interface Diagnostic {
  code: string;
  message: string;
  span?: Span;
  hint?: string;
}

export function makeDiag(
  code: string,
  message: string,
  span?: Span,
  hint?: string
): Diagnostic {
  return { code, message, span, hint };
}

export function formatDiagnostic(d: Diagnostic, pretty: boolean): string {
  if (!pretty) {
    return JSON.stringify(d);
  }
  const loc = d.span
    ? `${d.span.file}:${d.span.startLine}:${d.span.startCol}`
    : "<unknown>";
  let out = `error[${d.code}]: ${d.message}\n  --> ${loc}`;
  if (d.hint) {
    out += `\n  hint: ${d.hint}`;
  }
  return out;
}

export function formatDiagnostics(diags: Diagnostic[], pretty: boolean): string {
  if (!pretty) {
    return JSON.stringify(diags);
  }
  return diags.map((d) => formatDiagnostic(d, true)).join("\n\n");
}
