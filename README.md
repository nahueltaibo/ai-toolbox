# ai-toolbox

Personal AI tooling — skills, agents, instructions, whatever shape a given piece takes — packaged so you can pull it into any machine or repo with one command, on whatever AI coding tool you use.

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

## What's inside

| Name | Type | Description | Version |
|---|---|---|---|
| `markdown-authoring` | skill | Tone, structure, and formatting rules for writing `.md` files | 1.0.0 |
| `output-guidelines` | instructions | Writing rules for responses, comments, docs, and commits | 1.0.0 |

Each entry lives in its own folder under the matching type (`skills/<id>/`, `instructions/<id>/`, and more as they show up — `agents/`), written once in its natural format. `registry.json` is the catalog the installer reads — it's the source of truth for what version each one is on.

Skills and instructions install differently:

- **Skills** are dropped in as a standalone `SKILL.md` file.
- **Instructions** are markdown that doesn't get its own file — it gets merged as a section inside `CLAUDE.md`, since that's a file you already own and edit yourself. See [Instructions and CLAUDE.md](#instructions-and-claudemd).

## Where skills go

Claude Code and GitHub Copilot both read the same open Agent Skills format — a `SKILL.md` file with `name` and `description` frontmatter — out of the same well-known folders. No conversion, no per-tool copy: one file works for both.

- **User-level** (`~/.claude/skills/<id>/SKILL.md`): Claude Code, and Copilot's agent mode in VS Code, both check this folder directly.
- **Repo-level** (`<repo>/.claude/skills/<id>/SKILL.md`): Claude Code and every Copilot surface — coding agent, CLI, VS Code — check `.claude/skills/` in the repo, same as `.github/skills/` and `.agents/skills/`.

GitHub Copilot CLI's own personal folder is `~/.copilot/skills/` rather than `~/.claude/skills/` — copy the same file there too if you use the CLI and want it picked up without a repo checkout.

The installed version lives in the skill itself, under a `metadata.ai-toolbox-version` key in its frontmatter. Claude Code ignores that key; the CLI reads it back to power the status column. Committing the installed `SKILL.md` is what makes a repo-level install visible to anyone who clones the repo.

## Instructions and CLAUDE.md

Instructions are just markdown, but they land inside `CLAUDE.md` instead of getting their own file — Copilot reads `CLAUDE.md` too, so one file still covers both tools. The installer wraps the content in a marker comment carrying the version, and only ever touches what's between its own markers:

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
