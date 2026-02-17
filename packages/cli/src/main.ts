#!/usr/bin/env node
/**
 * a0 - A0 Language CLI
 */
import { Command } from "commander";
import { runCheck } from "./cmd-check.js";
import { runRun } from "./cmd-run.js";
import { runFmt } from "./cmd-fmt.js";
import { runTrace } from "./cmd-trace.js";

const program = new Command();

program
  .name("a0")
  .description("A0: Agent-Optimized General-Purpose CLI Interpreter")
  .version("0.2.0");

program
  .command("check")
  .description("Static validation without execution")
  .argument("<file>", "A0 source file to check")
  .option("--pretty", "Human-readable output", false)
  .option("--json", "JSON output (default)", true)
  .action(async (file: string, opts: { pretty?: boolean }) => {
    const code = await runCheck(file, opts);
    process.exit(code);
  });

program
  .command("run")
  .description("Run an A0 program")
  .argument("<file>", "A0 source file to run (or - for stdin)")
  .option("--trace <path>", "Write JSONL trace to file")
  .option("--evidence <path>", "Write evidence JSON to file")
  .option("--pretty", "Human-readable error output", false)
  .option("--unsafe-allow-all", "[DEV ONLY] Bypass all capability restrictions", false)
  .action(async (file: string, opts: { trace?: string; evidence?: string; pretty?: boolean; unsafeAllowAll?: boolean }) => {
    const code = await runRun(file, opts);
    process.exit(code);
  });

program
  .command("fmt")
  .description("Canonical formatter")
  .argument("<file>", "A0 source file to format")
  .option("--write", "Overwrite file in place", false)
  .action(async (file: string, opts: { write?: boolean }) => {
    const code = await runFmt(file, opts);
    process.exit(code);
  });

program
  .command("trace")
  .description("Display trace summary")
  .argument("<file>", "JSONL trace file")
  .option("--json", "Output as JSON", false)
  .action(async (file: string, opts: { json?: boolean }) => {
    const code = await runTrace(file, opts);
    process.exit(code);
  });

program.parse();
