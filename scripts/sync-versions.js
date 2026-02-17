#!/usr/bin/env node
/**
 * Sync the version from root package.json to all workspace package.json files.
 * Usage: node scripts/sync-versions.js
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const rootPkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = rootPkg.version;

const packagesDir = "packages";
const dirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const dir of dirs) {
  const pkgPath = join(packagesDir, dir, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.version !== version) {
      pkg.version = version;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`  ${pkg.name}: ${version}`);
    }
  } catch {
    // skip dirs without package.json
  }
}

console.log(`All packages synced to v${version}`);
