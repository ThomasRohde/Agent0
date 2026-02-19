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
  return [
    "A0 STDLIB INDEX",
    "===============",
    ...names.map((name) => `  ${name}`),
    "",
    `Total: ${names.length}`,
  ].join("\n");
}

export function runHelp(topic?: string, opts: { index?: boolean } = {}): void {
  if (opts.index) {
    if (!topic) {
      console.error("The --index flag is only supported with the stdlib topic.");
      console.error("Usage: a0 help stdlib --index");
      process.exitCode = 1;
      return;
    }

    const resolved = resolveTopic(topic);
    if (resolved !== "stdlib") {
      console.error("The --index flag is only supported with the stdlib topic.");
      console.error("Usage: a0 help stdlib --index");
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
  console.error(`Available topics: ${TOPIC_LIST.join(", ")}`);
  console.error(`Usage: a0 help <topic>`);
  process.exitCode = 1;
}
