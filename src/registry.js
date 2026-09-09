import fs from "node:fs";
import path from "node:path";

export const DEFAULT_REGISTRY = "nahueltaibo/ai-toolbox@main";
const REGISTRY_RE = /^([^/@\s]+\/[^/@\s]+)(?:@([^\s]+))?$/;

// Exported for testing. Resolves a --registry spec (or the public default)
// into the raw.githubusercontent.com base to fetch from.
export function resolveRegistryBase(registrySpec) {
  const spec = registrySpec || DEFAULT_REGISTRY;
  const match = REGISTRY_RE.exec(spec);
  if (!match) throw new Error(`Invalid --registry "${spec}" - expected <owner>/<repo>[@branch]`);
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
