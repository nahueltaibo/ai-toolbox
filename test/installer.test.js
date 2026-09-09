import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installTool, removeTool } from "../src/installer.js";
import { readState } from "../src/state.js";
import { userSkillsRoot, userStateFile, userClaudeMdPath, repoStateFile, repoClaudeMdPath } from "../src/paths.js";

async function withHome(dir, fn) {
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  try {
    // Await here, not just at the call site - a bare `return fn()` would let the outer
    // `finally` restore the env vars before this promise's continuation actually reads them.
    return await fn();
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

function makeSourceRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-source-"));
  fs.mkdirSync(path.join(dir, "skills", "demo-tool"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "demo-tool", "SKILL.md"), "# Demo skill\n", "utf8");
  fs.mkdirSync(path.join(dir, "instructions", "demo-instructions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "instructions", "demo-instructions", "CONTENT.md"), "# Demo rules\n", "utf8");
  return dir;
}

const skillTool = { id: "demo-tool", type: "skill", version: "1.0.0", path: "skills/demo-tool/SKILL.md" };
const instructionsTool = {
  id: "demo-instructions",
  type: "instructions",
  version: "1.0.0",
  path: "instructions/demo-instructions/CONTENT.md",
};

test("installs a skill to user scope and records state", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source, userState: [], repoState: [] };
    const result = await installTool(skillTool, "user", ctx);
    assert.equal(fs.readFileSync(result.targetFile, "utf8"), "# Demo skill\n");
    assert.deepEqual(readState(userStateFile()).map((i) => i.id), ["demo-tool"]);
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("installs a skill to repo scope without touching user scope", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-repo-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: repo, sourceRoot: source, userState: [], repoState: [] };
    const result = await installTool(skillTool, "repo", ctx);
    assert.equal(fs.readFileSync(result.targetFile, "utf8"), "# Demo skill\n");
    assert.deepEqual(readState(repoStateFile(repo)).map((i) => i.id), ["demo-tool"]);
    assert.ok(!fs.existsSync(userStateFile()));
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test("skips repo-scope install when no repo root is known", async () => {
  const source = makeSourceRoot();
  const ctx = { repoRoot: null, sourceRoot: source, userState: [], repoState: [] };
  const result = await installTool(skillTool, "repo", ctx);
  assert.equal(result.skipped, true);
  fs.rmSync(source, { recursive: true, force: true });
});

test("removeTool deletes the installed skill folder and clears the state entry", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source, userState: [], repoState: [] };
    await installTool(skillTool, "user", ctx);
    ctx.userState = readState(userStateFile());
    const targetDir = path.join(userSkillsRoot(), "demo-tool");
    assert.ok(fs.existsSync(targetDir));

    const result = removeTool(skillTool, "user", ctx);
    assert.ok(!fs.existsSync(targetDir));
    assert.deepEqual(result.installs, []);
    assert.ok(!fs.existsSync(userStateFile()));
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("installs instructions by merging into CLAUDE.md, without writing a state file", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source, userState: [], repoState: [] };
    const result = await installTool(instructionsTool, "user", ctx);
    assert.equal(result.targetFile, userClaudeMdPath());
    const content = fs.readFileSync(userClaudeMdPath(), "utf8");
    assert.match(content, /<!-- ai-toolbox:demo-instructions:v1\.0\.0:start -->/);
    assert.ok(!fs.existsSync(userStateFile()));
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("removeTool removes the instructions block and leaves the rest of CLAUDE.md intact", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(userClaudeMdPath(), "hand-written\n", "utf8");
    const ctx = { repoRoot: null, sourceRoot: source, userState: [], repoState: [] };
    await installTool(instructionsTool, "user", ctx);
    removeTool(instructionsTool, "user", ctx);
    assert.equal(fs.readFileSync(userClaudeMdPath(), "utf8"), "hand-written\n");
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("repo-scope instructions install/remove target <repo>/CLAUDE.md", async () => {
  const source = makeSourceRoot();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-repo-"));
  const ctx = { repoRoot: repo, sourceRoot: source, userState: [], repoState: [] };
  await installTool(instructionsTool, "repo", ctx);
  assert.match(fs.readFileSync(repoClaudeMdPath(repo), "utf8"), /demo-instructions/);
  removeTool(instructionsTool, "repo", ctx);
  assert.doesNotMatch(fs.readFileSync(repoClaudeMdPath(repo), "utf8"), /demo-instructions/);
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});
