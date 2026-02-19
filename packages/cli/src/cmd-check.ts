/**
 * a0 check - static validation command
 */
import * as fs from "node:fs";
import { parse, validate, formatDiagnostics, formatDiagnostic } from "@a0/core";

export async function runCheck(
  file: string,
  opts: { pretty?: boolean; stableJson?: boolean; debugParse?: boolean }
): Promise<number> {
  let source: string;
  try {
    source = fs.readFileSync(file, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(formatDiagnostic({ code: "E_IO", message: `Error reading file: ${msg}` }, !!opts.pretty));
    return 4;
  }

  const parseResult = parse(source, file, { debugParse: !!opts.debugParse });
  if (parseResult.diagnostics.length > 0) {
    console.error(formatDiagnostics(parseResult.diagnostics, !!opts.pretty));
    return 2;
  }

  if (!parseResult.program) {
    console.error("Parse produced no program.");
    return 2;
  }

  const validationDiags = validate(parseResult.program);
  if (validationDiags.length > 0) {
    console.error(formatDiagnostics(validationDiags, !!opts.pretty));
    return 2;
  }

  if (opts.pretty) {
    console.log("No errors found.");
  } else if (opts.stableJson) {
    console.log("{\"ok\":true,\"errors\":[]}");
  } else {
    console.log("[]");
  }
  return 0;
}
