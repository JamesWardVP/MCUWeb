# User accounts + watch tracking

**Status:** Shipped

## What it does

Signed-in viewers can tick off what they've watched, on the timeline cards, the flowchart nodes, and the detail panel. Watched entries dim (`brightness(0.55)`) and show a checkmark, so unwatched-vs-watched reads clearly at a glance. Ticks sync across whatever device/browser that viewer signs into.

## How it's built

No third-party service (no Cloudflare, no Supabase/Firebase) — everything runs client-side plus two pieces of plain GitHub infrastructure:

- **A shared private Gist** (not this repo) holds a single JSON object keyed by username: `{ "lauren": ["blade-1998", ...], "james": [...] }`. Ticking something debounces (700ms) and `PATCH`es this Gist directly from the browser — it never touches the repo, so watch-tracking activity never clutters the site's commit history.
- **One GitHub Personal Access Token, scoped only to `gist`**, does that writing. It cannot touch this repo, `data/timeline.json`, or anything else — a viewer session is technically incapable of writing timeline data, full stop, regardless of what happens to it.
- **[`data/viewers.json`](../data/viewers.json)** holds one entry per viewer: not a password hash, but that same shared token *encrypted* with a key derived from their password (PBKDF2-SHA256, 250,000 iterations, random salt) via AES-GCM, random IV. A wrong password simply fails to decrypt it — this is real cryptographic gating, not just a client-side string comparison like the admin's password gate. Setting it up required no server either: a small local-only HTML tool (never published, run once by James in his own browser) did the actual encryption, so the plaintext token only ever existed in that one local browser tab and this chat, never in a tool call or the repo.
- Login is a small widget fixed to the top-right corner of the public site. Once signed in, the session (username + decrypted token) is kept in that browser's `localStorage` so it persists across visits — reasonable here since a `gist`-only token has a narrow blast radius (it can't touch the repo), unlike the admin's token which is deliberately never stored.

## Known trade-off (accepted deliberately)

Since every viewer's copy decrypts to the *same* underlying token, someone who extracted a decrypted token from one logged-in viewer's browser could technically read/edit another viewer's watched list too (not the timeline — the token still can't touch the repo). Given this is a small family/friends site and the alternative was either a third-party server or each viewer needing their own GitHub account, this was judged an acceptable trade rather than a blocking concern.

## Adding more viewers later

Run the local encryption tool (or ask for it to be regenerated) with the same shared token and the new person's chosen username/password, then add the resulting entry to `data/viewers.json` via the admin flow. No redeploying, no server changes — just one more entry in that file.
