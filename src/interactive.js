import { checkbox, select, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import { renderTable } from "./table.js";
import { promptForRepoRoot } from "./repoPrompt.js";
import { expandScope } from "./scope.js";
import { installTool, removeTool } from "./installer.js";
import { readState } from "./state.js";
import { repoStateFile } from "./paths.js";

const ALL_TOOLS = "__all__";

// Pure - no prompt library involved - so it's testable on its own.
export function resolveToolSelection(selectedValues, tools) {
  if (selectedValues.includes(ALL_TOOLS)) return tools;
  return tools.filter((t) => selectedValues.includes(t.id));
}

export function buildToolChoices(tools) {
  return [{ name: "All tools", value: ALL_TOOLS }, ...tools.map((t) => ({ name: `${t.id} - ${t.description}`, value: t.id }))];
}

// `deps` defaults to the real @inquirer/prompts functions; tests inject canned resolvers instead,
// the direct equivalent of the PS wizard's tests stubbing Read-Host.
export async function runInteractive(ctx, deps = { checkbox, select, confirm, promptForRepoRoot }) {
  console.log(renderTable(ctx.tools, ctx.userState, ctx.repoRoot, ctx.repoState));

  const selectedValues = await deps.checkbox({
    message: "Select tool(s):",
    choices: buildToolChoices(ctx.tools),
  });
  if (selectedValues.length === 0) {
    console.log("Nothing selected.");
    return;
  }
  const selectedTools = resolveToolSelection(selectedValues, ctx.tools);

  const action = await deps.select({
    message: "Action:",
    choices: [
      { name: "Install / update", value: "install" },
      { name: "Remove", value: "remove" },
    ],
  });

  const scopeChoices = [{ name: "User", value: "user" }];
  scopeChoices.push({ name: ctx.repoRoot ? `Repo (${ctx.repoRoot})` : "Repo (enter a path)", value: "repo" });
  scopeChoices.push({ name: "Both", value: "both" });
  const scopeChoice = await deps.select({ message: "Target:", choices: scopeChoices });

  if ((scopeChoice === "repo" || scopeChoice === "both") && !ctx.repoRoot) {
    ctx.repoRoot = await deps.promptForRepoRoot();
    if (!ctx.repoRoot) {
      console.log("Cancelled.");
      return;
    }
    ctx.repoState = readState(repoStateFile(ctx.repoRoot));
  }

  const toolNames = selectedTools.map((t) => t.id).join(", ");
  const scopeWord = scopeChoice;
  console.log("");
  console.log(pc.cyan(`${action === "remove" ? "Remove" : "Install/update"} [${toolNames}] -> ${scopeWord}`));
  const proceed = await deps.confirm({ message: "Proceed?", default: false });
  if (!proceed) {
    console.log("Cancelled.");
    return;
  }

  for (const scopeName of expandScope(scopeChoice)) {
    if (scopeName === "repo" && !ctx.repoRoot) {
      console.log(pc.yellow("  No git repo detected here - skipping repo target"));
      continue;
    }
    for (const tool of selectedTools) {
      if (action === "remove") {
        const result = removeTool(tool, scopeName, ctx);
        if (result.installs) {
          if (scopeName === "user") ctx.userState = result.installs;
          else ctx.repoState = result.installs;
        }
        console.log(pc.yellow(`  Removed ${tool.id} from ${scopeName}`));
      } else {
        const result = await installTool(tool, scopeName, ctx);
        if (result.installs) {
          if (scopeName === "user") ctx.userState = result.installs;
          else ctx.repoState = result.installs;
        }
        console.log(pc.green(`  Installed ${tool.id} v${tool.version} -> ${scopeName}`));
      }
    }
  }

  console.log("");
  console.log(pc.cyan("Done."));
  console.log(renderTable(ctx.tools, ctx.userState, ctx.repoRoot, ctx.repoState));
}
