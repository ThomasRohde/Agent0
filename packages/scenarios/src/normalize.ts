/**
 * Black-box trace JSONL parsing and summary computation.
 * No imports from @a0/core — implemented independently per the black-box rule.
 */

import type { TraceSummary } from "./types.js";

interface RawTraceEvent {
  ts?: string;
  runId?: string;
  event: string;
  data?: Record<string, unknown>;
}

const KNOWN_EVENTS = new Set([
  "run_start",
  "run_end",
  "stmt_start",
  "stmt_end",
  "tool_start",
  "tool_end",
  "evidence",
  "budget_exceeded",
  "for_start",
  "for_end",
  "fn_call_start",
  "fn_call_end",
  "match_start",
  "match_end",
  "map_start",
  "map_end",
]);

/**
 * Parse JSONL content into trace events, skipping malformed lines.
 */
export function parseTraceJsonl(content: string): RawTraceEvent[] {
  const events: RawTraceEvent[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof parsed["event"] === "string" &&
        KNOWN_EVENTS.has(parsed["event"])
      ) {
        events.push(parsed as unknown as RawTraceEvent);
      }
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

/**
 * Compute a TraceSummary from parsed trace events.
 * Strips volatile fields (runId, ts, durationMs, startTime, endTime).
 */
export function computeTraceSummary(events: RawTraceEvent[]): TraceSummary {
  const summary: TraceSummary = {
    totalEvents: events.length,
    toolInvocations: 0,
    toolsByName: {},
    evidenceCount: 0,
    failures: 0,
    budgetExceeded: 0,
  };

  let hasToolError = false;
  let hasEvidenceFailure = false;
  let hasRunError = false;

  for (const ev of events) {
    if (ev.event === "tool_start") {
      summary.toolInvocations++;
      const name = (ev.data?.["tool"] as string) ?? "unknown";
      summary.toolsByName[name] = (summary.toolsByName[name] ?? 0) + 1;
    }
    if (ev.event === "tool_end" && ev.data?.["outcome"] === "err") {
      summary.failures++;
      hasToolError = true;
    }
    if (ev.event === "run_end" && ev.data?.["error"]) {
      hasRunError = true;
    }
    if (ev.event === "evidence") {
      summary.evidenceCount++;
      if (ev.data?.["ok"] === false) {
        summary.failures++;
        hasEvidenceFailure = true;
      }
    }
    if (ev.event === "budget_exceeded") {
      summary.budgetExceeded++;
    }
  }

  // run_end error represents a failure root cause when not already counted
  if (hasRunError && !hasToolError && !hasEvidenceFailure) {
    summary.failures++;
  }

  return summary;
}
