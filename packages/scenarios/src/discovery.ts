/**
 * Scenario discovery and filtering helpers.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface DiscoveredScenario {
  id: string;
  dir: string;
  relPath: string;
  root: string;
}

const IGNORED_DIRS = new Set(["node_modules", "dist"]);

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
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;

    const scenarioFile = path.join(fullPath, "scenario.json");
    if (fs.existsSync(scenarioFile)) {
      const id = entry.name;
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          dir: fullPath,
          relPath: path.relative(root, fullPath),
          root,
        });
      }
    }

    walkForScenarios(fullPath, root, seen);
  }
}

export function getScenarioRoots(
  repoRoot: string,
  extraRootsEnv?: string
): string[] {
  const roots: string[] = [
    path.join(repoRoot, "scenarios"),
    path.join(repoRoot, "packages", "scenarios", "scenarios"),
  ];

  if (extraRootsEnv) {
    const extras = extraRootsEnv
      .split(path.delimiter)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => (path.isAbsolute(s) ? s : path.resolve(repoRoot, s)));

    roots.push(...extras);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export function discoverScenarios(roots: string[]): DiscoveredScenario[] {
  const seen = new Map<string, DiscoveredScenario>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walkForScenarios(root, root, seen);
  }
  return [...seen.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
}

export function applyScenarioTextFilter(
  scenarios: DiscoveredScenario[],
  filterText?: string
): DiscoveredScenario[] {
  const q = (filterText ?? "").trim().toLowerCase();
  if (!q) return scenarios;
  return scenarios.filter((s) => {
    return s.id.toLowerCase().includes(q) || s.relPath.toLowerCase().includes(q);
  });
}

export function parseTagFilter(tagFilter?: string): string[] {
  if (!tagFilter) return [];
  const out: string[] = [];
  for (const raw of tagFilter.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

export function hasAnyRequestedTag(
  scenarioTags: string[] | undefined,
  requestedTags: string[]
): boolean {
  if (requestedTags.length === 0) return true;
  if (!scenarioTags || scenarioTags.length === 0) return false;
  const normalized = new Set(scenarioTags.map((t) => t.toLowerCase()));
  return requestedTags.some((tag) => normalized.has(tag));
}
