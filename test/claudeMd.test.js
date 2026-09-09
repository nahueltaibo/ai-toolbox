import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setSection, removeSection, getSectionVersion } from "../src/claudeMd.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-claudemd-"));
  return path.join(dir, "CLAUDE.md");
}

test("setSection writes a fresh block when the file doesn't exist", () => {
  const target = tmpFile();
  setSection(target, { id: "foo", version: "1.0.0" }, "Body text.");
  const content = fs.readFileSync(target, "utf8");
  assert.match(content, /<!-- ai-framework:foo:v1\.0\.0:start -->\nBody text\.\n<!-- ai-framework:foo:end -->\n/);
});

test("setSection appends to existing hand-written content", () => {
  const target = tmpFile();
  fs.writeFileSync(target, "# My notes\n\nSome hand-written content.\n", "utf8");
  setSection(target, { id: "foo", version: "1.0.0" }, "Body text.");
  const content = fs.readFileSync(target, "utf8");
  assert.match(content, /^# My notes\n\nSome hand-written content\.\n\n<!-- ai-framework:foo/);
});

test("setSection replaces an existing block in place, leaving surrounding content intact", () => {
  const target = tmpFile();
  fs.writeFileSync(
    target,
    "before\n\n<!-- ai-framework:foo:v1.0.0:start -->\nold body\n<!-- ai-framework:foo:end -->\n\nafter\n",
    "utf8",
  );
  setSection(target, { id: "foo", version: "2.0.0" }, "new body");
  const content = fs.readFileSync(target, "utf8");
  assert.match(content, /^before\n\n<!-- ai-framework:foo:v2\.0\.0:start -->\nnew body\n<!-- ai-framework:foo:end -->\n\nafter\n/);
});

test("setSection treats a literal '$' in the injected body as a literal string, not a regex backreference", () => {
  const target = tmpFile();
  fs.writeFileSync(target, "<!-- ai-framework:foo:v1.0.0:start -->\nold\n<!-- ai-framework:foo:end -->\n", "utf8");
  setSection(target, { id: "foo", version: "2.0.0" }, "costs $1 not a backreference");
  const content = fs.readFileSync(target, "utf8");
  assert.match(content, /costs \$1 not a backreference/);
});

test("getSectionVersion reads the version out of the start marker", () => {
  const content = "<!-- ai-framework:foo:v1.2.3:start -->\nbody\n<!-- ai-framework:foo:end -->\n";
  assert.equal(getSectionVersion(content, "foo"), "1.2.3");
});

test("getSectionVersion returns null when there's no marker for that id", () => {
  assert.equal(getSectionVersion("nothing here", "foo"), null);
});

test("removeSection deletes the block and leaves the rest of the file intact", () => {
  const target = tmpFile();
  fs.writeFileSync(
    target,
    "before\n\n<!-- ai-framework:foo:v1.0.0:start -->\nbody\n<!-- ai-framework:foo:end -->\n\nafter\n",
    "utf8",
  );
  removeSection(target, "foo");
  const content = fs.readFileSync(target, "utf8");
  assert.equal(content, "before\n\nafter\n");
});

test("removeSection is a no-op when the file has no matching block", () => {
  const target = tmpFile();
  fs.writeFileSync(target, "untouched\n", "utf8");
  removeSection(target, "foo");
  assert.equal(fs.readFileSync(target, "utf8"), "untouched\n");
});

test("removeSection is a no-op when the file doesn't exist", () => {
  removeSection("/nonexistent/CLAUDE.md", "foo");
});

test("round-trips a non-ASCII character through setSection without corruption", () => {
  const target = tmpFile();
  setSection(target, { id: "foo", version: "1.0.0" }, "café — emdash");
  const content = fs.readFileSync(target, "utf8");
  assert.match(content, /café — emdash/);
});

test("writes without a UTF-8 BOM", () => {
  const target = tmpFile();
  setSection(target, { id: "foo", version: "1.0.0" }, "body");
  const bytes = fs.readFileSync(target);
  assert.notEqual(bytes[0], 0xef);
});
