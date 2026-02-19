/**
 * a0 policy - effective policy summary command
 */
import { resolvePolicy, buildAllowedCaps } from "@a0/core";

function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export async function runPolicy(
  opts: { json?: boolean; cwd?: string; homeDir?: string }
): Promise<number> {
  const resolved = resolvePolicy(opts.cwd, opts.homeDir);
  const allow = sortStrings(resolved.policy.allow);
  const deny = sortStrings(resolved.policy.deny ?? []);
  const effectiveAllow = sortStrings([...buildAllowedCaps(resolved.policy, false)]);
  const limits = resolved.policy.limits ?? {};

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          source: resolved.source,
          path: resolved.path,
          policy: {
            version: resolved.policy.version,
            allow,
            deny,
            limits,
          },
          effectiveAllow,
        },
        null,
        2
      )
    );
    return 0;
  }

  const formatList = (items: string[]): string => (items.length > 0 ? items.join(", ") : "(none)");
  const hasLimits = Object.keys(limits).length > 0;

  console.log("Effective A0 policy");
  console.log(`  Source:          ${resolved.source}`);
  console.log(`  Path:            ${resolved.path ?? "(none)"}`);
  console.log(`  Allow:           ${formatList(allow)}`);
  console.log(`  Deny:            ${formatList(deny)}`);
  console.log(`  Effective allow: ${formatList(effectiveAllow)}`);
  console.log(`  Limits:          ${hasLimits ? JSON.stringify(limits) : "(none)"}`);
  return 0;
}

