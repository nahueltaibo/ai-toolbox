# Developing ai-toolbox

Notes for working on the `ai-toolbox` CLI itself — not for the skills/rules in this repo's own example registry (`registry.json`, `skills/`, `rules/`). Read `README.md` first for what this project is.

## Local development

```bash
npm install
npm link                       # puts a global `ai-toolbox` on PATH, symlinked to this checkout
ai-toolbox list --source .     # exercise it against this repo's own registry.json/skills/rules
```

`--source <path>` is the escape hatch for testing registry/content changes before they're pushed — without it, the CLI always fetches `registry.json` and tool content from `raw.githubusercontent.com/nahueltaibo/ai-toolbox/main`, live. That's deliberate: `registry.json`, `skills/`, and `rules/` are never published in the npm package (see `files` in `package.json`) so new tools and version bumps reach every installed CLI instantly, with no CLI release needed.

No `npm link` set up, or just want a one-off run? `node bin/ai-toolbox.js <args>` works directly from the repo root.

### Registries

There's no registry built into the CLI - every one is something the user (or `--source .` for local dev) points it at, including this repo's own `nahueltaibo/ai-toolbox`. Anyone can merge in their own fork or a private company registry, live, with no code change:

```bash
ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox     # this repo's own tools
ai-toolbox registry add acme acme/internal-ai-tools            # branch defaults to main
ai-toolbox registry add acme-beta acme/internal-ai-tools@beta
ai-toolbox registry list                                       # every saved one
ai-toolbox registry remove acme-beta
```

Saved registries live in `~/.ai-toolbox/config.json` (`src/config.js`) and are merged on every `list`/`install`/`update`/`interactive` — a tool from any of them installs the same way, by its plain `id`. If none are configured, `resolveTools()` prints a hint to run `registry add` and returns an empty tool list rather than fetching anything. If two registries define the same tool `id`, the first one loaded (in the order `registry add` was run) wins and the rest are skipped with a warning — pick non-colliding ids rather than relying on that order.

`--registry <owner/repo[@branch]>` narrows a single run to *only* that one registry, bypassing the merge entirely (useful for a one-off test). `--source <path>` (local checkout, no network) takes priority over all of it. A registry only needs to match the shape this repo exposes publicly — a root `registry.json` plus the `skills/<id>/SKILL.md` and `rules/<id>/CONTENT.md` files it points at — nothing else here (`bin/`, `src/`, `package.json`) is ever fetched.

Resolution lives in `resolveRegistryBase()` in `src/registry.js` (turns one `owner/repo[@branch]` spec into a `raw.githubusercontent.com` URL) and `resolveTools()` in `src/cli.js` (decides `--source` vs. single-registry override vs. the merge, and does the merging). Each tool returned from the merge carries a `registry` field so `installer.js` knows which base to re-fetch its content from later.

## Adding a tool

Drop a new folder under the matching type with its native file inside (`skills/<id>/SKILL.md` or `rules/<id>/CONTENT.md`), then add an entry to `registry.json` with its `id`, `type` (`skill` or `rules`), `description`, `version`, and `path`. Bump `version` whenever you change something's content — that's what tells the installer an update is available.

## Testing

```bash
npm test        # node:test, zero extra dependency, runs everything in test/
```

Platform gotchas the test suite works around, worth knowing before adding more:

- **`os.homedir()` reads `USERPROFILE` on Windows, `HOME` on POSIX** — a test that fakes the home directory has to set both, or it silently does nothing on whichever platform it's actually running on.
- **Windows temp paths can be short-form (`NAHUEL~1`) or long-form depending on where the string came from** (`%TEMP%` vs. `git`'s own output, vs. `fs.realpathSync`). Don't assert on a literal path string built two different ways — resolve both sides through the same call (e.g. a second `git rev-parse`) before comparing.
- **A test helper that does `try { return fn() } finally { restore() }` with an async `fn` restores too early** — the `finally` runs as soon as `fn()` returns a pending promise, not when it settles. Always `return await fn()` inside the try.

## Releasing a new version

Two independent version numbers exist here — don't conflate them:

- **A tool's own `version` in `registry.json`** — bump this when you change a skill's or rules' *content*. Takes effect immediately for every installed CLI, no publish needed.
- **`package.json`'s `version`** — bump this when you change the *CLI's own code* (`bin/`, `src/`). This is what triggers a release.

To ship a CLI change: bump `package.json`'s version, merge to `main`. CI (`.github/workflows/ci.yml`) runs the full test matrix, then publishes to npm automatically if that version isn't on the registry yet — re-running CI on a version already published is a harmless no-op, not a failure.

## Architecture notes

- Skills stamp their installed version into `metadata.ai-toolbox-version` in their own `SKILL.md` frontmatter (`src/skillFrontmatter.js`); rules stamp it into an HTML comment marker in `CLAUDE.md` (`src/claudeMd.js`).
- **`metadata` is the only frontmatter field safe for a skill's own custom data.** The Agent Skills spec allows exactly `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` for portable skills.
- **`targetFileFor(tool, scopeName, repoRoot)` in `src/paths.js` is the one place that decides where a tool's installed artifact lives.** Everything that needs to read or write that artifact (installer, table, update-checking) goes through it — don't duplicate the user-vs-repo, skill-vs-rules path logic anywhere else.
- **`src/cli.js` only wires up Commander** - argument/option definitions and which function handles each command. The actual use-case logic (resolving which tools are available, applying install/remove to one tool, computing what's outdated) lives in `src/toolActions.js`, so both the flag-driven commands and `src/interactive.js`'s picker install/remove a tool the same way instead of each reimplementing it.
