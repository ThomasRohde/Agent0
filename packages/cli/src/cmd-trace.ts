/**
 * a0 trace - trace summary command
 */
import * as fs from "node:fs";

interface TraceEvent {
  ts: string;
  runId: string;
  event: string;
  span?: unknown;
  data?: Record<string, unknown>;
}

interface TraceSummary {
  runId: string;
  totalEvents: number;
  toolInvocations: number;
  toolsByName: Record<string, number>;
  evidenceCount: number;
  failures: number;
  budgetExceeded: number;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
}

export async function runTrace(
  file: string,
  opts: { json?: boolean }
): Promise<number> {
  let content: string;
  try {
    content = fs.readFileSync(file, "utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error reading trace file: ${msg}`);
    return 4;
  }

  const lines = content.split("\n").filter((l) => l.trim());
  const events: TraceEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as TraceEvent);
    } catch {
      // skip malformed lines
    }
  }

  if (events.length === 0) {
    console.error("No valid trace events found.");
    return 4;
  }

  const summary: TraceSummary = {
    runId: events[0].runId,
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
    if (ev.event === "run_start") {
      summary.startTime = ev.ts;
    }
    if (ev.event === "run_end") {
      summary.endTime = ev.ts;
    }
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

  if (summary.startTime && summary.endTime) {
    summary.durationMs =
      new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
  }

  // run_end error represents a failure root cause when not already counted by
  // tool_end(err) or failed evidence events.
  if (hasRunError && !hasToolError && !hasEvidenceFailure) {
    summary.failures++;
  }

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Trace Summary`);
    console.log(`  Run ID:           ${summary.runId}`);
    console.log(`  Total events:     ${summary.totalEvents}`);
    console.log(`  Tool invocations: ${summary.toolInvocations}`);
    if (Object.keys(summary.toolsByName).length > 0) {
      console.log(`  Tools used:`);
      for (const [name, count] of Object.entries(summary.toolsByName)) {
        console.log(`    ${name}: ${count}`);
      }
    }
    console.log(`  Evidence events:  ${summary.evidenceCount}`);
    console.log(`  Failures:         ${summary.failures}`);
    console.log(`  Budget exceeded:  ${summary.budgetExceeded}`);
    if (summary.durationMs !== undefined) {
      console.log(`  Duration:         ${summary.durationMs}ms`);
    }
  }

  return 0;
}
