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
4. **Validate before write.** Block markup is parsed and checked server-side
   before it is saved. A malformed block is rejected at the REST layer rather
   than discovered later in the editor as a recovery prompt.
5. **Curated vocabulary, not free markup.** The agent composes from a registered
   set of block types and patterns. A small readable vocabulary beats arbitrary
   generated HTML, for the same reason the rest of this system stays readable.
6. **Every write is revertible.** A revision is forced before each agent write,
   so any change can be rolled back without reconstructing it.
7. **Preview without login.** A draft gets a shareable preview link so Otto can
   look at it from a phone before publishing.

## Where it runs

The OpenClaw instance moves to `bubble`. The plugin talks to the gateway there
rather than to a process on Otto's workstation, so the agent stays up when his
machines are not.

## Open

- The exact minimal capability set that permits draft creation and editing while
  making publish and delete impossible.
- Whether the curated vocabulary is registered block patterns, reusable blocks,
  or a plugin-owned list.
- Whether the plugin or the gateway owns validation.
- Migration: the current plugin's PHP source exists in no repository. The
  redesign is a rewrite, so recovery was dropped on 2026-08-25. The live routes
  still need documenting from their behaviour before anything replaces them.
