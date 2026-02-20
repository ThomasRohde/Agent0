/**
 * Scenario configuration types and runtime validation.
 */

export interface PolicyConfig {
  allow: string[];
  deny?: string[];
  limits?: Record<string, unknown>;
}

export interface CaptureConfig {
  trace?: boolean;
  evidence?: boolean;
}

export interface FileAssertionSha256 {
  path: string;
  sha256: string;
}

export interface FileAssertionText {
  path: string;
  text: string;
}

export interface FileAssertionJson {
  path: string;
  json: unknown;
}

export interface FileAssertionAbsent {
  path: string;
  absent: true;
}

export type FileAssertion =
  | FileAssertionSha256
  | FileAssertionText
  | FileAssertionJson
  | FileAssertionAbsent;

export interface TraceSummary {
  totalEvents: number;
  toolInvocations: number;
  toolsByName: Record<string, number>;
  evidenceCount: number;
  failures: number;
  budgetExceeded: number;
}

export interface Expectations {
  exitCode: number;
  stdoutJson?: unknown;
  stdoutJsonSubset?: unknown;
  stdoutText?: string;
  stdoutContains?: string;
  stdoutContainsAll?: string[];
  stdoutRegex?: string;
  stderrJson?: unknown;
  stderrJsonSubset?: unknown;
  stderrText?: string;
  stderrContains?: string;
  stderrContainsAll?: string[];
  stderrRegex?: string;
  evidenceJson?: unknown;
  traceSummary?: TraceSummary;
  files?: FileAssertion[];
}

export interface ScenarioMeta {
  tags?: string[];
}

export interface ScenarioConfig {
  cmd: string[];
  stdin?: string;
  policy?: PolicyConfig;
  capture?: CaptureConfig;
  meta?: ScenarioMeta;
  expect: Expectations;
  timeoutMs?: number;
}

/**
 * Fail-fast runtime validation of parsed scenario JSON.
 * Throws with a readable error including the scenario path and the invalid field.
 */
export function validateScenarioConfig(
  raw: unknown,
  scenarioPath: string
): ScenarioConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Scenario '${scenarioPath}': must be a JSON object`);
  }

  const obj = raw as Record<string, unknown>;

  // cmd: required, non-empty string array
  if (!Array.isArray(obj["cmd"]) || obj["cmd"].length === 0) {
    throw new Error(
      `Scenario '${scenarioPath}': 'cmd' is required and must be a non-empty string array`
    );
  }
  for (let i = 0; i < obj["cmd"].length; i++) {
    if (typeof obj["cmd"][i] !== "string") {
      throw new Error(
        `Scenario '${scenarioPath}': 'cmd[${i}]' must be a string`
      );
    }
  }

  // expect: required object with exitCode
  if (
    obj["expect"] === null ||
    typeof obj["expect"] !== "object" ||
    Array.isArray(obj["expect"])
  ) {
    throw new Error(
      `Scenario '${scenarioPath}': 'expect' is required and must be an object`
    );
  }
  const expect = obj["expect"] as Record<string, unknown>;

  if (typeof expect["exitCode"] !== "number") {
    throw new Error(
      `Scenario '${scenarioPath}': 'expect.exitCode' is required and must be a number`
    );
  }

  if (
    expect["stdoutJson"] !== undefined &&
    expect["stdoutJsonSubset"] !== undefined
  ) {
    throw new Error(
      `Scenario '${scenarioPath}': 'expect.stdoutJson' and 'expect.stdoutJsonSubset' are mutually exclusive`
    );
  }
  if (
    expect["stderrJson"] !== undefined &&
    expect["stderrJsonSubset"] !== undefined
  ) {
    throw new Error(
      `Scenario '${scenarioPath}': 'expect.stderrJson' and 'expect.stderrJsonSubset' are mutually exclusive`
    );
  }

  // Optional field type checks
  if (obj["stdin"] !== undefined && typeof obj["stdin"] !== "string") {
    throw new Error(
      `Scenario '${scenarioPath}': 'stdin' must be a string`
    );
  }

  if (obj["timeoutMs"] !== undefined && typeof obj["timeoutMs"] !== "number") {
    throw new Error(
      `Scenario '${scenarioPath}': 'timeoutMs' must be a number`
    );
  }

  if (obj["policy"] !== undefined) {
    const policy = obj["policy"] as Record<string, unknown>;
    if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
      throw new Error(
        `Scenario '${scenarioPath}': 'policy' must be an object`
      );
    }
    if (!Array.isArray(policy["allow"])) {
      throw new Error(
        `Scenario '${scenarioPath}': 'policy.allow' must be a string array`
      );
    }
    for (let i = 0; i < (policy["allow"] as unknown[]).length; i++) {
      if (typeof (policy["allow"] as unknown[])[i] !== "string") {
        throw new Error(
          `Scenario '${scenarioPath}': 'policy.allow[${i}]' must be a string`
        );
      }
    }
    if (policy["deny"] !== undefined) {
      if (!Array.isArray(policy["deny"])) {
        throw new Error(
          `Scenario '${scenarioPath}': 'policy.deny' must be a string array`
        );
      }
      for (let i = 0; i < (policy["deny"] as unknown[]).length; i++) {
        if (typeof (policy["deny"] as unknown[])[i] !== "string") {
          throw new Error(
            `Scenario '${scenarioPath}': 'policy.deny[${i}]' must be a string`
          );
        }
      }
    }
  }

  if (obj["capture"] !== undefined) {
    const capture = obj["capture"] as Record<string, unknown>;
    if (
      typeof capture !== "object" ||
      capture === null ||
      Array.isArray(capture)
    ) {
      throw new Error(
        `Scenario '${scenarioPath}': 'capture' must be an object`
      );
    }
    if (
      capture["trace"] !== undefined &&
      typeof capture["trace"] !== "boolean"
    ) {
      throw new Error(
        `Scenario '${scenarioPath}': 'capture.trace' must be a boolean`
      );
    }
    if (
      capture["evidence"] !== undefined &&
      typeof capture["evidence"] !== "boolean"
    ) {
      throw new Error(
        `Scenario '${scenarioPath}': 'capture.evidence' must be a boolean`
      );
    }
  }

  if (obj["meta"] !== undefined) {
    const meta = obj["meta"] as Record<string, unknown>;
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
      throw new Error(
        `Scenario '${scenarioPath}': 'meta' must be an object`
      );
    }
    if (meta["tags"] !== undefined) {
      if (!Array.isArray(meta["tags"])) {
        throw new Error(
          `Scenario '${scenarioPath}': 'meta.tags' must be a string array`
        );
      }
      for (let i = 0; i < (meta["tags"] as unknown[]).length; i++) {
        if (typeof (meta["tags"] as unknown[])[i] !== "string") {
          throw new Error(
            `Scenario '${scenarioPath}': 'meta.tags[${i}]' must be a string`
          );
        }
      }
    }
  }

  if (expect["files"] !== undefined) {
    if (!Array.isArray(expect["files"])) {
      throw new Error(
        `Scenario '${scenarioPath}': 'expect.files' must be an array`
      );
    }
    for (let i = 0; i < expect["files"].length; i++) {
      const f = expect["files"][i] as Record<string, unknown>;
      if (typeof f["path"] !== "string") {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.files[${i}].path' must be a string`
        );
      }

      const assertionKeys = ["sha256", "text", "json", "absent"].filter(
        (k) => f[k] !== undefined
      );
      if (assertionKeys.length !== 1) {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.files[${i}]' must define exactly one of 'sha256', 'text', 'json', or 'absent'`
        );
      }
      if (f["sha256"] !== undefined && typeof f["sha256"] !== "string") {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.files[${i}].sha256' must be a string`
        );
      }
      if (f["text"] !== undefined && typeof f["text"] !== "string") {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.files[${i}].text' must be a string`
        );
      }
      if (f["absent"] !== undefined && f["absent"] !== true) {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.files[${i}].absent' must be true`
        );
      }
    }
  }

  const stringExpectFields = [
    "stdoutText",
    "stdoutContains",
    "stdoutRegex",
    "stderrText",
    "stderrContains",
    "stderrRegex",
  ];
  for (const field of stringExpectFields) {
    if (expect[field] !== undefined && typeof expect[field] !== "string") {
      throw new Error(
        `Scenario '${scenarioPath}': 'expect.${field}' must be a string`
      );
    }
  }

  const stringArrayExpectFields = ["stdoutContainsAll", "stderrContainsAll"];
  for (const field of stringArrayExpectFields) {
    const value = expect[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(
        `Scenario '${scenarioPath}': 'expect.${field}' must be a non-empty string array`
      );
    }
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== "string" || value[i].length === 0) {
        throw new Error(
          `Scenario '${scenarioPath}': 'expect.${field}[${i}]' must be a non-empty string`
        );
      }
    }
  }

  return raw as ScenarioConfig;
}
