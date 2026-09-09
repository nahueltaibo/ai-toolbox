import { execFileSync } from "node:child_process";
import path from "node:path";

// "git missing" and "not a git repository" are both expected, non-fatal outcomes here - either
// one just means there's no repo-scope target to auto-detect, not that something went wrong.
export function findRepoRoot(override, cwd = process.cwd()) {
  if (override) return override;
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return output ? path.normalize(output) : null;
  } catch {
    return null;
  }
}
