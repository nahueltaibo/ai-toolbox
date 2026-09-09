import fs from "node:fs";
import path from "node:path";
import untildify from "untildify";
import { input } from "@inquirer/prompts";

// Split out from the prompt so it stays testable without stubbing the prompt library.
export function resolveRepoPath(rawPath) {
  const trimmed = rawPath.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return trimmed;
  const expanded = trimmed.replace(/%([^%]+)%/g, (match, name) => process.env[name] ?? match);
  return path.normalize(untildify(expanded));
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
