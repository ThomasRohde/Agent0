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
  "stdoutRegex",
  "stderrJson",
  "stderrJsonSubset",
  "stderrText",
  "stderrContains",
  "stderrRegex",
  "evidenceJson",
  "traceSummary",
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
      .filter(({ config }) => config.expect.stderrContains?.trim() === "E_")
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      placeholders,
      [],
      "Use a specific diagnostic code or structured JSON assertion instead of stderrContains='E_'. Offenders: " +
        placeholders.join(", ")
    );
  });

  it("requires capture flags to be asserted", () => {
    const missingEvidence = loaded
      .filter(
        ({ config }) =>
          config.capture?.evidence === true &&
          config.expect.evidenceJson === undefined
      )
      .map(({ id }) => id)
      .sort();

    const missingTrace = loaded
      .filter(
        ({ config }) =>
          config.capture?.trace === true &&
          config.expect.traceSummary === undefined
      )
      .map(({ id }) => id)
      .sort();

    assert.deepEqual(
      missingEvidence,
      [],
      "Scenarios with capture.evidence must assert evidenceJson. Missing: " +
        missingEvidence.join(", ")
    );
    assert.deepEqual(
      missingTrace,
      [],
      "Scenarios with capture.trace must assert traceSummary. Missing: " +
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
});
