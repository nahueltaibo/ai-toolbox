import os from "node:os";
import path from "node:path";

export function userSkillsRoot() {
  return path.join(os.homedir(), ".claude", "skills");
}

export function userStateFile() {
  // Lives inside .claude/, not loose in $HOME - one dotfile-free join instead of another top-level
  // entry to spot in `ls -a`, and it sits next to the skills/CLAUDE.md it's actually tracking.
  return path.join(os.homedir(), ".claude", "ai-toolbox-installed.json");
}

export function userClaudeMdPath() {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}

export function repoSkillsRoot(repoRoot) {
  return path.join(repoRoot, ".claude", "skills");
}

export function repoStateFile(repoRoot) {
  return path.join(repoRoot, ".claude", "ai-toolbox-installed.json");
}

export function repoClaudeMdPath(repoRoot) {
  return path.join(repoRoot, "CLAUDE.md");
}
