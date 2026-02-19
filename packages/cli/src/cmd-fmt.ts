/**
 * a0 fmt - canonical formatter command
 */
import * as fs from "node:fs";
import { parse, format, formatDiagnostics, formatDiagnostic } from "@a0/core";

export async function runFmt(
  file: string,
  opts: { write?: boolean }
): Promise<number> {
  let source: string;
  try {
    source = fs.readFileSync(file, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(formatDiagnostic({ code: "E_IO", message: `Error reading file: ${msg}` }, true));
    return 4;
  }

  const parseResult = parse(source, file);
  if (parseResult.diagnostics.length > 0) {
    console.error(formatDiagnostics(parseResult.diagnostics, true));
    return 2;
  }

  if (!parseResult.program) {
    console.error("Parse produced no program.");
    return 2;
  }

  // Warn if source contains comments (which will be stripped by formatting)
  const hasComments = source.split("\n").some((line) => {
    const withoutStrings = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    return withoutStrings.includes("#");
  });
  if (hasComments) {
    console.error("warning: formatting will remove comments from the output.");
  }

  const formatted = format(parseResult.program);

  try {
    if (opts.write) {
      fs.writeFileSync(file, formatted, "utf-8");
    } else {
      process.stdout.write(formatted);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(formatDiagnostic({ code: "E_IO", message: `Error writing file: ${msg}` }, true));
    return 4;
  }

  return 0;
}
