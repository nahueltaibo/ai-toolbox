import fs from "node:fs";
import path from "node:path";

const REGISTRY_RE = /^([^/@\s]+\/[^/@\s]+)(?:@([^\s]+))?$/;

// Exported for testing. Resolves an <owner>/<repo>[@branch] spec into the
// raw.githubusercontent.com base to fetch from. No implicit default - every
// registry the CLI talks to is one the user explicitly added.
export function resolveRegistryBase(registrySpec) {
  const match = REGISTRY_RE.exec(registrySpec || "");
  if (!match) throw new Error(`Invalid registry "${registrySpec}" - expected <owner>/<repo>[@branch]`);
  const [, repo, branch = "main"] = match;
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

export async function fetchText(relativePath, sourceRoot, registry) {
  if (sourceRoot) {
    const filePath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf8");
  }
  const base = resolveRegistryBase(registry);
  const response = await fetch(`${base}/${relativePath}`);
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
  return response.text();
}

export async function fetchRegistry(sourceRoot, registry) {
  const text = await fetchText("registry.json", sourceRoot, registry);
  const parsed = JSON.parse(text);
  return parsed.tools ?? [];
}
