import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readState, saveState } from "../src/state.js";

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-state-"));
  return path.join(dir, "ai-toolbox-installed.json");
}

test("readState returns an empty array when the file doesn't exist", () => {
  assert.deepEqual(readState("/nonexistent/ai-toolbox-installed.json"), []);
});

test("writes and reads back installed entries", () => {
  const file = tmpFile();
  const installs = [{ id: "foo", version: "1.0.0", scope: "user" }];
  saveState(file, installs);
  assert.deepEqual(readState(file), installs);
});

test("deletes the state file instead of writing an empty installs array", () => {
  const file = tmpFile();
  saveState(file, [{ id: "foo", version: "1.0.0", scope: "user" }]);
  assert.ok(fs.existsSync(file));
  saveState(file, []);
  assert.ok(!fs.existsSync(file));
});

test("saveState creates the parent directory if it doesn't exist yet", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-toolbox-state-"));
  const file = path.join(dir, "nested", "ai-toolbox-installed.json");
  saveState(file, [{ id: "foo", version: "1.0.0", scope: "user" }]);
  assert.ok(fs.existsSync(file));
});
