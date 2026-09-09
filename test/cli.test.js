import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProgram } from "../src/cli.js";
import { getFrontmatterVersion } from "../src/skillFrontmatter.js";
import { userSkillsRoot, userClaudeMdPath } from "../src/paths.js";
import { listRegistries } from "../src/config.js";

function makeSourceRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-source-"));
  fs.writeFileSync(
    path.join(dir, "registry.json"),
    JSON.stringify({
      tools: [
        { id: "demo-tool", type: "skill", version: "1.0.0", description: "Demo", path: "skills/demo-tool/SKILL.md" },
        {
          id: "demo-rules",
          type: "rules",
          version: "1.0.0",
          description: "Demo rules",
          path: "rules/demo-rules/CONTENT.md",
        },
      ],
    }),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "skills", "demo-tool"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "demo-tool", "SKILL.md"), "---\nname: demo-tool\ndescription: Demo\n---\n# Demo\n", "utf8");
  fs.mkdirSync(path.join(dir, "rules", "demo-rules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "rules", "demo-rules", "CONTENT.md"), "# Demo rules\n", "utf8");
  return dir;
}

function withHome(dir) {
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
}

function installedSkillPath(id) {
  return path.join(userSkillsRoot(), id, "SKILL.md");
}

test("install then remove a skill via the commander program, user scope", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "install", "demo-tool"]);
  assert.equal(getFrontmatterVersion(fs.readFileSync(installedSkillPath("demo-tool"), "utf8")), "1.0.0");

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "remove", "demo-tool"]);
  assert.ok(!fs.existsSync(installedSkillPath("demo-tool")));

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("install rejects an unknown tool id without throwing", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "install", "does-not-exist"]);
  assert.ok(!fs.existsSync(installedSkillPath("does-not-exist")));

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("update with no ids reinstalls only outdated installed tools", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "install", "demo-tool"]);
  // Simulate a registry bump by rewriting the fixture's registry.json to a newer version.
  const registryPath = path.join(source, "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.tools[0].version = "2.0.0";
  fs.writeFileSync(registryPath, JSON.stringify(registry), "utf8");

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "update"]);
  assert.equal(getFrontmatterVersion(fs.readFileSync(installedSkillPath("demo-tool"), "utf8")), "2.0.0");

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("install merges a rules tool into CLAUDE.md", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "install", "demo-rules"]);
  const content = fs.readFileSync(userClaudeMdPath(), "utf8");
  assert.match(content, /<!-- ai-toolbox:demo-rules:v1\.0\.0:start -->/);

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("list prints without throwing", async () => {
  const source = makeSourceRoot();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "--source", source, "list"]);

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

test("registry add saves a named registry that registry list then shows", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "add", "acme", "acme/tools@release"]);
  assert.deepEqual(listRegistries(), { acme: "acme/tools@release" });

  await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "list"]);

  fs.rmSync(home, { recursive: true, force: true });
});

test("registry add rejects a malformed spec without saving it", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "add", "acme", "not-a-repo"]);
  assert.deepEqual(listRegistries(), {});
  process.exitCode = 0; // the CLI action sets this for a real process exit; undo so it doesn't leak to the test runner

  fs.rmSync(home, { recursive: true, force: true });
});

test("registry remove deletes a saved registry", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "add", "acme", "acme/tools"]);
  await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "remove", "acme"]);
  assert.deepEqual(listRegistries(), {});

  fs.rmSync(home, { recursive: true, force: true });
});

test("list with no registries configured prints without throwing", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  withHome(home);

  await buildProgram().parseAsync(["node", "ai-toolbox", "list"]);
  assert.deepEqual(listRegistries(), {});

  fs.rmSync(home, { recursive: true, force: true });
});
