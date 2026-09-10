import pc from "picocolors";
import { fetchRegistry, linkFor } from "./registry.js";
import { findRepoRoot } from "./git.js";
import { targetFileFor } from "./paths.js";
import { installTool, removeTool } from "./installer.js";
import { getEffectiveInstalledVersion } from "./status.js";
import { listRegistries, normalizeRegistryEntry } from "./config.js";
import { printNoRegistriesHint } from "./hints.js";

// Use-case layer shared by the command-line interface (cli.js) and the interactive
// picker (interactive.js), so installing/removing a tool prints the same way from
// either one instead of each reimplementing it.

// Merges every `ai-toolbox registry add`ed registry, unless --source or
// --registry narrows the run to a single one. There's no implicit default -
// a fresh install has nothing configured until `registry add` is run.
// Each returned tool carries the registry it came from, and the env var (if any) that
// holds a token for it, so installer.js/viewOne know how to re-fetch its content later.
export async function resolveTools(globalOpts) {
  if (globalOpts.source) return fetchRegistry(globalOpts.source);

  // A one-off --registry override has no way to name a custom token env var (that's a
  // per-saved-registry setting, via `registry add --token-env`) - it falls back to the
  // GITHUB_TOKEN default same as always.
  if (globalOpts.registry) {
    const tools = await fetchRegistry(undefined, globalOpts.registry);
    return tools.map((tool) => ({ ...tool, registry: globalOpts.registry }));
  }

  const configured = Object.entries(listRegistries());
  if (configured.length === 0) {
    printNoRegistriesHint();
    return [];
  }

  const merged = new Map();
  for (const [name, entry] of configured) {
    const { spec, tokenEnv } = normalizeRegistryEntry(entry);
    let tools;
    try {
      tools = await fetchRegistry(undefined, spec, tokenEnv);
    } catch (err) {
      console.error(pc.red(`  Skipping registry "${name}": ${err.message}`));
      continue;
    }
    for (const tool of tools) {
      if (merged.has(tool.id)) {
        console.error(pc.yellow(`  Duplicate tool id "${tool.id}" from registry "${name}" - keeping the one already loaded`));
        continue;
      }
      merged.set(tool.id, { ...tool, registry: spec, registryTokenEnv: tokenEnv });
    }
  }
  return [...merged.values()];
}

export async function loadContext(globalOpts) {
  const tools = await resolveTools(globalOpts);
  const repoRoot = findRepoRoot(globalOpts.targetRepo);
  return { tools, repoRoot, sourceRoot: globalOpts.source };
}

export function findTool(ctx, id) {
  const tool = ctx.tools.find((t) => t.id === id);
  if (!tool) console.error(pc.red(`Unknown tool id: ${id}`));
  return tool;
}

export async function applyToOne(ctx, id, scopeName, action) {
  const tool = findTool(ctx, id);
  if (!tool) return;
  if (scopeName === "repo" && !ctx.repoRoot) {
    console.log(pc.yellow(`  No git repo detected here - skipping repo ${action.verb} for ${id}`));
    return;
  }
  await action(ctx, tool, scopeName);
}

export async function installOne(ctx, tool, scopeName) {
  await installTool(tool, scopeName, ctx);
  console.log(pc.green(`  Installed ${tool.id} v${tool.version} -> ${scopeName}`));
}
installOne.verb = "install";

export async function removeOne(ctx, tool, scopeName) {
  removeTool(tool, scopeName, ctx);
  console.log(pc.yellow(`  Removed ${tool.id} from ${scopeName}`));
}
removeOne.verb = "remove";

export function viewOne(ctx, id) {
  const tool = findTool(ctx, id);
  if (!tool) return;
  console.log(`${tool.id}  ${linkFor(tool.path, ctx.sourceRoot, tool.registry)}`);
}

export function outdatedIds(ctx, scopeName) {
  return ctx.tools
    .filter((tool) => {
      const installed = getEffectiveInstalledVersion(tool, targetFileFor(tool, scopeName, ctx.repoRoot));
      return installed && installed !== tool.version;
    })
    .map((tool) => tool.id);
}
