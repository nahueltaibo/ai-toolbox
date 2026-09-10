import Table from "cli-table3";
import pc from "picocolors";
import { targetFileFor } from "./paths.js";
import { getEffectiveInstalledVersion, formatStatus, getStatusColor } from "./status.js";

const DESC_COL_WIDTH = 60;
const COLOR = { gray: pc.gray, yellow: pc.yellow, green: pc.green };

function colorize(status) {
  return COLOR[getStatusColor(status)](status);
}

export function renderTable(tools, repoRoot) {
  // Description gets a fixed width and wraps onto multiple lines instead of being cut
  // off with "..." - the other columns stay auto-sized (null = no fixed width).
  const table = new Table({
    head: ["#", "Name", "Description", "User", "Repo"],
    colWidths: [null, null, DESC_COL_WIDTH, null, null],
    wordWrap: true,
  });

  tools.forEach((tool, i) => {
    const userStatus = formatStatus(getEffectiveInstalledVersion(tool, targetFileFor(tool, "user", repoRoot)), tool);
    const repoStatus = repoRoot
      ? formatStatus(getEffectiveInstalledVersion(tool, targetFileFor(tool, "repo", repoRoot)), tool)
      : "-";

    table.push([String(i + 1), tool.id, tool.description, colorize(userStatus), colorize(repoStatus)]);
  });

  let output = "";
  if (repoRoot) output += `${pc.gray(`Repo: ${repoRoot}`)}\n\n`;
  output += table.toString();
  return output;
}
