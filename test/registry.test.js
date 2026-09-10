import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchText, fetchRegistry, resolveRegistryBase, isLocalRegistry, resolveLocalRegistryPath, validateRegistrySpec, linkFor } from "../src/registry.js";

async function withMockFetch(mockFetch, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// token null/undefined tests the no-token path, overriding any GITHUB_TOKEN set in the
// real shell (e.g. from `gh auth login`) so that case doesn't leak into the test.
async function withGitHubToken(token, fn) {
  const prev = process.env.GITHUB_TOKEN;
  if (token == null) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = token;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = prev;
  }
}

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

test("isLocalRegistry recognizes absolute paths, ./, and ~/ as local", () => {
  assert.equal(isLocalRegistry(path.resolve("some", "dir")), true);
  assert.equal(isLocalRegistry("./my-registry"), true);
  assert.equal(isLocalRegistry("~/my-registry"), true);
});

test("isLocalRegistry treats owner/repo specs as not local", () => {
  assert.equal(isLocalRegistry("acme/tools"), false);
  assert.equal(isLocalRegistry("acme/tools@release"), false);
  assert.equal(isLocalRegistry(undefined), false);
});

test("resolveLocalRegistryPath expands ~ to the home directory", () => {
  assert.equal(resolveLocalRegistryPath("~/my-registry"), path.join(os.homedir(), "my-registry"));
});

test("resolveLocalRegistryPath resolves a relative path against the cwd", () => {
  assert.equal(resolveLocalRegistryPath("./my-registry"), path.resolve("./my-registry"));
});

test("validateRegistrySpec returns a GitHub spec unchanged", () => {
  assert.equal(validateRegistrySpec("acme/tools@release"), "acme/tools@release");
});

test("validateRegistrySpec rejects a malformed GitHub spec with a message showing both accepted shapes", () => {
  assert.throws(
    () => validateRegistrySpec("not-a-repo"),
    /Invalid registry "not-a-repo" - expected <owner>\/<repo>\[@branch\].*or a local folder path/s,
  );
});

test("validateRegistrySpec resolves an existing local directory to an absolute path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  assert.equal(validateRegistrySpec(dir), path.resolve(dir));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("validateRegistrySpec rejects a local path that doesn't exist, explaining why it was read as local", () => {
  const missing = path.join(os.tmpdir(), "ai-toolbox-does-not-exist-" + Date.now());
  assert.throws(
    () => validateRegistrySpec(missing),
    /Local registry path not found.*was read as a local path.*For a GitHub registry instead, use <owner>\/<repo>/s,
  );
});

test("validateRegistrySpec rejects a local path that exists but isn't a folder", () => {
  const file = path.join(os.tmpdir(), "ai-toolbox-not-a-dir-" + Date.now());
  fs.writeFileSync(file, "not a directory", "utf8");
  assert.throws(() => validateRegistrySpec(file), /Local registry path is not a folder/);
  fs.rmSync(file, { force: true });
});

test("fetchText reads a file relative to a local registry spec, not just sourceRoot", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  fs.writeFileSync(path.join(dir, "hello.txt"), "hello from a local registry", "utf8");
  assert.equal(await fetchText("hello.txt", undefined, dir), "hello from a local registry");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fetchRegistry reads registry.json from a local registry spec", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-fixture-"));
  fs.writeFileSync(
    path.join(dir, "registry.json"),
    JSON.stringify({ tools: [{ id: "local-tool", type: "skill", version: "1.0.0", description: "d", path: "x" }] }),
    "utf8",
  );
  const tools = await fetchRegistry(undefined, dir);
  assert.deepEqual(tools, [{ id: "local-tool", type: "skill", version: "1.0.0", description: "d", path: "x" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fetchText without GITHUB_TOKEN hits raw.githubusercontent.com, unauthenticated", async () => {
  let calledUrl, calledOpts;
  const mockFetch = async (url, opts) => {
    calledUrl = url;
    calledOpts = opts;
    return { ok: true, text: async () => "public content" };
  };
  await withGitHubToken(null, () =>
    withMockFetch(mockFetch, async () => {
      const text = await fetchText("registry.json", undefined, "acme/tools@release");
      assert.equal(text, "public content");
    }),
  );
  assert.equal(calledUrl, "https://raw.githubusercontent.com/acme/tools/release/registry.json");
  assert.equal(calledOpts, undefined);
});

test("fetchText with GITHUB_TOKEN uses the authenticated Contents API instead", async () => {
  let calledUrl, calledOpts;
  const mockFetch = async (url, opts) => {
    calledUrl = url;
    calledOpts = opts;
    return { ok: true, text: async () => "private content" };
  };
  await withGitHubToken("test-token-123", () =>
    withMockFetch(mockFetch, async () => {
      const text = await fetchText("registry.json", undefined, "acme/private-tools@release");
      assert.equal(text, "private content");
    }),
  );
  assert.equal(calledUrl, "https://api.github.com/repos/acme/private-tools/contents/registry.json?ref=release");
  assert.equal(calledOpts.headers.Authorization, "Bearer test-token-123");
  assert.equal(calledOpts.headers.Accept, "application/vnd.github.v3.raw");
});

test("fetchText surfaces a non-ok GitHub response as an error", async () => {
  const mockFetch = async () => ({ ok: false, status: 404 });
  await withGitHubToken(null, () =>
    withMockFetch(mockFetch, async () => {
      await assert.rejects(() => fetchText("registry.json", undefined, "acme/tools"), /Failed to fetch registry\.json: 404/);
    }),
  );
});

test("fetchText reads the token from a custom env var name when the registry has one", async () => {
  const prev = process.env.ACME_TOKEN;
  process.env.ACME_TOKEN = "custom-token-456";
  let calledOpts;
  const mockFetch = async (url, opts) => {
    calledOpts = opts;
    return { ok: true, text: async () => "content" };
  };
  try {
    await withGitHubToken(null, () =>
      withMockFetch(mockFetch, () => fetchText("registry.json", undefined, "acme/private-tools", "ACME_TOKEN")),
    );
  } finally {
    if (prev === undefined) delete process.env.ACME_TOKEN;
    else process.env.ACME_TOKEN = prev;
  }
  assert.equal(calledOpts.headers.Authorization, "Bearer custom-token-456");
});

test("fetchText gives a clear, actionable error on a 401/403 - names the env var, suggests renewing it", async () => {
  const mockFetch = async () => ({ ok: false, status: 401 });
  await withGitHubToken("stale-token", () =>
    withMockFetch(mockFetch, async () => {
      await assert.rejects(
        () => fetchText("registry.json", undefined, "acme/private-tools", "GITHUB_TOKEN"),
        /GitHub rejected the token in \$GITHUB_TOKEN \(401\).*expired, revoked, or missing access to "acme\/private-tools".*Generate a new token, update \$GITHUB_TOKEN/s,
      );
    }),
  );
});

test("linkFor points at a GitHub blob URL for a GitHub registry", () => {
  assert.equal(
    linkFor("rules/output-guidelines/CONTENT.md", undefined, "acme/tools@release"),
    "https://github.com/acme/tools/blob/release/rules/output-guidelines/CONTENT.md",
  );
});

test("linkFor points at a file:// URL for a local registry", () => {
  const registryDir = path.resolve(os.tmpdir(), "ai-toolbox-registry");
  const link = linkFor("skills/demo/SKILL.md", undefined, registryDir);
  assert.equal(link, pathToFileURL(path.join(registryDir, "skills/demo/SKILL.md")).href);
});

test("linkFor prefers sourceRoot over a registry spec, matching fetchText", () => {
  const registryDir = path.resolve(os.tmpdir(), "ai-toolbox-registry");
  const link = linkFor("skills/demo/SKILL.md", registryDir, "acme/tools");
  assert.ok(link.startsWith("file://"), "sourceRoot should win, not the GitHub spec");
});
