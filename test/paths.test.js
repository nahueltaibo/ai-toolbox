import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { userSkillsRoot, userClaudeMdPath, repoSkillsRoot, repoClaudeMdPath, targetFileFor } from "../src/paths.js";

test("user-scope paths live under the home directory", () => {
  assert.equal(userSkillsRoot(), path.join(os.homedir(), ".claude", "skills"));
  assert.equal(userClaudeMdPath(), path.join(os.homedir(), ".claude", "CLAUDE.md"));
});

test("repo-scope paths live under the given repo root", () => {
  const repoRoot = path.join("C:", "code", "some-repo");
  assert.equal(repoSkillsRoot(repoRoot), path.join(repoRoot, ".claude", "skills"));
  assert.equal(repoClaudeMdPath(repoRoot), path.join(repoRoot, "CLAUDE.md"));
});

test("targetFileFor points a skill at its SKILL.md, user or repo scope", () => {
  const skill = { id: "demo", type: "skill" };
  assert.equal(targetFileFor(skill, "user", null), path.join(userSkillsRoot(), "demo", "SKILL.md"));
  const repoRoot = path.join("C:", "code", "some-repo");
  assert.equal(targetFileFor(skill, "repo", repoRoot), path.join(repoSkillsRoot(repoRoot), "demo", "SKILL.md"));
});

test("targetFileFor points rules at CLAUDE.md, user or repo scope", () => {
  const rules = { id: "demo", type: "rules" };
  assert.equal(targetFileFor(rules, "user", null), userClaudeMdPath());
  const repoRoot = path.join("C:", "code", "some-repo");
  assert.equal(targetFileFor(rules, "repo", repoRoot), repoClaudeMdPath(repoRoot));
});

test("targetFileFor returns null for repo scope when there's no repo root", () => {
  assert.equal(targetFileFor({ id: "demo", type: "skill" }, "repo", null), null);
  assert.equal(targetFileFor({ id: "demo", type: "rules" }, "repo", null), null);
});
