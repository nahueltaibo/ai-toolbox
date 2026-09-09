import fs from "node:fs";
import path from "node:path";

export function readState(stateFile) {
  if (!fs.existsSync(stateFile)) return [];
  const json = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  return Array.isArray(json.installs) ? json.installs : [];
}

export function saveState(stateFile, installs) {
  if (installs.length === 0) {
    if (fs.existsSync(stateFile)) fs.rmSync(stateFile, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ installs }, null, 2), "utf8");
}
