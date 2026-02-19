/**
 * Shared assertion helpers for scenario runner tests.
 */
import * as assert from "node:assert/strict";

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function findSubsetMismatch(
  actual: unknown,
  subset: unknown,
  path: string
): string | null {
  if (subset === null || typeof subset !== "object") {
    if (!Object.is(actual, subset)) {
      return `${path}: expected ${formatValue(subset)} but got ${formatValue(actual)}`;
    }
    return null;
  }

  if (Array.isArray(subset)) {
    if (!Array.isArray(actual)) {
      return `${path}: expected array but got ${typeName(actual)}`;
    }
    if (actual.length < subset.length) {
      return `${path}: expected at least ${subset.length} items but got ${actual.length}`;
    }
    for (let i = 0; i < subset.length; i++) {
      const mismatch = findSubsetMismatch(actual[i], subset[i], `${path}[${i}]`);
      if (mismatch) return mismatch;
    }
    return null;
  }

  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return `${path}: expected object but got ${typeName(actual)}`;
  }

  const actualRecord = actual as Record<string, unknown>;
  const subsetRecord = subset as Record<string, unknown>;
  for (const key of Object.keys(subsetRecord)) {
    if (!Object.prototype.hasOwnProperty.call(actualRecord, key)) {
      return `${path}.${key}: key missing`;
    }
    const mismatch = findSubsetMismatch(
      actualRecord[key],
      subsetRecord[key],
      `${path}.${key}`
    );
    if (mismatch) return mismatch;
  }
  return null;
}

export function assertJsonSubset(
  actual: unknown,
  subset: unknown,
  label: string
): void {
  const mismatch = findSubsetMismatch(actual, subset, "$");
  if (mismatch) {
    assert.fail(`${label}: JSON subset mismatch at ${mismatch}`);
  }
}

export function assertMatchesRegex(
  text: string,
  pattern: string,
  label: string
): void {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert.fail(`${label}: invalid regex '${pattern}': ${msg}`);
    return;
  }

  assert.ok(
    re.test(text),
    `${label}: text did not match regex '${pattern}'. Actual: ${text}`
  );
}
