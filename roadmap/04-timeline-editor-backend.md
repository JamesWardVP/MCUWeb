# Timeline editor + protected backend

**Status:** Shipped

## Goal

A password-protected way to add, remove, and edit nodes/links on the timeline and flowchart, instead of hand-editing the giant embedded JSON blob in `index.html`.

## Why this needs *some* form of backend

GitHub Pages (and GitHub in general) only serves **static files** — there's no server-side code execution on the pages themselves. So the write/auth logic has to happen somewhere else. The good news: given the actual constraints here (fewer than 10 editors, all provisioned by hand rather than through open signup), that "somewhere else" can be **GitHub itself**, via its API — no third-party service required.

## Chosen approach: single admin, RaceDates-style

You're the only editor — this mirrors the `admin.html` / `admin.js` pattern already used on [RaceDates](../../RaceDates/main/admin.js):

- A separate **admin page** (e.g. `admin.html`) with a **password gate**: the password is never stored in plaintext, only its SHA-256 hash, checked client-side against what's typed in. This is explicitly a *deterrent*, not real security — RaceDates' own admin.js says so directly, because a static site can't keep a real secret hidden from anyone who views source.
- The **actual** write authority is a **GitHub Personal Access Token**, scoped to just this repo's contents, which you paste in at the time you make edits — it's never saved anywhere (not `localStorage`, not the repo). Losing/leaking it just means regenerating a new one in your GitHub settings; it can't touch anything outside this repo.
- Once past the password gate, the admin page gives you the add/edit/delete-node and add/remove-link controls, and "Save" calls the GitHub Contents API with your pasted token to commit the change directly (mirroring RaceDates' `commitFile()`).
- The canonical `nodes`/`edges` data moves out of the inline `<script>` blob in `index.html` into its own `data.json`, so an edit is a small, clean commit rather than touching the whole page.
- The public site (`index.html`) has no edit controls at all and needs no token — it just reads `data.json`.

### Why the password gate is still worth having

Purely to stop you (or anyone who stumbles on `admin.html`) from landing in the edit UI by accident — it's a speed bump, not a lock. The GitHub token requirement is what actually prevents unauthorized writes, since only you can generate a token with write access to your own repo.

### Trade-off to accept

Every edit becomes a git commit — a nice audit trail at this scale, but the repo's history will pick up small data-edit commits over time.

## What's built

- [`admin.html`](../admin.html) + [`admin.js`](../admin.js) — a plain functional page (not styled to match the public site, per your preference), password-gated, with tabs for **Entries** (add/edit/delete, searchable), **Links** (add/remove, searchable), and **Publish** (staged-changes summary + commit).
- The canonical data moved out of `index.html` into [`data/timeline.json`](../data/timeline.json), which `app.js` now fetches on load.
- **Nodes got stable `id`s** (the same slug used as the media-cache key, e.g. `the-avengers-may-2012`) and **edges now reference those ids instead of raw array position**. This was necessary, not optional: the old array-index scheme would have silently corrupted every link after the first insert/delete/reorder through the editor. Renaming an entry's title in the admin keeps its `id` (and therefore its links and its media-cache poster/rating) intact.
- New entries are inserted at the chronologically correct position automatically (by year/month), so the Timeline view's ordering never needs manual fixing.
- A "Match studio colours" button fills in the fill/stroke colour from an existing studio's established colours, since typing hex codes by hand isn't fun.
- Every add/edit/delete is staged in memory first (nothing touches GitHub until you hit Commit), with a running human-readable log used as the commit message.
- "Download file instead" is available on the Publish tab as a fallback to committing directly, mirroring RaceDates.

## Since shipped

- **Real commits confirmed working**: the GitHub commit flow has been used for real (live entry edits), not just tested locally.

- **Success confirmation**: committing shows a proper modal dialog (not just small inline text), with an optional "Refresh media data now" button that fires the same `workflow_dispatch` trigger as GitHub's own "Run workflow" button — needs a token with `Actions: Read and write`, separate from the `Contents: Read and write` used for the commit itself.
- **Manual TMDB matching**: the entry form has an Auto/Manual toggle for [item 3](03-title-detail-enrichment.md)'s matching. Manual writes an entry straight into `data/media-overrides.json` (previously only hand-editable) with a "Search TMDB ↗" helper button; switching back to Auto clears it. Deleting an entry cascades to remove its override too. The Publish tab now commits/downloads `data/timeline.json` and `data/media-overrides.json` independently, only when each actually changed.
