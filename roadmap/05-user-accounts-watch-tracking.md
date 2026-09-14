# User accounts + watch tracking

**Status:** Planned

## Goal

Visitors can log in and "tick off" what they've watched. Watched entries show a checkmark and are visually dimmed (lower opacity/brightness) so unwatched vs. watched is obvious at a glance on both the timeline and the flowchart.

## Relationship to item 4

These are a **different role from the admin**. You create each of the ~10 accounts yourself (no public signup), and when one of them logs in, they should only ever see the watch-tracking UI — never the timeline-edit controls from [item 4](04-timeline-editor-backend.md). The admin page's real write authority is a personal GitHub token pasted at time of use; asking ~10 casual friends/family to each generate their own GitHub token is a much bigger ask than a simple password, so viewer accounts need a lighter-weight mechanism — see open questions below.

## What's settled

- **Role separation is real, not just hidden UI**: whatever mechanism we land on, a viewer account must be technically incapable of writing timeline data, not just missing the button for it in the interface.
- A tick/checkbox control on each timeline card and flowchart node.
- Watched entries get reduced brightness/opacity (e.g. `filter: brightness(0.55)`) plus a small checkmark badge, so unwatched-vs-watched reads clearly at a glance.
- You set up each of the ~10 accounts (e.g. a username + password you choose for them) — no self-service signup.

## Open decision: how do viewer accounts actually persist their ticks?

This needs solving before building, because it has real security implications:

| Option | How it works | Trade-off |
|---|---|---|
| **A. Local only (`localStorage`)** | Watched status is saved only in that person's browser — no login needed at all, or login is just a display-name label | Simplest by far, nothing to build server-side — but ticks don't sync across devices, and are lost if they clear browser data |
| **B. Thin proxy holds the real credential** | A small serverless function (e.g. a free Cloudflare Worker) checks the viewer's password and, if valid, commits their watched-list update using a GitHub token that lives only in the Worker's server-side secrets — never sent to the browser | Real cross-device sync, real password-per-person, and the write credential is never exposed to viewers — but it's one small piece of infrastructure outside GitHub Pages itself (still free, still not Supabase/Firebase) |
| **C. Give viewers their own scoped GitHub token, like the admin** | Same mechanism as item 4, just a token scoped even more narrowly (e.g. Gist-only) | Keeps everything inside GitHub with zero extra infrastructure, but asking casual users to create a GitHub account and generate a token is a poor fit for "I just want to tick off what I've watched" |

**Leaning:** Option B gives the real password-per-person experience you described (log in, only see tick controls) without ever handing viewers a credential that could write anything beyond their own watched list — worth the one small Worker. Option A is the fallback if cross-device sync isn't actually needed. Happy to go either way — flagging this now so it's decided before we start building item 5, not mid-build.

## Open questions (need your input before building)

1. Do watched-ticks need to sync across devices/browsers, or is "watched status is remembered on whichever device you use" good enough (→ Option A, no backend needed at all)?
2. If cross-device sync matters: comfortable with one small always-free Cloudflare Worker as the only piece of infrastructure outside GitHub itself (→ Option B)?
