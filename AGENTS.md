# Developing ai-toolbox

Notes for working on the `ai-toolbox` CLI itself — not for the skills/instructions it distributes. Read `README.md` first for what this project is.

## Local development

```bash
npm install
npm link                       # puts a global `ai-toolbox` on PATH, symlinked to this checkout
ai-toolbox list --source .     # exercise it against this repo's own registry.json/skills/instructions
```

`--source <path>` is the escape hatch for testing registry/content changes before they're pushed — without it, the CLI always fetches `registry.json` and tool content from `raw.githubusercontent.com/nahueltaibo/ai-toolbox/main`, live. That's deliberate: `registry.json`, `skills/`, and `instructions/` are never published in the npm package (see `files` in `package.json`) so new tools and version bumps reach every installed CLI instantly, with no CLI release needed.

No `npm link` set up, or just want a one-off run? `node bin/ai-toolbox.js <args>` works directly from the repo root.

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

- **A tool's own `version` in `registry.json`** — bump this when you change a skill's or instructions' *content*. Takes effect immediately for every installed CLI, no publish needed.
- **`package.json`'s `version`** — bump this when you change the *CLI's own code* (`bin/`, `src/`). This is what triggers a release.

To ship a CLI change: bump `package.json`'s version, merge to `main`. CI (`.github/workflows/ci.yml`) runs the full test matrix, then publishes to npm automatically if that version isn't on the registry yet — re-running CI on a version already published is a harmless no-op, not a failure.

Manual publish, if you ever need it outside CI:

```bash
npm pkg fix      # package.json accumulates a couple of auto-corrections (bin path, repository.url) - keep it clean
npm login        # interactive; needs a browser
npm publish      # prepublishOnly runs the full test suite first, automatically
```

Gotchas hit doing this the first time, in case they recur:

- **A brand-new scoped package can 404 on `npm publish`** even with a matching username/scope and correct `publishConfig.access: "public"`. In our case it was an unverified email on the npm account — npm doesn't surface that as the error. Check [npmjs.com/settings](https://www.npmjs.com/settings) before assuming a permissions problem. A plain retry also fixed it once, so try that first — the newer 2FA-bypass-restricted publish flow has a browser re-auth step that can race the actual publish request.
- **`npm install -g npm@latest` can outright refuse to install** if your Node is a minor version behind that npm release's `engines.node` floor. Check `npm view npm@<major> engines.node` for an intermediate major that still supports your Node before assuming you need to upgrade Node itself.

## Architecture notes

- **Both tool types read their installed version from the artifact itself, not a side-car state file.** Skills stamp it into `metadata.ai-toolbox-version` in their own `SKILL.md` frontmatter (`src/skillFrontmatter.js`); instructions stamp it into an HTML comment marker in `CLAUDE.md` (`src/claudeMd.js`). There used to be a `.claude/ai-toolbox-installed.json` ledger; it's gone, deliberately — the artifact is always the accurate source, even if someone hand-copies or hand-deletes a file outside the CLI.
- **`metadata` is the only frontmatter field safe for a skill's own custom data.** The Agent Skills spec allows exactly `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` for portable skills. A bare top-level key (e.g. a plain `version:`) works fine in Claude Code but **hard-errors** if the skill is ever uploaded to claude.ai or the Skills API. Don't add a new top-level frontmatter key without checking that list first.
- **Frontmatter is parsed with the `yaml` package, not regex.** It's a small, deliberate dependency — hand-rolled text surgery on YAML (quoting, nested maps) is exactly the kind of fragile pattern this CLI replaced the old PowerShell installer's console-capability detection to get away from.
- **`targetFileFor(tool, scopeName, repoRoot)` in `src/paths.js` is the one place that decides where a tool's installed artifact lives.** Everything that needs to read or write that artifact (installer, table, update-checking) goes through it — don't duplicate the user-vs-repo, skill-vs-instructions path logic anywhere else.

## If something looks odd

If a file has content you didn't write, or a branch exists you didn't create, check `git status`/`git branch` before assuming you're wrong about your own history — this repo's working tree has been shared with other concurrent sessions before (a whole CLI rewrite once landed on an unexpected branch instead of `main`, from a checkout that happened outside this session's own tool calls). It's cheap to check and confusing to debug blind.
