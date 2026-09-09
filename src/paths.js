import os from "node:os";
import path from "node:path";

export function userSkillsRoot() {
  return path.join(os.homedir(), ".claude", "skills");
}

export function userClaudeMdPath() {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}

export function repoSkillsRoot(repoRoot) {
  return path.join(repoRoot, ".claude", "skills");
}

export function repoClaudeMdPath(repoRoot) {
  return path.join(repoRoot, "CLAUDE.md");
}

// The one file that represents a tool's install at a given scope - null when the scope isn't
// available (repo scope with no repo root). Both install/remove and version-reading key off this,
// so "where does this tool live" is decided in exactly one place.
export function targetFileFor(tool, scopeName, repoRoot) {
  if (scopeName === "repo" && !repoRoot) return null;

  if (tool.type === "instructions") {
    return scopeName === "user" ? userClaudeMdPath() : repoClaudeMdPath(repoRoot);
  }
  const skillsRoot = scopeName === "user" ? userSkillsRoot() : repoSkillsRoot(repoRoot);
  return path.join(skillsRoot, tool.id, "SKILL.md");
}
