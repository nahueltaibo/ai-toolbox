import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildProgram } from "../src/cli.js";
import { getFrontmatterVersion } from "../src/skillFrontmatter.js";
import { userSkillsRoot, userClaudeMdPath } from "../src/paths.js";
import { listRegistries } from "../src/config.js";

// Walks the full user journey end to end, through the real `registry add`/`remove`
// machinery (not the --source dev escape hatch other tests use), to prove the pieces
// work together the way an actual user would hit them - not just in isolation.
//
// "Installing"/"uninstalling the app" itself is npm's job (npm install -g / npm
// uninstall -g), not this CLI's - there's no code path here to test for that beyond
// the entrypoint file working, which the first test below covers by actually spawning
// it, the same way npm's installed `ai-toolbox` shim would.

const binPath = fileURLToPath(new URL("../bin/ai-toolbox.js", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const { version: packageVersion } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

async function withHome(dir, fn) {
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  try {
    return await fn();
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevUserProfile;
  }
}

// Mirrors the shape any registry (this repo's own, a company's, a local folder) has to
// match: a root registry.json plus the skills/<id>/SKILL.md and rules/<id>/CONTENT.md
// files it points to. Kept local so the test never touches the network.
function makeRegistryFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-registry-"));
  fs.writeFileSync(
    path.join(dir, "registry.json"),
    JSON.stringify({
      tools: [
        {
          id: "changelog-writer",
          type: "skill",
          version: "1.0.0",
          description: "Writes changelog entries",
          path: "skills/changelog-writer/SKILL.md",
        },
        {
          id: "pr-etiquette",
          type: "rules",
          version: "1.0.0",
          description: "How to write PR descriptions",
          path: "rules/pr-etiquette/CONTENT.md",
        },
      ],
    }),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "skills", "changelog-writer"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "skills", "changelog-writer", "SKILL.md"),
    "---\nname: changelog-writer\ndescription: Writes changelog entries\n---\n# Changelog writer\n",
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "rules", "pr-etiquette"), { recursive: true });
  fs.writeFileSync(path.join(dir, "rules", "pr-etiquette", "CONTENT.md"), "# PR etiquette\n", "utf8");
  return dir;
}

test("the published entrypoint runs standalone, the way npm's installed shim would", () => {
  const output = execFileSync(process.execPath, [binPath, "--version"]).toString().trim();
  assert.equal(output, packageVersion);
});

test("full lifecycle: add a registry, install a skill and a rule, remove both, remove the registry", async () => {
  const registryDir = makeRegistryFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));

  await withHome(home, async () => {
    // A line already in CLAUDE.md before anything is installed, to prove removing the
    // rule later only touches its own marker block and leaves this alone.
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(userClaudeMdPath(), "# My own notes\n", "utf8");

    // 1. Add the registry, by a local path - stands in for "the default repo" without
    // depending on live network or nahueltaibo/ai-toolbox's content staying fixed.
    await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "add", "example", registryDir]);
    assert.deepEqual(listRegistries(), { example: path.resolve(registryDir) });

    // 2. Install a skill.
    await buildProgram().parseAsync(["node", "ai-toolbox", "install", "changelog-writer"]);
    const skillPath = path.join(userSkillsRoot(), "changelog-writer", "SKILL.md");
    assert.ok(fs.existsSync(skillPath), "skill should be installed");
    assert.equal(getFrontmatterVersion(fs.readFileSync(skillPath, "utf8")), "1.0.0");

    // 3. Install a rule.
    await buildProgram().parseAsync(["node", "ai-toolbox", "install", "pr-etiquette"]);
    let claudeMd = fs.readFileSync(userClaudeMdPath(), "utf8");
    assert.match(claudeMd, /<!-- ai-toolbox:pr-etiquette:v1\.0\.0:start -->/);
    assert.match(claudeMd, /# PR etiquette/);

    // 4. Uninstall both.
    await buildProgram().parseAsync(["node", "ai-toolbox", "remove", "changelog-writer"]);
    assert.ok(!fs.existsSync(skillPath), "skill should be gone");

    await buildProgram().parseAsync(["node", "ai-toolbox", "remove", "pr-etiquette"]);
    claudeMd = fs.readFileSync(userClaudeMdPath(), "utf8");
    assert.doesNotMatch(claudeMd, /pr-etiquette/);
    assert.match(claudeMd, /# My own notes/, "hand-written content outside the marker should survive");

    // 5. Remove the registry.
    await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "remove", "example"]);
    assert.deepEqual(listRegistries(), {});

    // 6. With the registry gone, the tool is unknown again - installing it is a no-op,
    // not an error, and nothing reappears. The closest in-CLI equivalent to "the app is
    // torn down and behaves correctly with nothing configured."
    await buildProgram().parseAsync(["node", "ai-toolbox", "install", "changelog-writer"]);
    assert.ok(!fs.existsSync(skillPath), "nothing should install once the registry is gone");
  });

  fs.rmSync(registryDir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});
