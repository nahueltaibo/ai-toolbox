import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installTool, removeTool } from "../src/installer.js";
import { getFrontmatterVersion } from "../src/skillFrontmatter.js";
import { userSkillsRoot, userClaudeMdPath, repoClaudeMdPath } from "../src/paths.js";

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
  fs.writeFileSync(path.join(dir, "skills", "demo-tool", "SKILL.md"), "---\nname: demo-tool\ndescription: Demo\n---\n# Demo skill\n", "utf8");
  fs.mkdirSync(path.join(dir, "rules", "demo-rules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "rules", "demo-rules", "CONTENT.md"), "# Demo rules\n", "utf8");
  return dir;
}

const skillTool = { id: "demo-tool", type: "skill", version: "1.0.0", path: "skills/demo-tool/SKILL.md" };
const rulesTool = {
  id: "demo-rules",
  type: "rules",
  version: "1.0.0",
  path: "rules/demo-rules/CONTENT.md",
};

test("installs a skill to user scope, stamping its version into the frontmatter", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source };
    const result = await installTool(skillTool, "user", ctx);
    const content = fs.readFileSync(result.targetFile, "utf8");
    assert.match(content, /# Demo skill/);
    assert.equal(getFrontmatterVersion(content), "1.0.0");
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("installs a skill to repo scope without touching user scope", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-repo-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: repo, sourceRoot: source };
    const result = await installTool(skillTool, "repo", ctx);
    assert.match(fs.readFileSync(result.targetFile, "utf8"), /# Demo skill/);
    assert.ok(!fs.existsSync(path.join(userSkillsRoot(), "demo-tool")));
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test("skips repo-scope install when no repo root is known", async () => {
  const source = makeSourceRoot();
  const ctx = { repoRoot: null, sourceRoot: source };
  const result = await installTool(skillTool, "repo", ctx);
  assert.equal(result.skipped, true);
  fs.rmSync(source, { recursive: true, force: true });
});

test("removeTool deletes the installed skill folder", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source };
    await installTool(skillTool, "user", ctx);
    const targetDir = path.join(userSkillsRoot(), "demo-tool");
    assert.ok(fs.existsSync(targetDir));

    removeTool(skillTool, "user", ctx);
    assert.ok(!fs.existsSync(targetDir));
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("installs rules by merging into CLAUDE.md", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    const ctx = { repoRoot: null, sourceRoot: source };
    const result = await installTool(rulesTool, "user", ctx);
    assert.equal(result.targetFile, userClaudeMdPath());
    const content = fs.readFileSync(userClaudeMdPath(), "utf8");
    assert.match(content, /<!-- ai-toolbox:demo-rules:v1\.0\.0:start -->/);
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("removeTool removes the rules block and leaves the rest of CLAUDE.md intact", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(userClaudeMdPath(), "hand-written\n", "utf8");
    const ctx = { repoRoot: null, sourceRoot: source };
    await installTool(rulesTool, "user", ctx);
    removeTool(rulesTool, "user", ctx);
    assert.equal(fs.readFileSync(userClaudeMdPath(), "utf8"), "hand-written\n");
  });
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("repo-scope rules install/remove target <repo>/CLAUDE.md", async () => {
  const source = makeSourceRoot();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-repo-"));
  const ctx = { repoRoot: repo, sourceRoot: source };
  await installTool(rulesTool, "repo", ctx);
  assert.match(fs.readFileSync(repoClaudeMdPath(repo), "utf8"), /demo-rules/);
  removeTool(rulesTool, "repo", ctx);
  assert.doesNotMatch(fs.readFileSync(repoClaudeMdPath(repo), "utf8"), /demo-rules/);
  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});
