import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  applyScenarioTextFilter,
  discoverScenarios,
  getScenarioRoots,
  hasAnyRequestedTag,
  parseTagFilter,
} from "./discovery.js";

describe("scenario discovery helpers", () => {
  it("applies precedence by root order and de-duplicates by id", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a0-discovery-test-"));
    const rootA = path.join(tmpDir, "root-a");
    const rootB = path.join(tmpDir, "root-b");
    fs.mkdirSync(path.join(rootA, "same-id"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "same-id"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "other-id"), { recursive: true });
    fs.writeFileSync(path.join(rootA, "same-id", "scenario.json"), "{}");
    fs.writeFileSync(path.join(rootB, "same-id", "scenario.json"), "{}");
    fs.writeFileSync(path.join(rootB, "other-id", "scenario.json"), "{}");

    try {
      const discovered = discoverScenarios([rootA, rootB]);
      const ids = discovered.map((s) => s.id).sort();
      assert.deepEqual(ids, ["other-id", "same-id"]);
      const sameId = discovered.find((s) => s.id === "same-id");
      assert.ok(sameId);
      assert.equal(sameId?.root, rootA);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("filters discovered scenarios by id or relative path substring", () => {
    const list = [
      { id: "alpha", dir: "x", relPath: "group/alpha", root: "r" },
      { id: "beta", dir: "y", relPath: "other/beta", root: "r" },
    ];

    assert.deepEqual(
      applyScenarioTextFilter(list, "alp").map((s) => s.id),
      ["alpha"]
    );
    assert.deepEqual(
      applyScenarioTextFilter(list, "other").map((s) => s.id),
      ["beta"]
    );
    assert.deepEqual(applyScenarioTextFilter(list, "").map((s) => s.id), [
      "alpha",
      "beta",
    ]);
  });

  it("parses and matches tag filters", () => {
    const requested = parseTagFilter("smoke, cli, smoke");
    assert.deepEqual(requested, ["smoke", "cli"]);
    assert.equal(hasAnyRequestedTag(["core", "smoke"], requested), true);
    assert.equal(hasAnyRequestedTag(["core"], requested), false);
    assert.equal(hasAnyRequestedTag(undefined, requested), false);
    assert.equal(hasAnyRequestedTag(undefined, []), true);
  });

  it("parses additional scenario roots from env format", () => {
    const repoRoot = path.resolve("C:/repo");
    const extraA = "extra/scenarios";
    const extraB = path.resolve("D:/fixtures");
    const envValue = `${extraA}${path.delimiter}${extraB}${path.delimiter}${extraA}`;
    const roots = getScenarioRoots(repoRoot, envValue);

    assert.equal(roots[0], path.join(repoRoot, "scenarios"));
    assert.equal(roots[1], path.join(repoRoot, "packages", "scenarios", "scenarios"));
    assert.ok(roots.includes(path.resolve(repoRoot, extraA)));
    assert.ok(roots.includes(path.resolve(extraB)));

    const uniqueRoots = new Set(roots);
    assert.equal(uniqueRoots.size, roots.length);
  });
});
