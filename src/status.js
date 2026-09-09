import fs from "node:fs";
import { getSectionVersion } from "./claudeMd.js";
import { getFrontmatterVersion } from "./skillFrontmatter.js";

// Both tool types read their installed version straight from the artifact itself - a CLAUDE.md
// marker for rules, frontmatter metadata for skills - never from a separate ledger, so this
// is accurate even if the file was hand-copied, committed on its own, or edited outside the CLI.
export function getEffectiveInstalledVersion(tool, targetFile) {
  if (!targetFile || !fs.existsSync(targetFile)) return null;
  const content = fs.readFileSync(targetFile, "utf8");
  return tool.type === "rules" ? getSectionVersion(content, tool.id) : getFrontmatterVersion(content);
}

export function formatStatus(installedVersion, tool) {
  if (!installedVersion) return "not installed";
  if (installedVersion !== tool.version) return `v${installedVersion} -> v${tool.version}`;
  return `v${installedVersion}`;
}

export function getStatusColor(status) {
  if (status === "not installed" || status === "-") return "gray";
  if (status.includes("->")) return "yellow";
  return "green";
}
