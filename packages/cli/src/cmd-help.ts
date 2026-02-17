/**
 * a0 help - progressive-discovery help system
 */
import { QUICKREF, TOPICS, TOPIC_LIST } from "./help-content.js";

export { QUICKREF };

export function runHelp(topic?: string): void {
  if (!topic) {
    console.log(QUICKREF);
    return;
  }

  const normalized = topic.toLowerCase().trim();

  if (normalized in TOPICS) {
    console.log(TOPICS[normalized]);
    return;
  }

  // Prefix matching: "diag" -> "diagnostics", "ex" -> "examples"
  const matches = TOPIC_LIST.filter((t) => t.startsWith(normalized));
  if (matches.length === 1) {
    console.log(TOPICS[matches[0]]);
    return;
  }

  console.error(`Unknown help topic: "${topic}"`);
  console.error(`Available topics: ${TOPIC_LIST.join(", ")}`);
  console.error(`Usage: a0 help <topic>`);
  process.exitCode = 1;
}
