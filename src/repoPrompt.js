import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { input } from "@inquirer/prompts";

const TILDE_PATTERN = /^~(?:([/\\])(.*))?$/;

// Split out from the prompt so it stays testable without stubbing the prompt library.
export function resolveRepoPath(rawPath) {
  const trimmed = rawPath.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return trimmed;
  const expanded = trimmed.replace(/%([^%]+)%/g, (match, name) => process.env[name] ?? match);

  // No path library does this reliably cross-platform - a naive substitution leaves the
  // '~'-relative remainder in whatever separator style was typed, which is wrong when that's the
  // *other* platform's separator - e.g. '~\code', pasted from a Windows path while on Linux/macOS.
  const tildeMatch = expanded.match(TILDE_PATTERN);
  if (tildeMatch) {
    const rest = tildeMatch[2] ?? "";
    return path.normalize(rest ? path.join(os.homedir(), rest.replace(/\\/g, "/")) : os.homedir());
  }

  return path.normalize(expanded);
}

// Lets the installer target a repo when it wasn't launched from inside one - the normal case for
// an npm-installed CLI run from the home directory. Blank input cancels.
export async function promptForRepoRoot(prompt = input) {
  while (true) {
    const answer = await prompt({ message: "Repo path to install into (blank to cancel):" });
    if (!answer) return null;

    const candidate = resolveRepoPath(answer);
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      console.log(`  Not a directory: ${candidate}`);
      continue;
    }

    const resolved = fs.realpathSync(candidate);
    if (!fs.existsSync(path.join(resolved, ".git"))) {
      console.log(`  Note: ${resolved} is not a git repo root - installing there anyway.`);
    }
    return resolved;
  }
}
