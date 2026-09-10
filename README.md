# ai-toolbox

A CLI for installing AI tooling — skills, rules, and whatever shape shows up next — into Claude Code, GitHub Copilot, or any tool that reads the same files. It ships with no registry built in: point it at your own, a coworker's, or [this repo's own example registry](#this-repos-own-registry), and it installs the same way either way.

## Install

```bash
npm install -g @nahueltaibo/ai-toolbox
ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox   # or any other registry - see below
ai-toolbox interactive
```

`registry add` is a one-time step per registry (see [Registries](#registries)). Everything after that is the normal flow — and the CLI tells you what to run next at each point: nothing configured yet prints the `registry add` command to run, and adding a registry prints `list`/`view`/`install` with one of its real tool ids filled in.

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
ai-toolbox view output-guidelines            # print a link to check it before installing
ai-toolbox install output-guidelines         # install/update, user scope by default
ai-toolbox install markdown-authoring --scope repo
ai-toolbox remove output-guidelines
ai-toolbox update                            # re-installs anything with a newer version available
```

No global install? `npx @nahueltaibo/ai-toolbox interactive` runs the same thing without one. Run it again any time — it diffs against what's already in place and only touches what changed.

Want to see what a tool actually contains before installing it? `ai-toolbox view <id>` prints a link straight to the file — a `file://` link for a local registry, a GitHub blob link otherwise — so you can open it with whatever you already have (browser, editor, `cat`) and come back to `install` once you're happy with it. No content is downloaded or written anywhere by `view` itself.

## Registries

Every registry is something you added — there's no built-in one. Add as many as you want and they all merge in, so `list`, `install`, and `update` see tools from every one of them at once:

```bash
ai-toolbox registry add nahueltaibo nahueltaibo/ai-toolbox     # this repo's own tools
ai-toolbox registry add acme acme/internal-ai-tools            # branch defaults to main
ai-toolbox registry add acme-beta acme/internal-ai-tools@beta
ai-toolbox registry add local-dev ./my-registry                # a local folder works too
ai-toolbox registry list
ai-toolbox registry remove acme-beta
```

A registry is either a GitHub `owner/repo[@branch]` or a path to a local folder — useful for developing a registry before pushing it anywhere. A relative path is resolved against the directory you ran `registry add` from, so it keeps working no matter where you run `ai-toolbox` from later.

Install by plain id regardless of which registry it came from — `ai-toolbox install some-tool` finds it wherever it lives. If two registries define the same id, whichever loads first wins (in the order you ran `registry add`), and you'll see a warning about the one that got skipped — worth avoiding rather than relying on.

A registry just needs to look like this repo: a `registry.json` at the root, plus the `skills/<id>/SKILL.md` or `rules/<id>/CONTENT.md` files it points to.

Want a one-off run against a single registry instead of the merged set? `--registry <owner/repo[@branch]|path>` overrides everything for that command, e.g. `ai-toolbox list --registry acme/internal-ai-tools@beta`.

### Private GitHub registries

A GitHub registry is fetched unauthenticated by default, which only works for public repos. Set `GITHUB_TOKEN` (the same env var `gh` and GitHub Actions use) to a token with read access, and `ai-toolbox` switches to GitHub's authenticated API instead — same commands, no other setup:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
ai-toolbox registry add acme acme/internal-ai-tools-private
ai-toolbox install some-tool
```

Got more than one private registry, or already using `GITHUB_TOKEN` for something else? Point a registry at a different env var instead of the default:

```bash
ai-toolbox registry add acme acme/internal-ai-tools-private --token-env ACME_GH_TOKEN
```

`ai-toolbox` never stores the token itself — only the env var's name, so whatever already manages that token (your shell profile, `gh auth`, a company secrets tool, CI) keeps owning its lifecycle. If it expires or gets revoked, the next fetch fails with a clear error naming the env var and telling you to renew it, rather than a bare HTTP status code.

**What the token needs:** read access to the repo's contents, nothing else.

- **Fine-grained PAT (recommended)** — scope it to just that one repo (or the set you need), and grant **Contents: Read-only**. GitHub adds **Metadata: Read-only** automatically; that's a mandatory baseline, not something extra you're granting. Leave everything else at "No access."
- **Classic PAT** — GitHub doesn't offer a narrower option for a private repo: it's the full **`repo`** scope or nothing (`public_repo` only covers public repos). That's broader than `ai-toolbox` actually uses, which is exactly why the fine-grained option above is the better fit.

## How tools install

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

## This repo's own registry

`nahueltaibo/ai-toolbox` also publishes a small registry of its own — nothing special about it, just one more registry you can `registry add`:

| Name | Type | Description | Version |
| --- | --- | --- | --- |
| `markdown-authoring` | skill | Tone, structure, and formatting rules for writing `.md` files | 1.0.0 |
| `output-guidelines` | rules | Writing rules for responses, comments, docs, and commits | 1.0.0 |

Each entry lives in its own folder under the matching type (`skills/<id>/`, `rules/<id>/`, and more as they show up — `agents/`), written once in its natural format. `registry.json` at the repo root is the catalog the installer reads — it's the source of truth for what version each one is on, and the exact shape any other registry needs to match (see [Registries](#registries)).

## License

[MIT](LICENSE)
