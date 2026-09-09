import fs from "node:fs";
import { getSectionVersion } from "./claudeMd.js";

export function getInstalledVersion(installs, toolId) {
  const entry = installs.find((i) => i.id === toolId);
  return entry ? entry.version : null;
}

// For "skill" tools, installed version comes from the tracked install-state JSON. For "instructions"
// tools it comes straight from the marker in the target CLAUDE.md, which is the actual ground truth.
export function getEffectiveInstalledVersion(tool, installs, targetFile) {
  if (tool.type === "instructions") {
    if (!targetFile || !fs.existsSync(targetFile)) return null;
    const content = fs.readFileSync(targetFile, "utf8");
    return getSectionVersion(content, tool.id);
  }
  return getInstalledVersion(installs, tool.id);
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
