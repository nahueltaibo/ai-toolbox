import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProgram } from "../src/cli.js";
import { getFrontmatterVersion } from "../src/skillFrontmatter.js";
import { userSkillsRoot, userClaudeMdPath } from "../src/paths.js";
import { listRegistries } from "../src/config.js";

// Exercises ai-toolbox against a REAL private GitHub repo (nahueltaibo/ai-toolbox-registry),
// to prove the --token-env / private-repo fetch path works against actual GitHub, not just
// a mocked fetch() - registry.test.js and cli.test.js already cover the logic in isolation.
//
// Needs a token with read access to that repo, which most environments won't have, so this
// whole file skips (not fails) without PRIVATE_REGISTRY_TEST_TOKEN set:
//   PRIVATE_REGISTRY_TEST_TOKEN=$(gh auth token) node --test test/privateRegistry.test.js
// In CI: add a PRIVATE_REGISTRY_TEST_TOKEN secret to this repo (a PAT with read access to
// nahueltaibo/ai-toolbox-registry) - test.yml passes it through as this env var when set,
// and the job stays green either way since these tests just skip without it.

const hasToken = Boolean(process.env.PRIVATE_REGISTRY_TEST_TOKEN);
const skip = !hasToken && "set PRIVATE_REGISTRY_TEST_TOKEN (a PAT with read access to nahueltaibo/ai-toolbox-registry) to run this";
const REGISTRY_SPEC = "nahueltaibo/ai-toolbox-registry@main";

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

test("private registry: add, install a skill and a rule, remove both, remove the registry", { skip }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  await withHome(home, async () => {
    await buildProgram().parseAsync([
      "node",
      "ai-toolbox",
      "registry",
      "add",
      "private-test",
      REGISTRY_SPEC,
      "--token-env",
      "PRIVATE_REGISTRY_TEST_TOKEN",
    ]);
    assert.deepEqual(listRegistries(), {
      "private-test": { spec: REGISTRY_SPEC, tokenEnv: "PRIVATE_REGISTRY_TEST_TOKEN" },
    });

    await buildProgram().parseAsync(["node", "ai-toolbox", "install", "hello-world"]);
    const skillPath = path.join(userSkillsRoot(), "hello-world", "SKILL.md");
    assert.ok(fs.existsSync(skillPath), "skill should be installed from the private repo");
    assert.equal(getFrontmatterVersion(fs.readFileSync(skillPath, "utf8")), "1.0.0");

    await buildProgram().parseAsync(["node", "ai-toolbox", "install", "demo-rule"]);
    assert.match(fs.readFileSync(userClaudeMdPath(), "utf8"), /<!-- ai-toolbox:demo-rule:v1\.0\.0:start -->/);

    await buildProgram().parseAsync(["node", "ai-toolbox", "remove", "hello-world"]);
    assert.ok(!fs.existsSync(skillPath));

    await buildProgram().parseAsync(["node", "ai-toolbox", "remove", "demo-rule"]);
    assert.doesNotMatch(fs.readFileSync(userClaudeMdPath(), "utf8"), /demo-rule/);

    await buildProgram().parseAsync(["node", "ai-toolbox", "registry", "remove", "private-test"]);
    assert.deepEqual(listRegistries(), {});
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("private registry: a bad token produces a clear, actionable error naming the env var", { skip }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
  const prevBadToken = process.env.BAD_PRIVATE_REGISTRY_TOKEN;
  process.env.BAD_PRIVATE_REGISTRY_TOKEN = "not-a-real-token";

  await withHome(home, async () => {
    await buildProgram().parseAsync([
      "node",
      "ai-toolbox",
      "registry",
      "add",
      "private-test",
      REGISTRY_SPEC,
      "--token-env",
      "BAD_PRIVATE_REGISTRY_TOKEN",
    ]);

    const lines = [];
    const realError = console.error;
    console.error = (msg) => lines.push(msg);
    try {
      await buildProgram().parseAsync(["node", "ai-toolbox", "list"]);
    } finally {
      console.error = realError;
    }
    assert.ok(
      lines.some((l) => l.includes("GitHub rejected the token in $BAD_PRIVATE_REGISTRY_TOKEN")),
      "should name the specific env var that held the bad token",
    );
  });

  if (prevBadToken === undefined) delete process.env.BAD_PRIVATE_REGISTRY_TOKEN;
  else process.env.BAD_PRIVATE_REGISTRY_TOKEN = prevBadToken;
  fs.rmSync(home, { recursive: true, force: true });
});
