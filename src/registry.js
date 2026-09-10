import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
// a token, so GITHUB_TOKEN (the same env var `gh` and GitHub Actions use) switches to that
// path. Unauthenticated requests keep using the raw host, unaffected by the API's much
// lower rate limit.
async function fetchFromGitHub(registrySpec, relativePath) {
  const token = process.env.GITHUB_TOKEN;
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
  if (!response.ok) throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
  return response.text();
}

export async function fetchText(relativePath, sourceRoot, registry) {
  const localRoot = sourceRoot || (isLocalRegistry(registry) ? registry : null);
  if (localRoot) {
    const filePath = path.join(localRoot, relativePath);
    if (!fs.existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf8");
  }
  return fetchFromGitHub(registry, relativePath);
}

export async function fetchRegistry(sourceRoot, registry) {
  const text = await fetchText("registry.json", sourceRoot, registry);
  const parsed = JSON.parse(text);
  return parsed.tools ?? [];
}
