import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchText, fetchRegistry, resolveRegistryBase } from "../src/registry.js";

test("fetchText reads a file relative to sourceRoot", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  fs.writeFileSync(path.join(dir, "hello.txt"), "hello world", "utf8");
  assert.equal(await fetchText("hello.txt", dir), "hello world");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fetchText throws when the file doesn't exist under sourceRoot", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  await assert.rejects(() => fetchText("missing.txt", dir), /Not found/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fetchRegistry reads and parses registry.json from a local source", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  fs.writeFileSync(
    path.join(dir, "registry.json"),
    JSON.stringify({ tools: [{ id: "foo", type: "skill", version: "1.0.0", description: "d", path: "x" }] }),
    "utf8",
  );
  const tools = await fetchRegistry(dir);
  assert.deepEqual(tools, [{ id: "foo", type: "skill", version: "1.0.0", description: "d", path: "x" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveRegistryBase rejects an empty spec - there's no implicit default", () => {
  assert.throws(() => resolveRegistryBase(undefined), /Invalid registry/);
});

test("resolveRegistryBase accepts owner/repo and defaults branch to main", () => {
  assert.equal(resolveRegistryBase("acme/tools"), "https://raw.githubusercontent.com/acme/tools/main");
});

test("resolveRegistryBase accepts an explicit @branch", () => {
  assert.equal(
    resolveRegistryBase("acme/tools@release"),
    "https://raw.githubusercontent.com/acme/tools/release",
  );
});

test("resolveRegistryBase rejects a spec without owner/repo", () => {
  assert.throws(() => resolveRegistryBase("not-a-repo"), /Invalid registry/);
});
