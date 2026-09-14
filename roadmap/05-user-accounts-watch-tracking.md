# User accounts + watch tracking

**Status:** Planned

## Goal

Visitors can log in and "tick off" what they've watched. Watched entries show a checkmark and are visually dimmed (lower opacity/brightness) so unwatched vs. watched is obvious at a glance on both the timeline and the flowchart.

## Relationship to item 4

Since accounts here are hand-provisioned by you (not open signup) and there are only a handful of people, this reuses the same GitHub-native idea as the [timeline editor](04-timeline-editor-backend.md) rather than standing up Supabase/Firebase: access is controlled by who you've given a token to, and the "backend" is the GitHub API.

## Chosen approach: GitHub-native, no external service

Each person already has a token (see item 4) identifying them via their GitHub account — no separate signup/login system needed. The only design choice is *where* their watched list lives:

| Option | Pros | Cons |
|---|---|---|
| **Private Gist per user** (recommended) | Keeps the noise out of the main repo entirely; a Gist is just as reachable via the GitHub API with the same token | One extra concept (Gists vs repo files) |
| **`watched/<username>.json` file in the repo** | Reuses exactly the same code path as item 4's edits — one system total | Every tick/untick becomes a commit to the main repo; ticking through 140+ entries would flood the commit history |

**Recommendation:** Gists — watch-tracking will generate far more frequent writes (every checkbox click) than timeline edits, and shouldn't clutter the site's own git history.

## Data model

Each user's Gist holds a small JSON object: `{ "nodeIndex": true, ... }` (or an array of watched node ids). Fetched once on login, kept in memory, and written back to the Gist on each toggle (debounced slightly so rapid clicking doesn't spam API calls).

## UI

- A tick/checkbox control on each timeline card and flowchart node.
- Watched entries get reduced brightness/opacity (e.g. `filter: brightness(0.55)`) plus a small checkmark badge, so the "what's left" state reads clearly from a glance across the whole archive.
- "Login" is the same paste-your-token flow as item 4 — though a person who should only track watches (not edit the timeline) can use a token scoped to Gists only, without repo contents access.

## Open questions (need your input before building)

1. Should everyone with a token be able to *both* edit the timeline and track watches, or should some of your ~10 people get a watch-tracking-only token (no edit rights)?
2. Gists (recommended — keeps the repo's commit history clean) or a JSON file per user committed to the repo (simpler, reuses item 4's exact mechanism)?
