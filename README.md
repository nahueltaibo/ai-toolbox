# ai-toolbox

Personal AI tooling — skills, agents, rules, whatever shape a given piece takes — packaged so you can pull it into any machine or repo with one command, on whatever AI coding tool you use.

## Install

```bash
npm install -g @nahueltaibo/ai-toolbox
ai-toolbox interactive
```

`ai-toolbox` with no arguments shows the commands it supports, same as `git` or `npm`. `ai-toolbox interactive` is the picker: a table of what's available, where each one is already installed (and at what version), and a walkthrough of picking what to install, update, or remove.

```text
┌───┬────────────────────┬───────────────────────────────────┬────────┬───────────────┐
│ # │ Name               │ Description                       │ User   │ Repo          │
├───┼────────────────────┼───────────────────────────────────┼────────┼───────────────┤
│ 1 │ markdown-authoring │ Tone, structure, and formatting...│ v1.0.0 │ not installed │
└───┴────────────────────┴───────────────────────────────────┴────────┴───────────────┘
```

You can install to your user profile, to a repo, or both. If you're not standing in a git repo it asks where to put the repo-level copy.

Prefer scripting or CI over the picker? Skip straight to a subcommand:

```bash
ai-toolbox list                              # status table, no prompt
ai-toolbox install output-guidelines         # install/update, user scope by default
ai-toolbox install markdown-authoring --scope repo
ai-toolbox remove output-guidelines
ai-toolbox update                            # re-installs anything with a newer version available
```

No global install? `npx @nahueltaibo/ai-toolbox interactive` runs the same thing without one. Run it again any time — it diffs against what's already in place and only touches what changed.

## Other registries

The public registry (`nahueltaibo/ai-toolbox`) is always there. Add your own on top — a fork, a private company repo — and it merges right in, so `list`, `install`, and `update` see tools from all of them at once:

```bash
ai-toolbox registry add acme acme/internal-ai-tools           # branch defaults to main
ai-toolbox registry add acme-beta acme/internal-ai-tools@beta
ai-toolbox registry list
ai-toolbox registry remove acme-beta
```

Install by plain id either way — `ai-toolbox install some-tool` finds it wherever it lives. If two registries define the same id, whichever loads first wins (the public default, then your registries in the order you added them), and you'll see a warning about the one that got skipped — worth avoiding rather than relying on.

A private registry just needs to look like this repo: a `registry.json` at the root, plus the `skills/<id>/SKILL.md` or `rules/<id>/CONTENT.md` files it points to.

Want a one-off run against a single registry instead of the merged set? `--registry <owner/repo[@branch]>` overrides everything for that command, e.g. `ai-toolbox list --registry acme/internal-ai-tools@beta`.

## What's inside

| Name | Type | Description | Version |
|---|---|---|---|
| `markdown-authoring` | skill | Tone, structure, and formatting rules for writing `.md` files | 1.0.0 |
| `output-guidelines` | rules | Writing rules for responses, comments, docs, and commits | 1.0.0 |

Each entry lives in its own folder under the matching type (`skills/<id>/`, `rules/<id>/`, and more as they show up — `agents/`), written once in its natural format. `registry.json` is the catalog the installer reads — it's the source of truth for what version each one is on.

Skills and rules install differently:

- **Skills** are dropped in as a standalone `SKILL.md` file.
- **Rules** are markdown that doesn't get its own file — it gets merged as a section inside `CLAUDE.md`, since that's a file you already own and edit yourself. See [Rules and CLAUDE.md](#rules-and-claudemd).

## Where skills go

Claude Code and GitHub Copilot both read the same open Agent Skills format — a `SKILL.md` file with `name` and `description` frontmatter — out of the same well-known folders. No conversion, no per-tool copy: one file works for both.

- **User-level** (`~/.claude/skills/<id>/SKILL.md`): Claude Code, and Copilot's agent mode in VS Code, both check this folder directly.
- **Repo-level** (`<repo>/.claude/skills/<id>/SKILL.md`): Claude Code and every Copilot surface — coding agent, CLI, VS Code — check `.claude/skills/` in the repo, same as `.github/skills/` and `.agents/skills/`.

GitHub Copilot CLI's own personal folder is `~/.copilot/skills/` rather than `~/.claude/skills/` — copy the same file there too if you use the CLI and want it picked up without a repo checkout.

The installed version lives in the skill itself, under a `metadata.ai-toolbox-version` key in its frontmatter. Claude Code ignores that key; the CLI reads it back to power the status column. Committing the installed `SKILL.md` is what makes a repo-level install visible to anyone who clones the repo.

## Rules and CLAUDE.md

Rules are just markdown, but they land inside `CLAUDE.md` instead of getting their own file — Copilot reads `CLAUDE.md` too, so one file still covers both tools. The installer wraps the content in a marker comment carrying the version, and only ever touches what's between its own markers:

```text
<!-- ai-toolbox:output-guidelines:v1.0.0:start -->
...content...
<!-- ai-toolbox:output-guidelines:end -->
```

That marker is the source of truth for the installed version, the same way a skill's own frontmatter is — so the status table stays accurate even if `CLAUDE.md` was hand-copied or committed on its own. Installing again after a version bump replaces the block in place; removing deletes it and leaves the rest of the file exactly as it was.

- **User-level**: `~/.claude/CLAUDE.md`
- **Repo-level**: `<repo>/CLAUDE.md`

## License

[MIT](LICENSE)
