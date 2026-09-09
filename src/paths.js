import os from "node:os";
import path from "node:path";

export function userSkillsRoot() {
  return path.join(os.homedir(), ".claude", "skills");
}

export function userStateFile() {
  return path.join(os.homedir(), ".ai-framework-installed.json");
}

export function userClaudeMdPath() {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}

export function repoSkillsRoot(repoRoot) {
  return path.join(repoRoot, ".claude", "skills");
}

export function repoStateFile(repoRoot) {
  return path.join(repoRoot, ".ai-framework-installed.json");
}

export function repoClaudeMdPath(repoRoot) {
  return path.join(repoRoot, "CLAUDE.md");
}
