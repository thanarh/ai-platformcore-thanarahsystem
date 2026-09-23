import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const internalRegistryPrefix = "http://package-firewall.replit.internal/npm/";
const publicRegistryPrefix = "https://registry.npmjs.org/";
const lockfiles = [
  "package-lock.json",
  "apps/web/package-lock.json",
  "apps/api/package-lock.json",
];

let changed = 0;

for (const relativePath of lockfiles) {
  const path = resolve(relativePath);
  const before = readFileSync(path, "utf8");
  const after = before.replaceAll(internalRegistryPrefix, publicRegistryPrefix);
  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
  }
}

console.log(
  `Prepared ${changed} npm lockfile(s) for the public registry: ${publicRegistryPrefix}`,
);