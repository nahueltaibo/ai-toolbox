import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  userSkillsRoot,
  userStateFile,
  userClaudeMdPath,
  repoSkillsRoot,
  repoStateFile,
  repoClaudeMdPath,
} from "../src/paths.js";

test("user-scope paths live under the home directory", () => {
  assert.equal(userSkillsRoot(), path.join(os.homedir(), ".claude", "skills"));
  assert.equal(userStateFile(), path.join(os.homedir(), ".ai-framework-installed.json"));
  assert.equal(userClaudeMdPath(), path.join(os.homedir(), ".claude", "CLAUDE.md"));
});

test("repo-scope paths live under the given repo root", () => {
  const repoRoot = path.join("C:", "code", "some-repo");
  assert.equal(repoSkillsRoot(repoRoot), path.join(repoRoot, ".claude", "skills"));
  assert.equal(repoStateFile(repoRoot), path.join(repoRoot, ".ai-framework-installed.json"));
  assert.equal(repoClaudeMdPath(repoRoot), path.join(repoRoot, "CLAUDE.md"));
});
