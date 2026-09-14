# Roadmap

Status of planned work on the Sacred Timeline archive, tracked here so the plan is visible to anyone browsing the repo.

| # | Item | Status |
|---|------|--------|
| 1 | Fix corrupted "Agents of S.H.I.E.L.D." S5 labels (raw draw.io XML leaking into the timeline) | ✅ Shipped |
| 2 | Remove the "Variant crossovers" (dashed-link) concept until directness can actually be determined | ✅ Shipped |
| 3 | [Title detail enrichment](03-title-detail-enrichment.md) — ratings, blurb, poster, streaming link | ✅ Shipped |
| 4 | [Timeline editor + protected backend](04-timeline-editor-backend.md) — add/edit/remove links without hand-editing JSON | ✅ Shipped |
| 5 | [User accounts + watch tracking](05-user-accounts-watch-tracking.md) — tick off what you've watched | 🔜 Planned |
| 6 | Shift the accent palette to a more vivid, Miss Minutes-style orange | ✅ Shipped |

Items 3–5 are larger features that need a couple of upfront decisions (API keys, exact permissions, etc.) before implementation starts — see each linked doc for the open questions.

Items 4 and 5 are both designed to run entirely on **GitHub itself** — no third-party backend (Supabase/Firebase/etc.) — since editors and watch-trackers are a small, hand-picked group (not open public signup). Access is controlled by GitHub's own repo-collaborator list, and each person authenticates with their own narrowly-scoped Personal Access Token, which the site uses to read/write directly via the GitHub API.
