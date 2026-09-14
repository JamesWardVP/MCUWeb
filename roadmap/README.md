# Roadmap

Status of planned work on the Sacred Timeline archive, tracked here so the plan is visible to anyone browsing the repo.

| # | Item | Status |
|---|------|--------|
| 1 | Fix corrupted "Agents of S.H.I.E.L.D." S5 labels (raw draw.io XML leaking into the timeline) | ✅ Shipped |
| 2 | Remove the "Variant crossovers" (dashed-link) concept until directness can actually be determined | ✅ Shipped |
| 3 | [Title detail enrichment](03-title-detail-enrichment.md) — ratings, blurb, poster, streaming link | ✅ Shipped |
| 4 | [Timeline editor + protected backend](04-timeline-editor-backend.md) — add/edit/remove links without hand-editing JSON | ✅ Shipped |
| 5 | [User accounts + watch tracking](05-user-accounts-watch-tracking.md) — tick off what you've watched | ✅ Shipped |
| 6 | Shift the accent palette to a more vivid, Miss Minutes-style orange | ✅ Shipped |

All six original roadmap items are now live. See each linked doc above for what was actually built and any trade-offs worth knowing about.

Items 4 and 5 both run entirely on **GitHub itself** — no third-party backend (no Supabase/Firebase/Cloudflare) — since editors and viewers are a small, hand-picked group rather than open public signup:

- **Item 4** (you, the one admin): a personal GitHub token, pasted in at the moment you commit and never stored, writes directly to this repo.
- **Item 5** (~10 viewers): a single `gist`-only GitHub token (which can't touch this repo at all) is encrypted once per viewer with their own admin-assigned password, so each person "logs in" with a simple username/password rather than needing their own GitHub account.
