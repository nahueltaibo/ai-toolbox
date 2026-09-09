import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getInstalledVersion, formatStatus, getStatusColor, getEffectiveInstalledVersion } from "../src/status.js";

test("getInstalledVersion returns null when there's no matching entry", () => {
  assert.equal(getInstalledVersion([], "foo"), null);
});

test("getInstalledVersion returns the recorded version for a matching entry", () => {
  assert.equal(getInstalledVersion([{ id: "foo", version: "1.0.0" }], "foo"), "1.0.0");
});

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

test("getEffectiveInstalledVersion reads a skill's version from the state array", () => {
  const tool = { id: "foo", type: "skill" };
  assert.equal(getEffectiveInstalledVersion(tool, [{ id: "foo", version: "2.0.0" }], null), "2.0.0");
});

test("getEffectiveInstalledVersion reads an instructions tool's version from the CLAUDE.md marker, not the state array", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-status-"));
  const target = path.join(dir, "CLAUDE.md");
  fs.writeFileSync(
    target,
    "<!-- ai-framework:foo:v3.0.0:start -->\nbody\n<!-- ai-framework:foo:end -->\n",
    "utf8",
  );
  const tool = { id: "foo", type: "instructions" };
  // State array deliberately disagrees - the marker in the file must win.
  assert.equal(getEffectiveInstalledVersion(tool, [{ id: "foo", version: "1.0.0" }], target), "3.0.0");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("getEffectiveInstalledVersion returns null for an instructions tool when the target file doesn't exist", () => {
  const tool = { id: "foo", type: "instructions" };
  assert.equal(getEffectiveInstalledVersion(tool, [], "/nonexistent/CLAUDE.md"), null);
});
