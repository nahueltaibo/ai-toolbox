import fs from "node:fs";
import path from "node:path";

// Instructions-type tools live as a marker-delimited block inside CLAUDE.md rather than a standalone
// file, so multiple entries (and the user's own notes) can share one file. The version rides in the
// start marker itself - the file is the source of truth, not the separate install-state JSON - so
// staleness is detectable even if that file was hand-copied or committed without the state file.
export function sectionPattern(id) {
  const escaped = escapeRegExp(id);
  // Global flag matches .NET's [regex]::Replace, which replaces every match, not just the first.
  return new RegExp(`<!-- ai-framework:${escaped}:v\\S+:start -->[\\s\\S]*?<!-- ai-framework:${escaped}:end -->`, "g");
}

export function getSectionVersion(content, id) {
  const match = content.match(new RegExp(`<!-- ai-framework:${escapeRegExp(id)}:v(\\S+):start -->`));
  return match ? match[1] : null;
}

export function buildSectionBlock(tool, body) {
  const start = `<!-- ai-framework:${tool.id}:v${tool.version}:start -->`;
  const end = `<!-- ai-framework:${tool.id}:end -->`;
  return `${start}\n${body.trim()}\n${end}`;
}

export function setSection(targetFile, tool, body) {
  const block = buildSectionBlock(tool, body);
  const existing = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, "utf8") : "";
  const pattern = sectionPattern(tool.id);

  let updated;
  if (pattern.test(existing)) {
    // A function replacer, unlike a string replacer, never treats '$1' etc. in the injected
    // body as a backreference - no need for the PS version's '$'-doubling workaround.
    updated = existing.replace(pattern, () => block);
  } else if (existing.trim().length > 0) {
    updated = `${existing.trimEnd()}\n\n${block}\n`;
  } else {
    updated = `${block}\n`;
  }

  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, updated, "utf8");
}

export function removeSection(targetFile, id) {
  if (!fs.existsSync(targetFile)) return;
  const existing = fs.readFileSync(targetFile, "utf8");
  const pattern = sectionPattern(id);
  if (!pattern.test(existing)) return;

  let updated = existing.replace(pattern, "");
  updated = updated.replace(/(\r?\n){3,}/g, "\n\n").trim();
  if (updated.length > 0) updated += "\n";
  fs.writeFileSync(targetFile, updated, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
