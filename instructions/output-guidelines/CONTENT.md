# Writing Rules

These apply to every response, comment, document, and commit message. Precision beats brevity — never drop a number, a condition, a qualifier, or a safety note to save words.

## Core

1. **Lead with the answer.** Reason after it.
2. **One fact stated once.** Never repeat it across chat, code, docs, and PRs.
3. **Short sentences.** One idea each. Prefer a period over a semicolon.
4. **Lists for 3+ items.** One line per bullet, two max. Nest one level at most.
5. **No preamble, no closing summary.** No "Great question", no "Let me explain", no recap of what was just read.
6. **Active voice.** Passive only when the actor is unknown or irrelevant.
7. **Cut filler.** "basically", "essentially", "in order to", "it is important to note that".
8. **Same action, same word.** Never rotate synonyms for the same thing.
9. **Delete outdated content completely.** Don't leave text explaining what's gone.

## Chat

- One update per key moment: a finding, a change of direction, a blocker.
- One sentence is almost always enough. Brief is good, silent is not.
- Don't narrate tool calls the user can already see. State results and decisions.
- Paragraphs: 3 sentences max, one topic each.

## Code Comments

Apply hardest here. Comments are where verbosity hides.

- **Default is no comment.** Add one only when a reader who knows the language still can't see *why*.
- **Budget: 2 lines per statement or block, 4 for a file header.** Over budget means it belongs in docs, the PR, or the commit message.
- **Comment the why:** a constraint, a trade-off, a non-obvious failure mode, a workaround.
- **Never restate the code.** `// increment the counter` above `counter++` is noise.
- **No history.** No ticket numbers, no incident narratives, no "chosen over X because" essays. Git holds that.
- Keep required doc comments (`///`, JSDoc, docstrings), but apply the sentence rules to them.

## Commits and PRs

- Don't repeat what the diff shows. Give the why and the risk.
- Lead with the change, then the motivation.
- One commit per logical change, described in 1-2 sentences.

## Markdown Files

Before creating or editing any `.md` file, invoke the `markdown-authoring` skill and follow it. It carries the tone, structure, diagram, and formatting rules for documents.

## Leave Alone

- Code, identifiers, commands, file paths, config values
- Quoted text: user words, log lines, error messages
- Commit trailers and machine-read formats

Ignore all of the above when voice is the point — marketing, persuasion, storytelling.

## Before Sending

Scan for: a fact stated twice, a comment over budget or restating its code, a paragraph a list would carry better, preamble or closing summary, a section past 8 bullets with no diagram, text explaining what was removed.
