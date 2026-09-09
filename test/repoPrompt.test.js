import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRepoPath, promptForRepoRoot } from "../src/repoPrompt.js";

test("strips surrounding whitespace and quotes", () => {
  assert.equal(resolveRepoPath('  "C:\\code\\demo"  '), path.normalize("C:\\code\\demo"));
});

test("expands a bare ~ to the home directory", () => {
  assert.equal(resolveRepoPath("~"), path.normalize(os.homedir()));
});

test("expands a ~-rooted path with either slash style", () => {
  assert.equal(resolveRepoPath("~/code"), path.normalize(path.join(os.homedir(), "code")));
  assert.equal(resolveRepoPath("~\\code"), path.normalize(path.join(os.homedir(), "code")));
});

test("leaves a path whose name merely starts with a tilde alone", () => {
  assert.equal(resolveRepoPath("~tmp"), path.normalize("~tmp"));
});

test("expands environment variables", () => {
  process.env.AI_TOOLBOX_TEST_VAR = "C:\\somewhere";
  assert.equal(resolveRepoPath("%AI_TOOLBOX_TEST_VAR%\\demo"), path.normalize("C:\\somewhere\\demo"));
  delete process.env.AI_TOOLBOX_TEST_VAR;
});

test("promptForRepoRoot returns null when the user enters nothing", async () => {
  const result = await promptForRepoRoot(async () => "");
  assert.equal(result, null);
});

test("promptForRepoRoot re-prompts on a path that isn't a directory, then accepts a valid one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-target-"));
  const answers = ["C:\\definitely\\not\\here", dir];
  let call = 0;
  const result = await promptForRepoRoot(async () => answers[call++]);
  assert.equal(result, fs.realpathSync(dir));
  assert.equal(call, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
