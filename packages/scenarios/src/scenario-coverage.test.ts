import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { validateScenarioConfig } from "./types.js";
import { discoverScenarios, getScenarioRoots } from "./discovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

function loadScenarioConfigs() {
  const roots = getScenarioRoots(REPO_ROOT);
  const discovered = discoverScenarios(roots);
  return discovered.map((scenario) => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(scenario.dir, "scenario.json"), "utf-8")
    );
    return { scenario, config: validateScenarioConfig(raw, scenario.id) };
  });
}

describe("scenario coverage guardrails", () => {
  const loaded = loadScenarioConfigs();
  const configs = loaded.map((x) => x.config);

  it("covers each expectation assertion mode at least once", () => {
    const expectFields = [
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
      "traceSummary",
      "files",
    ] as const;

    for (const field of expectFields) {
      const usage = configs.filter((cfg) => cfg.expect[field] !== undefined).length;
      assert.ok(usage > 0, `No scenarios use expect.${field}`);
    }
  });

  it("covers key scenario config knobs at least once", () => {
    const hasStdin = configs.some((cfg) => cfg.stdin !== undefined);
    const hasTimeout = configs.some((cfg) => cfg.timeoutMs !== undefined);
    const hasCaptureTrace = configs.some((cfg) => cfg.capture?.trace === true);
    const hasCaptureEvidence = configs.some((cfg) => cfg.capture?.evidence === true);
    const hasPolicyDeny = configs.some((cfg) => (cfg.policy?.deny?.length ?? 0) > 0);
    const hasPolicyLimits = configs.some((cfg) => cfg.policy?.limits !== undefined);
    const hasMetaTags = configs.some((cfg) => (cfg.meta?.tags?.length ?? 0) > 0);

    assert.equal(hasStdin, true, "No scenarios set 'stdin'");
    assert.equal(hasTimeout, true, "No scenarios set 'timeoutMs'");
    assert.equal(hasCaptureTrace, true, "No scenarios set 'capture.trace'");
    assert.equal(hasCaptureEvidence, true, "No scenarios set 'capture.evidence'");
    assert.equal(hasPolicyDeny, true, "No scenarios set 'policy.deny'");
    assert.equal(hasPolicyLimits, true, "No scenarios set 'policy.limits'");
    assert.equal(hasMetaTags, true, "No scenarios set 'meta.tags'");
  });

  it("covers all CLI commands and key flags in scenario command vectors", () => {
    const commands = new Set<string>();
    const flags = new Set<string>();

    for (const cfg of configs) {
      if (cfg.cmd.length === 0) continue;
      commands.add(cfg.cmd[0]);
      for (const token of cfg.cmd) {
        if (token.startsWith("--")) {
          flags.add(token);
        }
      }
    }

    const requiredCommands = ["check", "run", "fmt", "trace", "policy", "help"];
    const requiredFlags = [
      "--pretty",
      "--stable-json",
      "--debug-parse",
      "--unsafe-allow-all",
      "--write",
      "--json",
      "--index",
    ];

    for (const command of requiredCommands) {
      assert.ok(commands.has(command), `No scenarios invoke '${command}'`);
    }
    for (const flag of requiredFlags) {
      assert.ok(flags.has(flag), `No scenarios exercise '${flag}'`);
    }
  });
});
