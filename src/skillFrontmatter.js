import { parse, stringify } from "yaml";

// Mirrors claudeMd.js's marker approach for the other tool type: the version lives in the
// installed artifact itself, not in a side-car state file. `metadata` is the one frontmatter field
// the Agent Skills spec reserves for a tool's own data - Claude Code ignores it, and unlike a bare
// top-level key, it won't hard-error if this SKILL.md is ever uploaded to claude.ai or the Skills API.
const VERSION_KEY = "ai-toolbox-version";
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function splitFrontmatter(content) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return null;
  return { data: parse(match[1]) ?? {}, body: match[2] };
}

export function getFrontmatterVersion(content) {
  const parsed = splitFrontmatter(content);
  return parsed?.data?.metadata?.[VERSION_KEY] ?? null;
}

export function setFrontmatterVersion(content, version) {
  const parsed = splitFrontmatter(content);
  if (!parsed) return content; // no frontmatter block to stamp - leave the file untouched rather than guess its shape
  const data = { ...parsed.data, metadata: { ...parsed.data.metadata, [VERSION_KEY]: version } };
  // lineWidth: 0 disables auto-wrapping - keeps a long `description` on one line instead of
  // reflowing it, so re-stamping the version doesn't reformat text a human authored.
  return `---\n${stringify(data, { lineWidth: 0 })}---\n${parsed.body}`;
}
