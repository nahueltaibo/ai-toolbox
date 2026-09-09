import Table from "cli-table3";
import pc from "picocolors";
import { targetFileFor } from "./paths.js";
import { getEffectiveInstalledVersion, formatStatus, getStatusColor } from "./status.js";

const MAX_DESC_WIDTH = 55;
const COLOR = { gray: pc.gray, yellow: pc.yellow, green: pc.green };

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function colorize(status) {
  return COLOR[getStatusColor(status)](status);
}

export function renderTable(tools, repoRoot) {
  const table = new Table({ head: ["#", "Name", "Description", "User", "Repo"] });

  tools.forEach((tool, i) => {
    const userStatus = formatStatus(getEffectiveInstalledVersion(tool, targetFileFor(tool, "user", repoRoot)), tool);
    const repoStatus = repoRoot
      ? formatStatus(getEffectiveInstalledVersion(tool, targetFileFor(tool, "repo", repoRoot)), tool)
      : "-";

    table.push([
      String(i + 1),
      tool.id,
      truncate(tool.description, MAX_DESC_WIDTH),
      colorize(userStatus),
      colorize(repoStatus),
    ]);
  });

  let output = "";
  if (repoRoot) output += `${pc.gray(`Repo: ${repoRoot}`)}\n\n`;
  output += table.toString();
  return output;
}
