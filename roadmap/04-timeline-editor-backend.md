# Timeline editor + protected backend

**Status:** Planned

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

## Open questions (need your input before building)

1. OK with edits showing up as individual commits in the repo's history?
2. Same visual style as the rest of the site, or closer to RaceDates' plainer admin-page look (functional over themed, since only you see it)?
