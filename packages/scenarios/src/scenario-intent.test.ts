import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { validateScenarioConfig } from "./types.js";
import type { ScenarioConfig } from "./types.js";
import { discoverScenarios, getScenarioRoots } from "./discovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

function loadScenarioConfigs(): Array<{ id: string; config: ScenarioConfig }> {
  const roots = getScenarioRoots(REPO_ROOT);
  const discovered = discoverScenarios(roots);
  return discovered.map((scenario) => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(scenario.dir, "scenario.json"), "utf-8")
    );
    return {
      id: scenario.id,
      config: validateScenarioConfig(raw, scenario.id),
    };
  });
}

const NON_EXIT_ASSERTION_KEYS: Array<keyof ScenarioConfig["expect"]> = [
  "stdoutJson",
  "stdoutJsonSubset",
  "stdoutText",
  "stdoutContains",
  "stdoutContainsAll",
  "stdoutRegex",
  "stderrJson",
  "stderrJsonSubset",
  "stderrText",
  "stderrContains",
  "stderrContainsAll",
  "stderrRegex",
  "evidenceJson",
  "evidenceJsonSubset",
  "traceSummary",
  "traceSummarySubset",
  "files",
];

function hasNonExitAssertions(config: ScenarioConfig): boolean {
  return NON_EXIT_ASSERTION_KEYS.some((key) => config.expect[key] !== undefined);
}

function jsonExpectationHasDiagnosticCode(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((item) => jsonExpectationHasDiagnosticCode(item));
  }
  if (typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  if (
    typeof record["code"] === "string" &&
    /^E_[A-Z0-9_]+$/.test(record["code"])
  ) {
    return true;
  }

  return Object.values(record).some((item) =>
    jsonExpectationHasDiagnosticCode(item)
  );
}

function hasDiagnosticCodeAssertion(config: ScenarioConfig): boolean {
  const codePattern = /\bE_[A-Z0-9_]+\b/;
  if (
    config.expect.stderrContains !== undefined &&
    codePattern.test(config.expect.stderrContains)
  ) {
    return true;
  }
  if (
    config.expect.stderrRegex !== undefined &&
    codePattern.test(config.expect.stderrRegex)
  ) {
    return true;
  }
  if (
    config.expect.stderrText !== undefined &&
    codePattern.test(config.expect.stderrText)
  ) {
    return true;
  }
  if (
    config.expect.stderrContainsAll !== undefined &&
    config.expect.stderrContainsAll.some((text) => codePattern.test(text))
  ) {
    return true;
  }
  if (
    config.expect.stderrJson !== undefined &&
    jsonExpectationHasDiagnosticCode(config.expect.stderrJson)
  ) {
    return true;
  }
  if (
    config.expect.stderrJsonSubset !== undefined &&
    jsonExpectationHasDiagnosticCode(config.expect.stderrJsonSubset)
  ) {
    return true;
  }
  return false;
}

function hasAnyStderrAssertion(config: ScenarioConfig): boolean {
  return (
    config.expect.stderrJson !== undefined ||
    config.expect.stderrJsonSubset !== undefined ||
    config.expect.stderrText !== undefined ||
    config.expect.stderrContains !== undefined ||
    config.expect.stderrContainsAll !== undefined ||
    config.expect.stderrRegex !== undefined
  );
}

function looksLikeJsonText(text: string | undefined): boolean {
  if (text === undefined) return false;
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function looksLikeOrderedSnapshotRegex(pattern: string | undefined): boolean {
  if (pattern === undefined) return false;
  const glueCount = (pattern.match(/\[\\s\\S\]\*/g) ?? []).length;
  const hasLookahead = pattern.includes("(?=");
  return glueCount >= 5 && !hasLookahead;
}

function looksLikeMegaLookaheadSnapshotRegex(pattern: string | undefined): boolean {
  if (pattern === undefined) return false;
  const lookaheadCount = (pattern.match(/\(\?=/g) ?? []).length;
  const glueCount = (pattern.match(/\[\\s\\S\]\*/g) ?? []).length;
  return lookaheadCount >= 5 && glueCount >= 1;
}

function containsExactSpanCoordinates(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsExactSpanCoordinates(item));
  }
  if (typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const span = record["span"];
  if (
    span !== null &&
    typeof span === "object" &&
    !Array.isArray(span) &&
    typeof (span as Record<string, unknown>)["startLine"] === "number" &&
    typeof (span as Record<string, unknown>)["startCol"] === "number" &&
    typeof (span as Record<string, unknown>)["endLine"] === "number" &&
    typeof (span as Record<string, unknown>)["endCol"] === "number"
  ) {
    return true;
  }

  return Object.values(record).some((item) => containsExactSpanCoordinates(item));
}

describe("scenario intent guardrails", () => {
  const loaded = loadScenarioConfigs();

  it("requires assertions beyond exitCode", () => {
    const weak = loaded
      .filter(({ config }) => !hasNonExitAssertions(config))
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      weak,
      [],
      "Scenarios must assert behavior, not only process status. Weak scenarios: " +
        weak.join(", ")
    );
  });

  it("rejects placeholder stderrContains checks", () => {
    const placeholders = loaded
      .filter(
        ({ config }) =>
          config.expect.stderrContains?.trim() === "E_" ||
          config.expect.stderrContainsAll?.some((text) => text.trim() === "E_") ===
            true
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      placeholders,
      [],
      "Use a specific diagnostic code or structured JSON assertion instead of placeholder stderr contains checks ('E_'). Offenders: " +
        placeholders.join(", ")
    );
  });

  it("requires capture flags to be asserted", () => {
    const missingEvidence = loaded
      .filter(
        ({ config }) =>
          config.capture?.evidence === true &&
          config.expect.evidenceJson === undefined &&
          config.expect.evidenceJsonSubset === undefined
      )
      .map(({ id }) => id)
      .sort();

    const missingTrace = loaded
      .filter(
        ({ config }) =>
          config.capture?.trace === true &&
          config.expect.traceSummary === undefined &&
          config.expect.traceSummarySubset === undefined
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      missingEvidence,
      [],
      "Scenarios with capture.evidence must assert evidenceJson or evidenceJsonSubset. Missing: " +
        missingEvidence.join(", ")
    );
    assert.deepEqual(
      missingTrace,
      [],
      "Scenarios with capture.trace must assert traceSummary or traceSummarySubset. Missing: " +
        missingTrace.join(", ")
    );
  });

  it("requires run/check/fmt failures to assert a diagnostic code", () => {
    const commandSet = new Set(["run", "check", "fmt"]);
    const offenders = loaded
      .filter(({ config }) => {
        const command = config.cmd[0];
        return (
          commandSet.has(command) &&
          config.expect.exitCode !== 0 &&
          hasAnyStderrAssertion(config) &&
          !hasDiagnosticCodeAssertion(config)
        );
      })
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Error scenarios for run/check/fmt should assert stable diagnostic codes (E_*), not only message wording. Offenders: " +
        offenders.join(", ")
    );
  });

  it("rejects JSON snapshots encoded as plain text unless --stable-json is used", () => {
    const offenders = loaded
      .filter(({ config }) => {
        if (config.cmd.includes("--stable-json")) return false;
        return (
          looksLikeJsonText(config.expect.stdoutText) ||
          looksLikeJsonText(config.expect.stderrText)
        );
      })
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Prefer stdoutJson/stderrJson assertions over raw JSON text snapshots unless the scenario is explicitly testing --stable-json. Offenders: " +
        offenders.join(", ")
    );
  });

  it("rejects exact stdoutText snapshots for successful trace command output", () => {
    const offenders = loaded
      .filter(
        ({ config }) =>
          config.cmd[0] === "trace" &&
          config.expect.exitCode === 0 &&
          config.expect.stdoutText !== undefined
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Trace output contains dynamic fields (for example duration); assert with stdoutRegex or structured summaries instead of exact stdoutText. Offenders: " +
        offenders.join(", ")
    );
  });

  it("rejects ordered mega-regex snapshots for text output", () => {
    const offenders = loaded
      .filter(
        ({ config }) =>
          looksLikeOrderedSnapshotRegex(config.expect.stdoutRegex) ||
          looksLikeOrderedSnapshotRegex(config.expect.stderrRegex) ||
          looksLikeMegaLookaheadSnapshotRegex(config.expect.stdoutRegex) ||
          looksLikeMegaLookaheadSnapshotRegex(config.expect.stderrRegex)
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Use lightweight regex assertions for one property at a time and combine them with *ContainsAll checks; avoid mega-regex snapshots that mirror renderer layout. Offenders: " +
        offenders.join(", ")
    );
  });

  it("rejects exact evidence span snapshots in evidenceJson assertions", () => {
    const offenders = loaded
      .filter(
        ({ config }) =>
          config.expect.evidenceJson !== undefined &&
          containsExactSpanCoordinates(config.expect.evidenceJson)
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Prefer evidenceJsonSubset with stable fields (kind/ok/msg and optional span.file) instead of exact span coordinate snapshots. Offenders: " +
        offenders.join(", ")
    );
  });

  it("rejects exact traceSummary snapshots that pin totalEvents", () => {
    const offenders = loaded
      .filter(
        ({ config }) =>
          config.expect.traceSummary !== undefined &&
          config.expect.traceSummary.totalEvents !== undefined
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      offenders,
      [],
      "Prefer traceSummarySubset for intent checks; exact total event counts are instrumentation-coupled. Offenders: " +
        offenders.join(", ")
    );
  });
});
