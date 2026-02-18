/**
 * A0 Capability Policy loader and enforcer.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { KNOWN_CAPABILITIES } from "./validator.js";

export interface Policy {
  version: number;
  allow: string[];
  deny?: string[];
  limits?: Record<string, number>;
}

const DEFAULT_POLICY: Policy = {
  version: 1,
  allow: [],
};

/**
 * Load policy from project or user config.
 * Precedence: ./.a0policy.json > ~/.a0/policy.json > default (deny all)
 */
export function loadPolicy(cwd?: string): Policy {
  const projectPath = path.join(cwd ?? process.cwd(), ".a0policy.json");
  const userPath = path.join(os.homedir(), ".a0", "policy.json");

  // Try project-local policy first
  const projectPolicy = tryLoadPolicyFile(projectPath);
  if (projectPolicy) return projectPolicy;

  // Then user-level policy
  const userPolicy = tryLoadPolicyFile(userPath);
  if (userPolicy) return userPolicy;

  // Default: deny all
  return DEFAULT_POLICY;
}

function tryLoadPolicyFile(filePath: string): Policy | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return validatePolicyShape(data);
  } catch {
    return null;
  }
}

function validatePolicyShape(data: unknown): Policy {
  if (typeof data !== "object" || data === null) {
    throw new Error("Policy must be a JSON object.");
  }
  const obj = data as Record<string, unknown>;

  const version = typeof obj["version"] === "number" ? obj["version"] : 1;
  const allow = Array.isArray(obj["allow"])
    ? (obj["allow"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const deny = Array.isArray(obj["deny"])
    ? (obj["deny"] as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  const limits =
    typeof obj["limits"] === "object" && obj["limits"] !== null
      ? (obj["limits"] as Record<string, number>)
      : undefined;

  return { version, allow, deny, limits };
}

/**
 * Build the set of allowed capabilities from policy + CLI overrides.
 */
export function buildAllowedCaps(
  policy: Policy,
  unsafeAllowAll: boolean
): Set<string> {
  if (unsafeAllowAll) {
    return new Set(KNOWN_CAPABILITIES);
  }
  const denySet = new Set(policy.deny ?? []);
  return new Set(policy.allow.filter(c => !denySet.has(c)));
}
