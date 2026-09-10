import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REGISTRY_RE = /^([^/@\s]+\/[^/@\s]+)(?:@([^\s]+))?$/;

// A registry spec is either <owner>/<repo>[@branch] (fetched from GitHub) or a local
// filesystem path (absolute, or starting with "." or "~") read straight off disk -
// no owner/repo string ever starts with any of those, so this is unambiguous.
export function isLocalRegistry(spec) {
  if (!spec) return false;
  return spec.startsWith("~") || spec.startsWith(".") || path.isAbsolute(spec);
}

function expandHome(spec) {
  return spec.startsWith("~") ? path.join(os.homedir(), spec.slice(1)) : spec;
}

// Pins a local registry spec to an absolute path. Called once, at `registry add` time,
// so a relative path is resolved against the cwd it was added from rather than drifting
// with whatever directory a later command happens to run from.
export function resolveLocalRegistryPath(spec) {
  return path.resolve(expandHome(spec));
}

// Exported for testing. Parses a GitHub <owner>/<repo>[@branch] spec into its parts -
// shared by the unauthenticated raw.githubusercontent.com path and the authenticated
// api.github.com one, which need the same owner/repo/branch but build different URLs.
export function parseGitHubSpec(registrySpec) {
  const match = REGISTRY_RE.exec(registrySpec || "");
  if (!match) {
    throw new Error(
      `Invalid registry "${registrySpec}" - expected <owner>/<repo>[@branch], e.g. "acme/internal-ai-tools" or ` +
        `"acme/internal-ai-tools@beta", or a local folder path (absolute, or starting with "." or "~").`
    );
  }
  const [, repo, branch = "main"] = match;
  return { repo, branch };
}

// Exported for testing. Resolves a GitHub <owner>/<repo>[@branch] spec into the
// raw.githubusercontent.com base to fetch from. No implicit default - every
// registry the CLI talks to is one the user explicitly added.
export function resolveRegistryBase(registrySpec) {
  const { repo, branch } = parseGitHubSpec(registrySpec);
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

// Validates a spec before it's persisted by `registry add`. Throws for a malformed
// GitHub spec or a local path that doesn't exist. Returns the spec to save - a local
// path comes back resolved to absolute, a GitHub spec comes back unchanged.
export function validateRegistrySpec(spec) {
  if (isLocalRegistry(spec)) {
    const resolved = resolveLocalRegistryPath(spec);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `Local registry path not found: ${resolved}\n` +
          `("${spec}" was read as a local path - absolute paths and paths starting with "." or "~" always are. ` +
          `For a GitHub registry instead, use <owner>/<repo>[@branch], e.g. "acme/internal-ai-tools".)`
      );
    }
    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error(`Local registry path is not a folder: ${resolved}`);
    }
    return resolved;
  }
  resolveRegistryBase(spec);
  return spec;
}

// raw.githubusercontent.com is unauthenticated and only ever serves public repos - fine,
// and preferred, for the common case. A private repo needs the Contents API instead, with
// a token - tokenEnvName names the env var to read it from, GITHUB_TOKEN (the same one
// `gh` and GitHub Actions use) by default, but a registry can be configured with its own
// (`registry add ... --token-env`) so different private registries can use different
// tokens in the same run. Unauthenticated requests keep using the raw host, unaffected by
// the API's much lower rate limit.
async function fetchFromGitHub(registrySpec, relativePath, tokenEnvName = "GITHUB_TOKEN") {
  const token = process.env[tokenEnvName];
  if (!token) {
    const base = resolveRegistryBase(registrySpec);
    const response = await fetch(`${base}/${relativePath}`);
    if (!response.ok) throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
    return response.text();
  }

  const { repo, branch } = parseGitHubSpec(registrySpec);
  const url = `https://api.github.com/repos/${repo}/contents/${relativePath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3.raw" },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `GitHub rejected the token in $${tokenEnvName} (${response.status}) while fetching ${relativePath} - ` +
        `it looks expired, revoked, or missing access to "${repo}". Generate a new token, update $${tokenEnvName}, and try again.`
    );
  }
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
  return response.text();
}

function resolveLocalRoot(sourceRoot, registry) {
  return sourceRoot || (isLocalRegistry(registry) ? registry : null);
}

export async function fetchText(relativePath, sourceRoot, registry, tokenEnvName) {
  const localRoot = resolveLocalRoot(sourceRoot, registry);
  if (localRoot) {
    const filePath = path.join(localRoot, relativePath);
    if (!fs.existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf8");
  }
  return fetchFromGitHub(registry, relativePath, tokenEnvName);
}

export async function fetchRegistry(sourceRoot, registry, tokenEnvName) {
  const text = await fetchText("registry.json", sourceRoot, registry, tokenEnvName);
  const parsed = JSON.parse(text);
  return parsed.tools ?? [];
}

// A link the user can open with whatever they already have - no fetch, no temp file,
// no guessing which app to launch. A local registry (or a --source run) points straight
// at the file already on disk via a file:// URL; a GitHub registry points at the repo's
// own blob view, which renders markdown nicely and respects the viewer's own GitHub
// session for a private repo (nothing to do with the CLI's own GITHUB_TOKEN).
export function linkFor(relativePath, sourceRoot, registry) {
  const localRoot = resolveLocalRoot(sourceRoot, registry);
  if (localRoot) return pathToFileURL(path.join(localRoot, relativePath)).href;

  const { repo, branch } = parseGitHubSpec(registry);
  return `https://github.com/${repo}/blob/${branch}/${relativePath}`;
}
