import fs from "node:fs";
import path from "node:path";
import { fetchText } from "./registry.js";
import { targetFileFor } from "./paths.js";
import { setSection, removeSection } from "./claudeMd.js";
import { setFrontmatterVersion } from "./skillFrontmatter.js";

// tool.registry (set by loadContext when the tool came from a named/merged
// registry rather than --source) says which raw.githubusercontent.com base
// its content lives under - keeps each tool self-describing after a merge.
export async function installTool(tool, scopeName, { repoRoot, sourceRoot }) {
  const targetFile = targetFileFor(tool, scopeName, repoRoot);
  if (!targetFile) return { skipped: true, reason: "no-repo" };

  if (tool.type === "rules") {
    const body = await fetchText(tool.path, sourceRoot, tool.registry);
    setSection(targetFile, tool, body);
    return { targetFile };
  }

  const content = await fetchText(tool.path, sourceRoot, tool.registry);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, setFrontmatterVersion(content, tool.version), "utf8");
  return { targetFile };
}

export function removeTool(tool, scopeName, { repoRoot }) {
  const targetFile = targetFileFor(tool, scopeName, repoRoot);
  if (!targetFile) return { skipped: true, reason: "no-repo" };

  if (tool.type === "rules") {
    removeSection(targetFile, tool.id);
    return { targetFile };
  }

  const targetDir = path.dirname(targetFile);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  return { targetFile };
}
