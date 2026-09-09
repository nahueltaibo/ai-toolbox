import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function configPath() {
  return path.join(os.homedir(), ".ai-toolbox", "config.json");
}

// Missing or corrupt config reads back as no registries configured, rather
// than throwing - a fresh install and a hand-edited-bad file behave the same.
export function readConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) return { registries: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { registries: parsed.registries ?? {} };
  } catch {
    return { registries: {} };
  }
}

function writeConfig(config) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function listRegistries() {
  return readConfig().registries;
}

export function addRegistry(name, spec) {
  const config = readConfig();
  config.registries[name] = spec;
  writeConfig(config);
}

export function removeRegistry(name) {
  const config = readConfig();
  const existed = name in config.registries;
  delete config.registries[name];
  writeConfig(config);
  return existed;
}
