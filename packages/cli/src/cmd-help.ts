/**
 * a0 help - progressive-discovery help system
 */
import { QUICKREF, TOPICS, TOPIC_LIST } from "./help-content.js";
import { getStdlibFns } from "@a0/std";

export { QUICKREF };

function resolveTopic(topic: string): string | null {
  const normalized = topic.toLowerCase().trim();

  // Guard against prototype-chain keys like "constructor" or "__proto__".
  if (Object.prototype.hasOwnProperty.call(TOPICS, normalized)) {
    return normalized;
  }

  // Prefix matching: "diag" -> "diagnostics", "ex" -> "examples"
  const matches = TOPIC_LIST.filter((t) => t.startsWith(normalized));
  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function renderStdlibIndex(): string {
  const names = [...getStdlibFns().keys()].sort((a, b) => a.localeCompare(b));
  const numWidth = String(names.length).length;
  return [
    "A0 STDLIB INDEX",
    "===============",
    "",
    ...names.map((name, idx) => `  ${String(idx + 1).padStart(numWidth, " ")}. ${name}`),
    "",
    `Total: ${names.length}`,
    "",
    "More details:",
    "  a0 help stdlib",
  ].join("\n");
}

function renderUsage(commands: string[]): string {
  return ["Usage:", ...commands.map((command) => `  ${command}`)].join("\n");
}

function renderTopicList(): string {
  return ["Available topics:", ...TOPIC_LIST.map((name) => `  - ${name}`)].join("\n");
}

export function runHelp(topic?: string, opts: { index?: boolean } = {}): void {
  if (opts.index) {
    if (!topic) {
      console.error("The --index flag is only supported with the stdlib topic.");
      console.error(renderUsage(["a0 help stdlib --index"]));
      process.exitCode = 1;
      return;
    }

    const resolved = resolveTopic(topic);
    if (resolved !== "stdlib") {
      console.error("The --index flag is only supported with the stdlib topic.");
      console.error(renderUsage(["a0 help stdlib --index"]));
      process.exitCode = 1;
      return;
    }

    console.log(renderStdlibIndex());
    return;
  }

  if (!topic) {
    console.log(QUICKREF);
    return;
  }

  const resolved = resolveTopic(topic);
  if (resolved) {
    console.log(TOPICS[resolved]);
    return;
  }

  console.error(`Unknown help topic: "${topic}"`);
  console.error(renderTopicList());
  console.error(renderUsage(["a0 help <topic>", "a0 help stdlib --index"]));
  process.exitCode = 1;
}
