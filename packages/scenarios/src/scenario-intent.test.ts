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
});
