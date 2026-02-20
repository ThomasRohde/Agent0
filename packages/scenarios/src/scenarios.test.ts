/**
 * Scenario-based black-box validation for the A0 CLI.
 *
 * Discovers scenario folders, spawns the CLI as a subprocess,
 * and validates exit codes / stdout / stderr / trace / evidence / file artifacts.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateScenarioConfig } from "./types.js";
import type { ScenarioConfig } from "./types.js";
import { parseTraceJsonl, computeTraceSummary } from "./normalize.js";
import { assertJsonSubset, assertMatchesRegex } from "./assertions.js";
import {
  applyScenarioTextFilter,
  discoverScenarios,
  getScenarioRoots,
  hasAnyRequestedTag,
  parseTagFilter,
} from "./discovery.js";
import type { DiscoveredScenario } from "./discovery.js";

// ---------------------------------------------------------------------------
// Path resolution (ESM-compatible)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, "../../cli/dist/main.js");
const REPO_ROOT = path.resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------
// File copy helper
// ---------------------------------------------------------------------------
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Subprocess runner
// ---------------------------------------------------------------------------
interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  workDir: string,
  homeDir: string,
  config: ScenarioConfig
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workDir,
      env: {
        HOME: homeDir,
        USERPROFILE: homeDir,
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        PATHEXT: process.env.PATHEXT,
      },
      timeout: config.timeoutMs ?? 10_000,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    if (config.stdin !== undefined) {
      child.stdin.write(config.stdin);
      child.stdin.end();
    }

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Normalize line endings
// ---------------------------------------------------------------------------
function normalizeLF(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------------------
// Config loading / scenario selection
// ---------------------------------------------------------------------------
const configCache = new Map<string, ScenarioConfig>();

function loadConfigForScenario(scenario: DiscoveredScenario): ScenarioConfig {
  const key = scenario.dir;
  const cached = configCache.get(key);
  if (cached) return cached;

  const scenarioJsonPath = path.join(scenario.dir, "scenario.json");
  const raw = JSON.parse(fs.readFileSync(scenarioJsonPath, "utf-8"));
  const config = validateScenarioConfig(raw, scenario.id);
  configCache.set(key, config);
  return config;
}

const roots = getScenarioRoots(REPO_ROOT, process.env.A0_SCENARIO_ROOT_EXTRA);
let scenarios = discoverScenarios(roots);
scenarios = applyScenarioTextFilter(scenarios, process.env.A0_SCENARIO_FILTER);

const requestedTags = parseTagFilter(process.env.A0_SCENARIO_TAGS);
if (requestedTags.length > 0) {
  scenarios = scenarios.filter((scenario) => {
    const config = loadConfigForScenario(scenario);
    return hasAnyRequestedTag(config.meta?.tags, requestedTags);
  });
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
describe("A0 CLI Scenarios", () => {
  if (scenarios.length === 0) {
    it("should have at least one scenario", () => {
      assert.fail(
        "No scenario folders found after discovery/filtering. " +
          `filter='${process.env.A0_SCENARIO_FILTER ?? ""}', ` +
          `tags='${process.env.A0_SCENARIO_TAGS ?? ""}'`
      );
    });
    return;
  }

  for (const scenario of scenarios) {
    it(`scenario: ${scenario.id}`, async () => {
      const config = loadConfigForScenario(scenario);

      const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `a0-scenario-${scenario.id}-`)
      );
      const homeDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `a0-scenario-home-${scenario.id}-`)
      );

      let passed = false;

      try {
        for (const entry of fs.readdirSync(scenario.dir)) {
          if (entry === "scenario.json" || entry === "setup") continue;
          const src = path.join(scenario.dir, entry);
          const dest = path.join(workDir, entry);
          const stat = fs.statSync(src);
          if (stat.isFile()) {
            fs.copyFileSync(src, dest);
          } else if (stat.isDirectory()) {
            copyDirRecursive(src, dest);
          }
        }

        const setupDir = path.join(scenario.dir, "setup");
        if (fs.existsSync(setupDir)) {
          copyDirRecursive(setupDir, workDir);
        }

        if (config.policy) {
          fs.writeFileSync(
            path.join(workDir, ".a0policy.json"),
            JSON.stringify(config.policy)
          );
        }

        const args = [CLI_PATH, ...config.cmd];
        if (config.capture?.trace) {
          args.push("--trace", "trace.jsonl");
        }
        if (config.capture?.evidence) {
          args.push("--evidence", "evidence.json");
        }

        const result = await runCli(args, workDir, homeDir, config);
        const runContext =
          `scenario='${scenario.id}' relPath='${scenario.relPath}'\n` +
          `args=${JSON.stringify(args)}\n` +
          `workDir='${workDir}' homeDir='${homeDir}'\n` +
          `stdout=${result.stdout}\n` +
          `stderr=${result.stderr}`;

        assert.strictEqual(
          result.exitCode,
          config.expect.exitCode,
          `Exit code mismatch for scenario '${scenario.id}'.\n${runContext}`
        );

        if (config.expect.stdoutText !== undefined) {
          assert.strictEqual(
            normalizeLF(result.stdout).trimEnd(),
            normalizeLF(config.expect.stdoutText).trimEnd(),
            `stdoutText mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stdoutContains !== undefined) {
          assert.ok(
            result.stdout.includes(config.expect.stdoutContains),
            `stdout does not contain '${config.expect.stdoutContains}' for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stdoutContainsAll !== undefined) {
          for (const token of config.expect.stdoutContainsAll) {
            assert.ok(
              result.stdout.includes(token),
              `stdout does not contain '${token}' for scenario '${scenario.id}'.\n${runContext}`
            );
          }
        }

        if (config.expect.stdoutRegex !== undefined) {
          assertMatchesRegex(
            result.stdout,
            config.expect.stdoutRegex,
            `stdoutRegex mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stdoutJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stdout);
          } catch {
            assert.fail(
              `Failed to parse stdout as JSON for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          assert.deepStrictEqual(
            parsed,
            config.expect.stdoutJson,
            `stdoutJson mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stdoutJsonSubset !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stdout);
          } catch {
            assert.fail(
              `Failed to parse stdout as JSON for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          assertJsonSubset(
            parsed,
            config.expect.stdoutJsonSubset,
            `stdoutJsonSubset mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stderrText !== undefined) {
          assert.strictEqual(
            normalizeLF(result.stderr).trimEnd(),
            normalizeLF(config.expect.stderrText).trimEnd(),
            `stderrText mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stderrJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stderr);
          } catch {
            assert.fail(
              `Failed to parse stderr as JSON for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          assert.deepStrictEqual(
            parsed,
            config.expect.stderrJson,
            `stderrJson mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stderrJsonSubset !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stderr);
          } catch {
            assert.fail(
              `Failed to parse stderr as JSON for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          assertJsonSubset(
            parsed,
            config.expect.stderrJsonSubset,
            `stderrJsonSubset mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stderrContains !== undefined) {
          assert.ok(
            result.stderr.includes(config.expect.stderrContains),
            `stderr does not contain '${config.expect.stderrContains}' for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (config.expect.stderrContainsAll !== undefined) {
          for (const token of config.expect.stderrContainsAll) {
            assert.ok(
              result.stderr.includes(token),
              `stderr does not contain '${token}' for scenario '${scenario.id}'.\n${runContext}`
            );
          }
        }

        if (config.expect.stderrRegex !== undefined) {
          assertMatchesRegex(
            result.stderr,
            config.expect.stderrRegex,
            `stderrRegex mismatch for scenario '${scenario.id}'.\n${runContext}`
          );
        }

        if (
          config.expect.evidenceJson !== undefined ||
          config.expect.evidenceJsonSubset !== undefined
        ) {
          const evidencePath = path.join(workDir, "evidence.json");
          assert.ok(
            fs.existsSync(evidencePath),
            `evidence.json not found for scenario '${scenario.id}'.\n${runContext}`
          );
          const evidenceContent = fs.readFileSync(evidencePath, "utf-8");
          const parsed = JSON.parse(evidenceContent);
          if (config.expect.evidenceJson !== undefined) {
            assert.deepStrictEqual(
              parsed,
              config.expect.evidenceJson,
              `evidenceJson mismatch for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          if (config.expect.evidenceJsonSubset !== undefined) {
            assertJsonSubset(
              parsed,
              config.expect.evidenceJsonSubset,
              `evidenceJsonSubset mismatch for scenario '${scenario.id}'.\n${runContext}`
            );
          }
        }

        if (
          config.expect.traceSummary !== undefined ||
          config.expect.traceSummarySubset !== undefined
        ) {
          const tracePath = path.join(workDir, "trace.jsonl");
          assert.ok(
            fs.existsSync(tracePath),
            `trace.jsonl not found for scenario '${scenario.id}'.\n${runContext}`
          );
          const traceContent = fs.readFileSync(tracePath, "utf-8");
          const events = parseTraceJsonl(traceContent);
          const summary = computeTraceSummary(events);
          if (config.expect.traceSummary !== undefined) {
            assert.deepStrictEqual(
              summary,
              config.expect.traceSummary,
              `traceSummary mismatch for scenario '${scenario.id}'.\n${runContext}`
            );
          }
          if (config.expect.traceSummarySubset !== undefined) {
            assertJsonSubset(
              summary,
              config.expect.traceSummarySubset,
              `traceSummarySubset mismatch for scenario '${scenario.id}'.\n${runContext}`
            );
          }
        }

        if (config.expect.files) {
          for (const fa of config.expect.files) {
            const filePath = path.join(workDir, fa.path);

            if ("absent" in fa) {
              assert.ok(
                !fs.existsSync(filePath),
                `Expected file '${fa.path}' to be absent for scenario '${scenario.id}'.\n${runContext}`
              );
              continue;
            }

            assert.ok(
              fs.existsSync(filePath),
              `Expected file '${fa.path}' not found for scenario '${scenario.id}'.\n${runContext}`
            );

            if ("sha256" in fa) {
              const content = fs.readFileSync(filePath);
              const hash = crypto
                .createHash("sha256")
                .update(content)
                .digest("hex");
              assert.strictEqual(
                hash,
                fa.sha256,
                `SHA-256 mismatch for file '${fa.path}' in scenario '${scenario.id}'.\n${runContext}`
              );
            } else if ("text" in fa) {
              const content = fs.readFileSync(filePath, "utf-8");
              assert.strictEqual(
                normalizeLF(content),
                normalizeLF(fa.text),
                `Text mismatch for file '${fa.path}' in scenario '${scenario.id}'.\n${runContext}`
              );
            } else if ("json" in fa) {
              const content = fs.readFileSync(filePath, "utf-8");
              const parsed = JSON.parse(content);
              assert.deepStrictEqual(
                parsed,
                fa.json,
                `JSON mismatch for file '${fa.path}' in scenario '${scenario.id}'.\n${runContext}`
              );
            }
          }
        }

        passed = true;
      } finally {
        const keepAllTmp = process.env.A0_SCENARIO_KEEP_TMP === "1";
        const keepTmpOnFail = process.env.A0_SCENARIO_KEEP_TMP_ON_FAIL === "1";
        const keepTmp = keepAllTmp || (keepTmpOnFail && !passed);
        if (!keepTmp) {
          fs.rmSync(workDir, { recursive: true, force: true });
          fs.rmSync(homeDir, { recursive: true, force: true });
        }
      }
    });
  }
});
