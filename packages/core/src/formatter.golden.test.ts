/**
 * Golden tests for formatter idempotence.
 *
 * Each fixture pair (foo.a0 + foo.formatted.a0) verifies:
 *   1. Formatting the input produces the golden output.
 *   2. Formatting the golden output again produces identical output (idempotence).
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parser.js";
import { format } from "./formatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "src", "__fixtures__", "formatter");

/** Read a fixture file, normalising line endings to LF. */
function readFixture(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
}

describe("Formatter Golden Tests", () => {
  const files = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith(".a0") && !f.endsWith(".formatted.a0"));

  for (const inputFile of files) {
    const name = inputFile.replace(".a0", "");

    it(`formats ${name} to golden output`, () => {
      const input = readFixture(path.join(fixturesDir, inputFile));
      const expected = readFixture(
        path.join(fixturesDir, `${name}.formatted.a0`)
      );
      const pr = parse(input, inputFile);
      assert.ok(pr.program, `Parse failed for ${inputFile}`);
      const formatted = format(pr.program);
      assert.equal(formatted, expected);
    });

    it(`${name} formatting is idempotent`, () => {
      const golden = readFixture(
        path.join(fixturesDir, `${name}.formatted.a0`)
      );
      const pr = parse(golden, `${name}.formatted.a0`);
      assert.ok(pr.program, `Parse failed for golden file ${name}.formatted.a0`);
      const formatted = format(pr.program);
      assert.equal(formatted, golden, "Formatting golden file should produce identical output");
    });
  }
});
