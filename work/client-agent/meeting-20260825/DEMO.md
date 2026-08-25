# Demo script — client meeting, 25 August 2026

Everything here was captured and verified this morning. Fallback at the bottom.

## Live demo — the content assistant

**URL:** https://solyx.oopuo.nl (log in with the assistant credentials — Otto
has these; they are not written down in this repo).

1. **Login** (~10 s). Password screen; sign in.
2. **The chat + thread sidebar** (~30 s). Point out: every conversation is a
   thread that keeps its history; titles are generated from the first message.
   Open an old thread to show history survives.
3. **Ask for a text change** (~1–2 min). In a thread, type a small, concrete
   copy change on a draft, e.g. (in Dutch) ask to reword one sentence on a
   page. What happens: Sol replies in chat while the draft panel beside the
   chat refreshes; the changed block is visible in the preview without leaving
   the app. Nothing goes live — it stays a draft.
4. **Drafts panel / page browser** (~30 s). With nothing selected, the right
   panel shows every published page as cards. Click one to preview it.
5. **Safety statement** (say it, ~15 s): the assistant edits text only. It
   cannot delete pages, cannot touch published pages, cannot change settings —
   WordPress itself denies it those permissions.

## If the live demo fails

Open `presentation.html` in any browser (double-click the file; it works
offline). It walks through the same story with screenshots captured today:
the working chat UI, the redesigned marketing pages at desktop width, three
mobile captures, the test/commit numbers, and what ships next.

## Also worth having open

- https://www.solyxenergy.nl — the live client site (200 OK).
- https://2026.solyxenergy.nl — staging (200 OK).

## Notes for Otto

- Do not commit or publish anything from the demo account during the meeting;
  the demo login can create drafts by design.
- Screenshots live next to this file (`static-*.png`, `mobile-*.png`,
  `01/02-assistant-*.png`) if you want them individually.
