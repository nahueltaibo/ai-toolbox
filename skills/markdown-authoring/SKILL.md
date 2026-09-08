---
name: markdown-authoring
description: Use when creating or updating Markdown files (.md) in any workspace. Produces concise, human-sounding documents that avoid AI bloat. Enforces tight writing, diagram-over-text preference, zero repetition, and friendly-but-professional tone.
---

# Markdown Authoring

Document rules for `.md` files. The writing rules in `~/.claude/CLAUDE.md` still apply — short sentences, no preamble, no repetition, cut filler. This skill adds the tone, structure, and formatting on top, and wins where it's more specific.

## How It Should Sound

Write like you're explaining something to a teammate over coffee. Friendly, direct, no ceremony. If a paragraph sounds like it came from ChatGPT — too polished, too formal, too many hedging words — rewrite it shorter and more natural.

- Use contractions. "Don't", "won't", "it's" are fine.
- Bold for emphasis, not decoration.
- Vary sentence length a little — monotone bullet-point staccato gets tiring too.

## Structure

- Each section should earn its place. If it doesn't add something new, cut it.
- Headers should be plain and descriptive. "What's Missing" beats "Outstanding Considerations".
- Bullets are the default shape. Keep each to 1–2 lines.
- Tables only when you're genuinely comparing things side by side. Not for dressing up a list.
- Don't apply the same rigid template to every section. Match the structure to the content.
- No "Important Notes" or "Summary" sections that just repeat what you already covered.

## Diagrams Over Paragraphs

Reach for a Mermaid diagram when you're describing relationships, flows, sequences, or state changes. A simple diagram often replaces 3–5 bullet points and lands faster.

- Default to vertical (`TD`) — reads better in Markdown renderers.
- Use `<br/>` inside labels, never `\n`.
- Keep them simple. If it needs a legend or explanation paragraph, it's too complex — simplify the diagram or just use prose.
- Don't add a diagram just to have one. A flat list is fine when the content is flat.

## Formatting

- **No hard line breaks inside paragraphs.** Let lines flow to screen width; the renderer wraps. Manual wrapping wastes vertical space.
- One blank line between sections. No extra blank lines for "breathing room".
- Fenced code blocks with a language tag when showing code or commands.
- Links over inline URLs when the URL is long or ugly.

## Length

After drafting, re-read for bloat:

- If a section is past ~8 bullets, split it or diagram it.
- Short documents are better documents. The reader should finish in one pass without scrolling back.

## Don't

- Don't write "exit criteria" or "key takeaways" sections.
- Don't create parallel sections covering the same ground from different angles.
- Don't use numbered lists unless order actually matters.
