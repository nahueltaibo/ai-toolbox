import { Command } from "commander";
import pc from "picocolors";
import { fetchRegistry, resolveRegistryBase } from "./registry.js";
import { findRepoRoot } from "./git.js";
import { targetFileFor } from "./paths.js";
import { installTool, removeTool } from "./installer.js";
import { getEffectiveInstalledVersion } from "./status.js";
import { renderTable } from "./table.js";
import { runInteractive } from "./interactive.js";
import { expandScope } from "./scope.js";
import { addRegistry, removeRegistry, listRegistries } from "./config.js";

export function buildProgram() {
  const program = new Command();
  program
    .name("ai-toolbox")
    .description("Install personal AI tooling (skills, rules) from the ai-toolbox registry")
    .option("--target-repo <path>", "override repo-scope target instead of auto-detecting the git root")
    .option("--source <path>", "local ai-toolbox checkout to read from instead of GitHub")
    .option(
      "--registry <owner/repo[@branch]>",
      "use only this registry for the command, instead of the merged set of `ai-toolbox registry add`ed ones"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox   # add a registry - this repo's own tools
  $ ai-toolbox interactive
  $ ai-toolbox install output-guidelines
  $ ai-toolbox registry add acme acme/internal-ai-tools           # merge in as many as you want
  $ ai-toolbox registry list`
    )
    // Bare `ai-toolbox` shows what the CLI can do, same as `git`/`npm`/`gh` with no subcommand -
    // it does not launch anything. The picker lives at `ai-toolbox interactive`, opted into by name.
    .action(() => {
      program.help();
    });

  program
    .command("list")
    .description("show the status table and exit")
    .action(async () => {
      const ctx = await loadContext(program.opts());
      console.log(renderTable(ctx.tools, ctx.repoRoot));
    });

  program
    .command("interactive")
    .description("browse the table and pick what to install, update, or remove")
    .action(async () => {
      const ctx = await loadContext(program.opts());
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Not an interactive terminal. Use: ai-toolbox install|remove|update|list <id...>");
        process.exitCode = 1;
        return;
      }
      await runInteractive(ctx);
    });

  program
    .command("install")
    .description("install or update one or more tools")
    .argument("<ids...>", "tool id(s) from the registry")
    .option("--scope <user|repo|both>", "install scope", "user")
    .action(async (ids, opts) => {
      const ctx = await loadContext(program.opts());
      for (const scopeName of expandScope(opts.scope)) {
        for (const id of ids) {
          await applyToOne(ctx, id, scopeName, installOne);
        }
      }
    });

  program
    .command("remove")
    .description("remove one or more tools")
    .argument("<ids...>", "tool id(s) from the registry")
    .option("--scope <user|repo|both>", "removal scope", "user")
    .action(async (ids, opts) => {
      const ctx = await loadContext(program.opts());
      for (const scopeName of expandScope(opts.scope)) {
        for (const id of ids) {
          await applyToOne(ctx, id, scopeName, removeOne);
        }
      }
    });

  program
    .command("update")
    .description("re-install tools at the current registry version (all outdated installed tools if none named)")
    .argument("[ids...]", "tool id(s); omit to update every outdated installed tool")
    .option("--scope <user|repo|both>", "update scope", "user")
    .action(async (ids, opts) => {
      const ctx = await loadContext(program.opts());
      for (const scopeName of expandScope(opts.scope)) {
        const targets = ids.length > 0 ? ids : outdatedIds(ctx, scopeName);
        for (const id of targets) {
          await applyToOne(ctx, id, scopeName, installOne);
        }
      }
    });

  const registryCmd = program
    .command("registry")
    .description("manage registries - every one you add is merged for list/install/update");

  registryCmd
    .command("add <name> <owner/repo[@branch]>")
    .description("save a registry under a name so it's merged in")
    .action((name, spec) => {
      try {
        resolveRegistryBase(spec);
      } catch (err) {
        console.error(pc.red(err.message));
        process.exitCode = 1;
        return;
      }
      addRegistry(name, spec);
      console.log(pc.green(`Added registry "${name}" -> ${spec}`));
    });

  registryCmd
    .command("remove <name>")
    .description("stop merging in a saved registry")
    .action((name) => {
      if (removeRegistry(name)) console.log(pc.yellow(`Removed registry "${name}"`));
      else console.log(pc.yellow(`No registry named "${name}"`));
    });

  registryCmd
    .command("list")
    .description("show every configured registry")
    .action(() => {
      const entries = Object.entries(listRegistries());
      if (entries.length === 0) {
        console.log(pc.dim('No registries configured. Run "ai-toolbox registry add <name> <owner/repo[@branch]>".'));
        return;
      }
      for (const [name, spec] of entries) console.log(`${name}  ${spec}`);
    });

  return program;
}

// Merges every `ai-toolbox registry add`ed registry, unless --source or
// --registry narrows the run to a single one. There's no implicit default -
// a fresh install has nothing configured until `registry add` is run.
// Each returned tool carries the registry it came from (installer.js reads
// tool.registry back out when it fetches that tool's content).
async function resolveTools(globalOpts) {
  if (globalOpts.source) return fetchRegistry(globalOpts.source);

  if (globalOpts.registry) {
    const tools = await fetchRegistry(undefined, globalOpts.registry);
    return tools.map((tool) => ({ ...tool, registry: globalOpts.registry }));
  }

  const configured = Object.entries(listRegistries());
  if (configured.length === 0) {
    console.error(pc.yellow('No registries configured. Run "ai-toolbox registry add <name> <owner/repo[@branch]>" first.'));
    return [];
  }

  const merged = new Map();
  for (const [name, spec] of configured) {
    let tools;
    try {
      tools = await fetchRegistry(undefined, spec);
    } catch (err) {
      console.error(pc.red(`  Skipping registry "${name}": ${err.message}`));
      continue;
    }
    for (const tool of tools) {
      if (merged.has(tool.id)) {
        console.error(pc.yellow(`  Duplicate tool id "${tool.id}" from registry "${name}" - keeping the one already loaded`));
        continue;
      }
      merged.set(tool.id, { ...tool, registry: spec });
    }
  }
  return [...merged.values()];
}

async function loadContext(globalOpts) {
  const tools = await resolveTools(globalOpts);
  const repoRoot = findRepoRoot(globalOpts.targetRepo);
  return { tools, repoRoot, sourceRoot: globalOpts.source };
}

function findTool(ctx, id) {
  const tool = ctx.tools.find((t) => t.id === id);
  if (!tool) console.error(pc.red(`Unknown tool id: ${id}`));
  return tool;
}

async function applyToOne(ctx, id, scopeName, action) {
  const tool = findTool(ctx, id);
  if (!tool) return;
  if (scopeName === "repo" && !ctx.repoRoot) {
    console.log(pc.yellow(`  No git repo detected here - skipping repo ${action.verb} for ${id}`));
    return;
  }
  await action(ctx, tool, scopeName);
}

async function installOne(ctx, tool, scopeName) {
  await installTool(tool, scopeName, ctx);
  console.log(pc.green(`  Installed ${tool.id} v${tool.version} -> ${scopeName}`));
}
installOne.verb = "install";

async function removeOne(ctx, tool, scopeName) {
  removeTool(tool, scopeName, ctx);
  console.log(pc.yellow(`  Removed ${tool.id} from ${scopeName}`));
}
removeOne.verb = "remove";

function outdatedIds(ctx, scopeName) {
  return ctx.tools
    .filter((tool) => {
      const installed = getEffectiveInstalledVersion(tool, targetFileFor(tool, scopeName, ctx.repoRoot));
      return installed && installed !== tool.version;
    })
    .map((tool) => tool.id);
}
