import fs from "node:fs";
import path from "node:path";
import { fetchText } from "./registry.js";
import {
  userSkillsRoot,
  userStateFile,
  userClaudeMdPath,
  repoSkillsRoot,
  repoStateFile,
  repoClaudeMdPath,
} from "./paths.js";
import { readState, saveState } from "./state.js";
import { setSection, removeSection } from "./claudeMd.js";

// Returns { targetFile, installs } - the caller (cli.js/interactive.js) threads the returned
// installs back into its own state rather than this function mutating anything by reference.
export async function installTool(tool, scopeName, { repoRoot, sourceRoot, userState, repoState }) {
  if (tool.type === "instructions") {
    return installInstructions(tool, scopeName, repoRoot, sourceRoot);
  }

  const scope = resolveSkillScope(tool, scopeName, repoRoot, userState, repoState);
  if (!scope) return { skipped: true, reason: "no-repo" };

  const content = await fetchText(tool.path, sourceRoot);
  const targetFile = path.join(scope.skillsRoot, tool.id, "SKILL.md");
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, content, "utf8");

  const installs = scope.installs.filter((i) => i.id !== tool.id);
  installs.push({ id: tool.id, version: tool.version, scope: scopeName });
  saveState(scope.stateFile, installs);

  return { targetFile, installs };
}

export function removeTool(tool, scopeName, { repoRoot, userState, repoState }) {
  if (tool.type === "instructions") {
    return removeInstructions(tool, scopeName, repoRoot);
  }

  const scope = resolveSkillScope(tool, scopeName, repoRoot, userState, repoState);
  if (!scope) return { skipped: true, reason: "no-repo" };

  const targetDir = path.join(scope.skillsRoot, tool.id);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

  const installs = scope.installs.filter((i) => i.id !== tool.id);
  saveState(scope.stateFile, installs);

  return { installs };
}

function resolveSkillScope(tool, scopeName, repoRoot, userState, repoState) {
  if (scopeName === "user") {
    return { skillsRoot: userSkillsRoot(), stateFile: userStateFile(), installs: userState };
  }
  if (!repoRoot) return null;
  return { skillsRoot: repoSkillsRoot(repoRoot), stateFile: repoStateFile(repoRoot), installs: repoState };
}

async function installInstructions(tool, scopeName, repoRoot, sourceRoot) {
  const targetFile = scopeName === "user" ? userClaudeMdPath() : repoRoot && repoClaudeMdPath(repoRoot);
  if (!targetFile) return { skipped: true, reason: "no-repo" };

  const body = await fetchText(tool.path, sourceRoot);
  setSection(targetFile, tool, body);
  return { targetFile };
}

function removeInstructions(tool, scopeName, repoRoot) {
  const targetFile = scopeName === "user" ? userClaudeMdPath() : repoRoot && repoClaudeMdPath(repoRoot);
  if (!targetFile) return { skipped: true, reason: "no-repo" };

  removeSection(targetFile, tool.id);
  return { targetFile };
}

// Convenience for callers that don't already have state loaded (e.g. a one-shot `install` subcommand).
export function loadState(scopeName, repoRoot) {
  return scopeName === "user" ? readState(userStateFile()) : repoRoot ? readState(repoStateFile(repoRoot)) : [];
}
