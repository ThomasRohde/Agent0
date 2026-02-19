/**
 * a0 run - execute A0 programs
 */
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import {
  parse,
  validate,
  execute,
  A0RuntimeError,
  formatDiagnostics,
  formatDiagnostic,
  loadPolicy,
  buildAllowedCaps,
} from "@a0/core";
import type { TraceEvent, Evidence } from "@a0/core";
import { registerBuiltinTools, getAllTools } from "@a0/tools";
import { getStdlibFns } from "@a0/std";

class CliIoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliIoError";
  }
}

export async function runRun(
  file: string,
  opts: { trace?: string; evidence?: string; pretty?: boolean; unsafeAllowAll?: boolean; debugParse?: boolean }
): Promise<number> {
  const pretty = !!opts.pretty;
  const emitCliError = (code: string, message: string): void => {
    if (pretty) {
      console.error(formatDiagnostic({ code, message }, true));
      return;
    }
    console.error(formatDiagnostic({ code, message }, false));
  };

  const writeEvidenceFile = (records: Evidence[]): number | null => {
    if (!opts.evidence) return null;
    try {
      fs.writeFileSync(opts.evidence, JSON.stringify(records, null, 2));
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitCliError("E_IO", `Error writing evidence file: ${msg}`);
      return 4;
    }
  };

  // Read source
  let source: string;
  try {
    if (file === "-") {
      source = fs.readFileSync(0, "utf-8");
    } else {
      source = fs.readFileSync(file, "utf-8");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emitCliError("E_IO", `Error reading file: ${msg}`);
    return 4;
  }

  // Parse
  const parseResult = parse(source, file, { debugParse: !!opts.debugParse });

  if (parseResult.diagnostics.length > 0) {
    console.error(formatDiagnostics(parseResult.diagnostics, pretty));
    return 2;
  }

  if (!parseResult.program) {
    console.error(pretty
      ? "error: Parse produced no program."
      : formatDiagnostic({ code: "E_PARSE", message: "Parse produced no program." }, false));
    return 2;
  }

  // Validate
  const validationDiags = validate(parseResult.program);
  if (validationDiags.length > 0) {
    console.error(formatDiagnostics(validationDiags, pretty));
    return 2;
  }

  // Load policy and build capability set
  const policy = loadPolicy();
  const allowedCaps = buildAllowedCaps(policy, !!opts.unsafeAllowAll);

  // Register tools
  registerBuiltinTools();
  const tools = getAllTools();
  const stdlib = getStdlibFns();
  const runId = crypto.randomUUID();

  // Trace setup
  let traceFd: number | null = null;

  if (opts.trace) {
    try {
      traceFd = fs.openSync(opts.trace, "w");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitCliError("E_IO", `Error opening trace file: ${msg}`);
      return 4;
    }
  }

  const traceHandler =
    traceFd !== null
      ? (event: TraceEvent) => {
          try {
            fs.writeSync(traceFd, JSON.stringify(event) + "\n");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new CliIoError(`Error writing trace file: ${msg}`);
          }
        }
      : undefined;

  // Execute
  try {
    const result = await execute(parseResult.program, {
      allowedCapabilities: allowedCaps,
      tools,
      stdlib,
      trace: traceHandler,
      runId,
    });

    // Write evidence (including empty list) when requested
    const evidenceWriteCode = writeEvidenceFile(result.evidence);
    if (evidenceWriteCode !== null) {
      return evidenceWriteCode;
    }

    // Output result
    console.log(JSON.stringify(result.value, null, 2));

    // Check for failed evidence
    const anyFailed = result.evidence.some((ev: Evidence) => !ev.ok);
    if (anyFailed) return 5;

    return 0;
  } catch (e) {
    if (e instanceof CliIoError) {
      const evidenceWriteCode = writeEvidenceFile([]);
      if (evidenceWriteCode !== null) {
        return evidenceWriteCode;
      }
      emitCliError("E_IO", e.message);
      return 4;
    }

    if (e instanceof A0RuntimeError) {
      const evidenceWriteCode = writeEvidenceFile(e.evidence ?? []);
      if (evidenceWriteCode !== null) {
        return evidenceWriteCode;
      }

      if (pretty) {
        console.error(formatDiagnostic({ code: e.code, message: e.message, span: e.span }, true));
      } else {
        console.error(
          JSON.stringify({
            code: e.code,
            message: e.message,
            span: e.span,
            details: e.details,
          })
        );
      }
      if (e.code === "E_CAP_DENIED") return 3;
      if (e.code === "E_ASSERT") return 5;
      return 4;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const evidenceWriteCode = writeEvidenceFile([]);
    if (evidenceWriteCode !== null) {
      return evidenceWriteCode;
    }
    if (pretty) {
      console.error(formatDiagnostic({ code: "E_RUNTIME", message: msg }, true));
    } else {
      console.error(formatDiagnostic({ code: "E_RUNTIME", message: msg }, false));
    }
    return 4;
  } finally {
    if (traceFd !== null) {
      try {
        fs.closeSync(traceFd);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emitCliError("E_IO", `Error closing trace file: ${msg}`);
        return 4;
      }
    }
  }
}
