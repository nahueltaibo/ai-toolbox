import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configPath, readConfig, listRegistries, addRegistry, removeRegistry, normalizeRegistryEntry } from "../src/config.js";

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

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-home-"));
}

test("readConfig returns no registries when the config file doesn't exist", async () => {
  const home = makeHome();
  await withHome(home, () => {
    assert.deepEqual(readConfig(), { registries: {} });
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("readConfig returns no registries when the config file is corrupt", async () => {
  const home = makeHome();
  await withHome(home, () => {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), "not json", "utf8");
    assert.deepEqual(readConfig(), { registries: {} });
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("addRegistry persists a named registry, listRegistries reads it back", async () => {
  const home = makeHome();
  await withHome(home, () => {
    addRegistry("acme", "acme/tools@release");
    assert.deepEqual(listRegistries(), { acme: "acme/tools@release" });
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("addRegistry overwrites an existing name", async () => {
  const home = makeHome();
  await withHome(home, () => {
    addRegistry("acme", "acme/tools@main");
    addRegistry("acme", "acme/tools@release");
    assert.deepEqual(listRegistries(), { acme: "acme/tools@release" });
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("removeRegistry deletes a saved registry and reports whether it existed", async () => {
  const home = makeHome();
  await withHome(home, () => {
    addRegistry("acme", "acme/tools@main");
    assert.equal(removeRegistry("acme"), true);
    assert.deepEqual(listRegistries(), {});
    assert.equal(removeRegistry("acme"), false);
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("addRegistry with a tokenEnv persists an object instead of a plain string", async () => {
  const home = makeHome();
  await withHome(home, () => {
    addRegistry("acme", "acme/private-tools", { tokenEnv: "ACME_GH_TOKEN" });
    assert.deepEqual(listRegistries(), { acme: { spec: "acme/private-tools", tokenEnv: "ACME_GH_TOKEN" } });
  });
  fs.rmSync(home, { recursive: true, force: true });
});

test("normalizeRegistryEntry handles both the plain-string and the {spec,tokenEnv} shape", () => {
  assert.deepEqual(normalizeRegistryEntry("acme/tools"), { spec: "acme/tools", tokenEnv: undefined });
  assert.deepEqual(normalizeRegistryEntry({ spec: "acme/private-tools", tokenEnv: "ACME_GH_TOKEN" }), {
    spec: "acme/private-tools",
    tokenEnv: "ACME_GH_TOKEN",
  });
});
