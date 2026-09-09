import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findRepoRoot } from "../src/git.js";

test("returns the override directly, without shelling out to git", () => {
  assert.equal(findRepoRoot("C:\\some\\fake\\repo"), "C:\\some\\fake\\repo");
});

test("returns null when the cwd is not a git repository", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-nogit-"));
  assert.equal(findRepoRoot(null, dir), null);
});

test("finds the real repo root when run inside one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-git-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  // Compare against a second, independent `git rev-parse` rather than against `dir` itself - on this
  // machine %TEMP% is already a short (8.3) Windows path, which git's own output normalizes away, so
  // comparing to `dir` verbatim fails on a spelling difference that isn't a different directory.
  const expected = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir }).toString().trim();
  assert.equal(findRepoRoot(null, dir), path.normalize(expected));
});

test("returns null when the git binary itself is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-nogit-bin-"));
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    assert.equal(findRepoRoot(null, dir), null);
  } finally {
    process.env.PATH = originalPath;
  }
});
