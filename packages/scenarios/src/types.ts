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

export type FileAssertion =
  | FileAssertionSha256
  | FileAssertionText
  | FileAssertionJson;

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
  stdoutText?: string;
  stderrJson?: unknown;
  stderrText?: string;
  stderrContains?: string;
  evidenceJson?: unknown;
  traceSummary?: TraceSummary;
  files?: FileAssertion[];
}

export interface ScenarioConfig {
  cmd: string[];
  stdin?: string;
  policy?: PolicyConfig;
  capture?: CaptureConfig;
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
    }
  }

  return raw as ScenarioConfig;
}
