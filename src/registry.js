import fs from "node:fs";
import path from "node:path";

const RAW_BASE = "https://raw.githubusercontent.com/nahueltaibo/ai-toolbox/main";

export async function fetchText(relativePath, sourceRoot) {
  if (sourceRoot) {
    const filePath = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf8");
  }
  const response = await fetch(`${RAW_BASE}/${relativePath}`);
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
  return response.text();
}

export async function fetchRegistry(sourceRoot) {
  const text = await fetchText("registry.json", sourceRoot);
  const registry = JSON.parse(text);
  return registry.tools ?? [];
}
