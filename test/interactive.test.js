import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveToolSelection, buildToolChoices, runInteractive } from "../src/interactive.js";
import { getFrontmatterVersion } from "../src/skillFrontmatter.js";
import { userSkillsRoot } from "../src/paths.js";

const tools = [
  { id: "a", type: "skill", version: "1.0.0", description: "Tool A", path: "skills/a/SKILL.md" },
  { id: "b", type: "skill", version: "1.0.0", description: "Tool B", path: "skills/b/SKILL.md" },
];

test("resolveToolSelection expands the 'All tools' sentinel to every tool", () => {
  assert.deepEqual(resolveToolSelection(["__all__"], tools), tools);
});

test("resolveToolSelection maps selected ids to their tool objects", () => {
  assert.deepEqual(resolveToolSelection(["b"], tools), [tools[1]]);
});

test("buildToolChoices puts 'All tools' first and describes each tool", () => {
  const choices = buildToolChoices(tools);
  assert.equal(choices[0].value, "__all__");
  assert.equal(choices[1].name, "a - Tool A");
});

function makeSourceRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-source-"));
  fs.mkdirSync(path.join(dir, "skills", "demo-tool"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "demo-tool", "SKILL.md"), "---\nname: demo-tool\ndescription: Demo\n---\n# Demo\n", "utf8");
  return dir;
}

test("runInteractive cancels cleanly when nothing is selected", async () => {
  const source = makeSourceRoot();
  const ctx = { tools: [], repoRoot: null, sourceRoot: source };
  const deps = { checkbox: async () => [], select: async () => assert.fail("should not be called"), confirm: async () => false, promptForRepoRoot: async () => null };
  await runInteractive(ctx, deps);
  fs.rmSync(source, { recursive: true, force: true });
});

test("runInteractive installs the selected tool end-to-end when confirmed", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const demoTool = { id: "demo-tool", type: "skill", version: "1.0.0", description: "Demo", path: "skills/demo-tool/SKILL.md" };
  const ctx = { tools: [demoTool], repoRoot: null, sourceRoot: source };
  const selects = ["install", "user"];
  let selectCall = 0;
  const deps = {
    checkbox: async () => ["demo-tool"],
    select: async () => selects[selectCall++],
    confirm: async () => true,
    promptForRepoRoot: async () => null,
  };
  await runInteractive(ctx, deps);
  const installed = fs.readFileSync(path.join(userSkillsRoot(), "demo-tool", "SKILL.md"), "utf8");
  assert.equal(getFrontmatterVersion(installed), "1.0.0");

  process.env.HOME = prevHome;
  process.env.USERPROFILE = prevUserProfile;
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("runInteractive prompts for a repo path when scope is repo and none was detected, then cancels if blank", async () => {
  const source = makeSourceRoot();
  const demoTool = { id: "demo-tool", type: "skill", version: "1.0.0", description: "Demo", path: "skills/demo-tool/SKILL.md" };
  const ctx = { tools: [demoTool], repoRoot: null, sourceRoot: source };
  const selects = ["install", "repo"];
  let selectCall = 0;
  let promptCalled = false;
  const deps = {
    checkbox: async () => ["demo-tool"],
    select: async () => selects[selectCall++],
    confirm: async () => assert.fail("should not reach confirm"),
    promptForRepoRoot: async () => {
      promptCalled = true;
      return null;
    },
  };
  await runInteractive(ctx, deps);
  assert.ok(promptCalled);
  fs.rmSync(source, { recursive: true, force: true });
});
