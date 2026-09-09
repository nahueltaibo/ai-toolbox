import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatStatus, getStatusColor, getEffectiveInstalledVersion } from "../src/status.js";

test("formatStatus reports 'not installed' when there's no version", () => {
  assert.equal(formatStatus(null, { version: "1.0.0" }), "not installed");
});

test("formatStatus reports the exact version when up to date", () => {
  assert.equal(formatStatus("1.0.0", { version: "1.0.0" }), "v1.0.0");
});

test("formatStatus reports an upgrade arrow when outdated", () => {
  assert.equal(formatStatus("1.0.0", { version: "1.1.0" }), "v1.0.0 -> v1.1.0");
});

test("getStatusColor colors 'not installed' and '-' gray", () => {
  assert.equal(getStatusColor("not installed"), "gray");
  assert.equal(getStatusColor("-"), "gray");
});

test("getStatusColor colors an update-available string yellow", () => {
  assert.equal(getStatusColor("v1.0.0 -> v1.1.0"), "yellow");
});

test("getStatusColor colors an up-to-date version green", () => {
  assert.equal(getStatusColor("v1.0.0"), "green");
});

test("getEffectiveInstalledVersion reads a skill's version from its own frontmatter metadata", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-status-"));
  const target = path.join(dir, "SKILL.md");
  fs.writeFileSync(target, "---\nname: foo\nmetadata:\n  ai-toolbox-version: 2.0.0\n---\nbody\n", "utf8");
  const tool = { id: "foo", type: "skill" };
  assert.equal(getEffectiveInstalledVersion(tool, target), "2.0.0");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("getEffectiveInstalledVersion returns null for a skill with no frontmatter metadata yet", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-status-"));
  const target = path.join(dir, "SKILL.md");
  fs.writeFileSync(target, "---\nname: foo\n---\nbody\n", "utf8");
  assert.equal(getEffectiveInstalledVersion({ id: "foo", type: "skill" }, target), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("getEffectiveInstalledVersion reads a rules tool's version from the CLAUDE.md marker", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-status-"));
  const target = path.join(dir, "CLAUDE.md");
  fs.writeFileSync(target, "<!-- ai-toolbox:foo:v3.0.0:start -->\nbody\n<!-- ai-toolbox:foo:end -->\n", "utf8");
  const tool = { id: "foo", type: "rules" };
  assert.equal(getEffectiveInstalledVersion(tool, target), "3.0.0");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("getEffectiveInstalledVersion returns null when the target file doesn't exist", () => {
  assert.equal(getEffectiveInstalledVersion({ id: "foo", type: "skill" }, "/nonexistent/SKILL.md"), null);
  assert.equal(getEffectiveInstalledVersion({ id: "foo", type: "rules" }, "/nonexistent/CLAUDE.md"), null);
});

test("getEffectiveInstalledVersion returns null when no target file is known (e.g. no repo)", () => {
  assert.equal(getEffectiveInstalledVersion({ id: "foo", type: "skill" }, null), null);
});
