import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { validateRegistrySpec, fetchRegistry, isLocalRegistry } from "./registry.js";
import { renderTable } from "./table.js";
import { runInteractive } from "./interactive.js";
import { expandScope } from "./scope.js";
import { addRegistry, removeRegistry, listRegistries, normalizeRegistryEntry } from "./config.js";
import { loadContext, applyToOne, installOne, removeOne, outdatedIds, viewOne } from "./toolActions.js";
import { printNoRegistriesHint, printNextStepsHint } from "./hints.js";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));

export function buildProgram() {
  const program = new Command();
  program
    .name("ai-toolbox")
    .description("Install AI tooling (skills, rules, and more) from any registry you configure")
    .version(version)
    .option("--target-repo <path>", "override repo-scope target instead of auto-detecting the git root")
    .option("--source <path>", "local ai-toolbox checkout to read from instead of GitHub")
    .option(
      "--registry <owner/repo[@branch]|path>",
      "use only this registry for the command, instead of the merged set of `ai-toolbox registry add`ed ones"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox   # add a registry - this repo's own tools
  $ ai-toolbox interactive
  $ ai-toolbox view output-guidelines                             # see what it contains first
  $ ai-toolbox install output-guidelines
  $ ai-toolbox registry add acme acme/internal-ai-tools           # merge in as many as you want
  $ ai-toolbox registry add local-dev ./my-registry               # or a local folder, same shape
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
    .command("view")
    .description("print a link to a tool's raw content, so you can check it before installing")
    .argument("<ids...>", "tool id(s) from the registry")
    .action(async (ids) => {
      const ctx = await loadContext(program.opts());
      for (const id of ids) {
        viewOne(ctx, id);
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
    .command("add <name> <owner/repo[@branch]|path>")
    .description("save a registry under a name so it's merged in - a GitHub owner/repo[@branch] or a local folder")
    .option("--token-env <ENV_VAR_NAME>", "env var holding a GitHub token for this registry, if it's private (defaults to GITHUB_TOKEN)")
    .action(async (name, spec, opts) => {
      let resolved;
      try {
        resolved = validateRegistrySpec(spec);
      } catch (err) {
        console.error(pc.red(err.message));
        process.exitCode = 1;
        return;
      }
      addRegistry(name, resolved, { tokenEnv: opts.tokenEnv });
      const tokenNote = opts.tokenEnv ? ` (token: $${opts.tokenEnv})` : "";
      console.log(pc.green(`Added registry "${name}" -> ${resolved}${tokenNote}`));

      // Only read the registry for a real example id when it's local (instant, no
      // network) - a GitHub spec falls back to a <id> placeholder rather than paying
      // for a live fetch (with everything that can go wrong over a network) on every
      // `registry add`, just to make one line of hint text nicer.
      let exampleId;
      if (isLocalRegistry(resolved)) {
        try {
          const tools = await fetchRegistry(undefined, resolved);
          exampleId = tools[0]?.id;
        } catch {
          // best-effort only - the registry itself was still saved
        }
      }
      printNextStepsHint(exampleId);
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
        printNoRegistriesHint();
        return;
      }
      for (const [name, entry] of entries) {
        const { spec, tokenEnv } = normalizeRegistryEntry(entry);
        console.log(tokenEnv ? `${name}  ${spec}  (token: $${tokenEnv})` : `${name}  ${spec}`);
      }
    });

  return program;
}
