# Title detail enrichment

**Status:** Shipped

## What it does

Clicking any entry now shows, alongside the existing format/studio/connections info:

- A poster, filtered to fit the site's TVA/archive aesthetic rather than looking like a raw marketing poster
- TMDB and IMDb ratings (or "Not yet rated" for anything unreleased)
- A short overview/blurb
- A "Watch on / Rent on / Buy on ..." button, coloured and logo'd for whichever streaming service (if any) currently has it in the UK, sourced from JustWatch via TMDB's watch-providers data (with the required attribution line)

## How it's built

Following the same pattern as [RaceDates' scheduled data refresh](https://github.com/JamesWardVP/RaceDates) rather than calling any API from the browser:

- [`tools/refresh-media-data.ps1`](../tools/refresh-media-data.ps1) reads the timeline's `DATA` straight out of `index.html`, matches each entry to TMDB (and OMDb, for the IMDb number), and writes the results to `data/media-cache.json`.
- [`.github/workflows/refresh-media-data.yml`](../.github/workflows/refresh-media-data.yml) runs that script weekly (and on manual dispatch), committing the cache only when something actually changed.
- The site (`app.js`) fetches `data/media-cache.json` once on load and looks up each entry by a slug of its label — it never calls TMDB or OMDb directly, and neither API key ever ships to the browser (they're GitHub Actions secrets, used only inside the workflow).
- **Refresh cadence** (per entry, not per run): anything released within ~6 months of "now" is rechecked monthly; anything older is only rechecked every ~6 months. New/unmatched entries are always retried. Running the workflow itself weekly just means whichever entries are actually due get picked up promptly — most weeks it's close to a no-op.

### Matching TMDB/OMDb to timeline entries

Titles are cleaned (trailing date parenthetical stripped; for TV, the season/episode-range suffix stripped too, e.g. "Agents of S.H.I.E.L.D. S5, Eps. 1-19" → "Agents of S.H.I.E.L.D.") and searched against TMDB. A candidate is only accepted if it clears two independent bars: the title has to actually relate (exact match, or one contains the other), and the release year has to be within 5 years — this second bar is a hard exclusion, not just a preference, specifically because a same-titled-but-unrelated show (a 2023 series happens to also be called "The Consultant", unrelated to the 2011 Marvel One-Shot of the same name) must never win just for looking more "popular." TMDB's own `popularity` score turned out to be too volatile/gameable to use directly during testing — `vote_count` is used instead as the stable tiebreaker. Multi-season shows (Daredevil, What If...?, etc.) are memoised per title within a single run so every season consistently resolves to the same show rather than each search risking a different pick.

Anything the automatic matching gets wrong (or can't find) can be corrected by hand in [`data/media-overrides.json`](../data/media-overrides.json): `{ "<slug>": { "tmdbId": 123, "mediaType": "movie" } }`.

### Split-season TV entries

Nodes like "S5, Eps. 1-19" all resolve to the show's overall TMDB/IMDb rating and blurb, not anything episode-range-specific — TMDB doesn't expose that level of granularity, and it wasn't worth the complexity for what's a nice-to-have detail panel.

## Design decisions made along the way

- **TMDB for everything except the IMDb number** (poster, blurb, streaming, and its own rating); **OMDb only for the actual IMDb rating**, per your preference to keep OMDb's usage minimal.
- **Region: GB** for streaming availability.
- Real TMDB-hosted provider logos are used directly (so the logo is always correct for whatever service TMDB reports), with a small hand-picked colour per major provider (Disney+, Netflix, Prime Video, Apple TV, NOW, Sky, Rakuten, Google Play, Microsoft Store, YouTube) and a neutral fallback colour for anything not in that list.
