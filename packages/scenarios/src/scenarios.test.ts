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
import type { ScenarioConfig, FileAssertion } from "./types.js";
import { parseTraceJsonl, computeTraceSummary } from "./normalize.js";

// ---------------------------------------------------------------------------
// Path resolution (ESM-compatible)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, "../../cli/dist/main.js");
const REPO_ROOT = path.resolve(__dirname, "../../..");

// ---------------------------------------------------------------------------
// Scenario discovery
// ---------------------------------------------------------------------------
interface DiscoveredScenario {
  id: string;
  dir: string;
  relPath: string;
}

function discoverScenarios(): DiscoveredScenario[] {
  const roots = [
    path.join(REPO_ROOT, "scenarios"),
    path.join(REPO_ROOT, "packages", "scenarios", "scenarios"),
  ];

  const seen = new Map<string, DiscoveredScenario>();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walkForScenarios(root, root, seen);
  }

  return [...seen.values()].sort((a, b) =>
    a.relPath.localeCompare(b.relPath)
  );
}

function walkForScenarios(
  dir: string,
  root: string,
  seen: Map<string, DiscoveredScenario>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Check if this directory contains scenario.json
      const scenarioFile = path.join(fullPath, "scenario.json");
      if (fs.existsSync(scenarioFile)) {
        const id = entry.name;
        if (!seen.has(id)) {
          seen.set(id, {
            id,
            dir: fullPath,
            relPath: path.relative(root, fullPath),
          });
        }
      }
      // Recurse into subdirectories
      walkForScenarios(fullPath, root, seen);
    }
  }
}

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
// Main test suite
// ---------------------------------------------------------------------------
const scenarios = discoverScenarios();

describe("A0 CLI Scenarios", () => {
  if (scenarios.length === 0) {
    it("should have at least one scenario", () => {
      assert.fail("No scenario folders found");
    });
    return;
  }

  for (const scenario of scenarios) {
    it(`scenario: ${scenario.id}`, async () => {
      // 1. Load & validate
      const scenarioJsonPath = path.join(scenario.dir, "scenario.json");
      const raw = JSON.parse(fs.readFileSync(scenarioJsonPath, "utf-8"));
      const config = validateScenarioConfig(raw, scenario.id);

      // 2. Setup temp dirs
      const workDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `a0-scenario-${scenario.id}-`)
      );
      const homeDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `a0-scenario-home-${scenario.id}-`)
      );

      try {
        // 3. Copy .a0 files from scenario folder into workDir
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

        // Copy setup/ contents recursively into workDir if present
        const setupDir = path.join(scenario.dir, "setup");
        if (fs.existsSync(setupDir)) {
          copyDirRecursive(setupDir, workDir);
        }

        // 4. Write policy
        if (config.policy) {
          fs.writeFileSync(
            path.join(workDir, ".a0policy.json"),
            JSON.stringify(config.policy)
          );
        }

        // 5. Build CLI args
        const args = [CLI_PATH, ...config.cmd];
        if (config.capture?.trace) {
          args.push("--trace", "trace.jsonl");
        }
        if (config.capture?.evidence) {
          args.push("--evidence", "evidence.json");
        }

        // 6. Execute subprocess
        const result = await runCli(args, workDir, homeDir, config);

        // 7. Validate expectations
        // Exit code
        assert.strictEqual(
          result.exitCode,
          config.expect.exitCode,
          `Exit code mismatch for scenario '${scenario.id}'.\n` +
            `stdout: ${result.stdout}\n` +
            `stderr: ${result.stderr}`
        );

        // stdoutText
        if (config.expect.stdoutText !== undefined) {
          assert.strictEqual(
            normalizeLF(result.stdout).trimEnd(),
            normalizeLF(config.expect.stdoutText).trimEnd(),
            `stdoutText mismatch for scenario '${scenario.id}'`
          );
        }

        // stdoutJson
        if (config.expect.stdoutJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stdout);
          } catch {
            assert.fail(
              `Failed to parse stdout as JSON for scenario '${scenario.id}': ${result.stdout}`
            );
          }
          assert.deepStrictEqual(
            parsed,
            config.expect.stdoutJson,
            `stdoutJson mismatch for scenario '${scenario.id}'`
          );
        }

        // stderrText
        if (config.expect.stderrText !== undefined) {
          assert.strictEqual(
            normalizeLF(result.stderr).trimEnd(),
            normalizeLF(config.expect.stderrText).trimEnd(),
            `stderrText mismatch for scenario '${scenario.id}'`
          );
        }

        // stderrJson
        if (config.expect.stderrJson !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.stderr);
          } catch {
            assert.fail(
              `Failed to parse stderr as JSON for scenario '${scenario.id}': ${result.stderr}`
            );
          }
          assert.deepStrictEqual(
            parsed,
            config.expect.stderrJson,
            `stderrJson mismatch for scenario '${scenario.id}'`
          );
        }

        // stderrContains
        if (config.expect.stderrContains !== undefined) {
          assert.ok(
            result.stderr.includes(config.expect.stderrContains),
            `stderr does not contain '${config.expect.stderrContains}' for scenario '${scenario.id}'.\nActual stderr: ${result.stderr}`
          );
        }

        // evidenceJson
        if (config.expect.evidenceJson !== undefined) {
          const evidencePath = path.join(workDir, "evidence.json");
          assert.ok(
            fs.existsSync(evidencePath),
            `evidence.json not found for scenario '${scenario.id}'`
          );
          const evidenceContent = fs.readFileSync(evidencePath, "utf-8");
          const parsed = JSON.parse(evidenceContent);
          assert.deepStrictEqual(
            parsed,
            config.expect.evidenceJson,
            `evidenceJson mismatch for scenario '${scenario.id}'`
          );
        }

        // traceSummary
        if (config.expect.traceSummary !== undefined) {
          const tracePath = path.join(workDir, "trace.jsonl");
          assert.ok(
            fs.existsSync(tracePath),
            `trace.jsonl not found for scenario '${scenario.id}'`
          );
          const traceContent = fs.readFileSync(tracePath, "utf-8");
          const events = parseTraceJsonl(traceContent);
          const summary = computeTraceSummary(events);
          assert.deepStrictEqual(
            summary,
            config.expect.traceSummary,
            `traceSummary mismatch for scenario '${scenario.id}'`
          );
        }

        // files
        if (config.expect.files) {
          for (const fa of config.expect.files) {
            const filePath = path.join(workDir, fa.path);
            assert.ok(
              fs.existsSync(filePath),
              `Expected file '${fa.path}' not found for scenario '${scenario.id}'`
            );

            if ("sha256" in fa) {
              const content = fs.readFileSync(filePath);
              const hash = crypto
                .createHash("sha256")
                .update(content)
                .digest("hex");
              assert.strictEqual(
                hash,
                (fa as { sha256: string }).sha256,
                `SHA-256 mismatch for file '${fa.path}' in scenario '${scenario.id}'`
              );
            } else if ("text" in fa) {
              const content = fs.readFileSync(filePath, "utf-8");
              assert.strictEqual(
                normalizeLF(content),
                normalizeLF((fa as { text: string }).text),
                `Text mismatch for file '${fa.path}' in scenario '${scenario.id}'`
              );
            } else if ("json" in fa) {
              const content = fs.readFileSync(filePath, "utf-8");
              const parsed = JSON.parse(content);
              assert.deepStrictEqual(
                parsed,
                (fa as { json: unknown }).json,
                `JSON mismatch for file '${fa.path}' in scenario '${scenario.id}'`
              );
            }
          }
        }
      } finally {
        // 8. Cleanup (unless A0_SCENARIO_KEEP_TMP is set)
        if (process.env.A0_SCENARIO_KEEP_TMP !== "1") {
          fs.rmSync(workDir, { recursive: true, force: true });
          fs.rmSync(homeDir, { recursive: true, force: true });
        }
      }
    });
  }
});
