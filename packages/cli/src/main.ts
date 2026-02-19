#!/usr/bin/env node
/**
 * a0 - A0 Language CLI
 */
import { createRequire } from "node:module";
import { Command } from "commander";
import { runCheck } from "./cmd-check.js";
import { runRun } from "./cmd-run.js";
import { runFmt } from "./cmd-fmt.js";
import { runTrace } from "./cmd-trace.js";
import { runHelp, QUICKREF } from "./cmd-help.js";
import { runPolicy } from "./cmd-policy.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("a0")
  .description("A0: Agent-Optimized General-Purpose CLI Interpreter")
  .version(pkg.version)
  .addHelpText("after", "\n" + QUICKREF);

program
  .command("check")
  .description("Static validation without execution")
  .argument("<file>", "A0 source file to check")
  .option("--pretty", "Human-readable output", false)
  .option("--stable-json", "Stable machine-readable success output", false)
  .option("--debug-parse", "Show raw parser internals on parse errors", false)
  .action(async (file: string, opts: { pretty?: boolean; stableJson?: boolean; debugParse?: boolean }) => {
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
  .option("--debug-parse", "Show raw parser internals on parse errors", false)
  .option("--unsafe-allow-all", "[DEV ONLY] Bypass all capability restrictions", false)
  .action(async (file: string, opts: { trace?: string; evidence?: string; pretty?: boolean; debugParse?: boolean; unsafeAllowAll?: boolean }) => {
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

program
  .command("policy")
  .description("Display effective capability policy and resolution source")
  .option("--json", "Output as JSON", false)
  .action(async (opts: { json?: boolean }) => {
    const code = await runPolicy(opts);
    process.exit(code);
  });

program
  .command("help")
  .description("Language reference — run 'a0 help <topic>' for details")
  .argument("[topic]", "Topic: syntax, types, tools, stdlib, caps, budget, flow, diagnostics, examples")
  .option("--index", "For stdlib topic, print a compact full stdlib index", false)
  .action((topic: string | undefined, opts: { index?: boolean }) => {
    runHelp(topic, opts);
  });

// Reject unknown commands before Commander parses (prevents --help from masking exit code)
const knownCommands = new Set(["check", "run", "fmt", "trace", "policy", "help"]);
const userArgs = process.argv.slice(2);
const firstPositional = userArgs.find((a) => !a.startsWith("-"));
if (firstPositional && !knownCommands.has(firstPositional)) {
  console.error(`Unknown command: ${firstPositional}`);
  process.exit(1);
}

program.parseAsync();
