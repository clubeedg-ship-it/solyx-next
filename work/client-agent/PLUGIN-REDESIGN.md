# Solyx agent plugin — redesign

Decided 2026-08-25 with Otto. Supersedes the copy-only scope the current live
plugin enforces. The WordPress mechanics that back each rule are being verified
separately; anything unverified is marked.

## What changes

The agent composes page structure. It writes Gutenberg blocks, not just text
inside blocks that a human already placed.

Otto's words: the agent only changes copy, it does not design pages, it does not
create new pages on Gutenberg blocks directly, and that is what it should
actually be able to do.

## What must not change

The current plugin held three invariants under live audit, recorded in
`ROADMAP.md`: it cannot delete a page, cannot touch a published page, cannot
change a setting. Copy-only was one mechanism for keeping a client site safe.
It is not the only one, and it is the one being traded away.

The replacement guarantee: **the agent works on drafts and cannot publish.**
Otto publishes. That keeps the blast radius at zero on a live site while
letting the agent build whatever it likes in a draft.

Stated as capability rather than policy. The agent's WordPress role must be
structurally incapable of publishing, not merely instructed against it. A rule
an agent can decide to break is not an invariant.

## Rules

1. **Drafts only.** Create and edit unpublished drafts. No write path reaches a
   published page. No publish capability on the role.
2. **No delete.** Carried forward unchanged. There is no delete route today and
   there will not be one.
3. **No settings.** Carried forward unchanged.
4. **Validate what can be validated, and know what cannot.** Verified
   2026-08-25: WordPress core runs no block validation on save. The parser is
   lenient and accepts unclosed delimiters, unknown block names and malformed
   attribute JSON without error. Block invalidity is decided in the browser,
   when the editor regenerates each block's `save` output and string-compares it
   to what was stored. A server gate is therefore partial. It can
   `parse_blocks()`, check every node against an allowlist and the registered
   block types, validate attributes against their schema, then
   `serialize_blocks()` and require a byte-identical round trip. That catches
   structural corruption and cannot catch editor-side invalidation.
5. **Curated vocabulary, not free markup.** This carries the weight rule 4
   cannot. The only markup certain to survive is markup matching a known-good
   `save` byte for byte, so the agent never hand-writes block markup. It
   composes from registered patterns and block types and fills in text.
6. **Every write is revertible.** A revision is forced before each agent write,
   so any change can be rolled back without reconstructing it.
7. **Preview without login.** A draft gets a shareable preview link so Otto can
   look at it from a phone before publishing.

## Where it runs

The OpenClaw instance moves to `bubble`. The plugin talks to the gateway there
rather than to a process on Otto's workstation, so the agent stays up when his
machines are not.

## The capability set

Verified 2026-08-25. There is no `create_pages` in WordPress: `edit_pages`
governs creating a page, and `map_meta_cap` resolves editing a published page to
the separate `edit_published_pages`. So the invariant is free.

Granted: `edit_pages`. Denied: `publish_pages`, `edit_published_pages`,
`edit_others_pages`, every `delete_*`, all settings caps. Posts identical with
`_posts`.

## Open

- Whether the curated vocabulary is registered block patterns, reusable blocks,
  or a plugin-owned list.
- Whether the plugin or the gateway owns validation.
- Migration: the current plugin's PHP source exists in no repository. The
  redesign is a rewrite, so recovery was dropped on 2026-08-25. The live routes
  still need documenting from their behaviour before anything replaces them.
