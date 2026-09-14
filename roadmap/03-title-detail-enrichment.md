# Title detail enrichment

**Status:** Planned

## Goal

Clicking an entry (e.g. "The Avengers") should show, in addition to what's already there:

- A rating (TMDB and/or IMDb)
- A short official (or close to official) synopsis
- A poster image, styled with a filter so it fits the TVA aesthetic rather than looking like a raw movie poster
- A "watch on..." button linking to a streaming service, coloured/branded for whichever platform it's actually on

## Data source

- **TMDB (The Movie Database)** is the practical choice: free API, has posters, overviews, ratings, and — via its `watch/providers` endpoint — per-region streaming availability (JustWatch data) in one place.
- **IMDb** has no free public API. Getting an actual IMDb numeric rating requires a third-party wrapper like **OMDb API** (free tier: 1,000 requests/day, keyed by IMDb ID or title).
- Recommendation: use TMDB as the primary source (poster, blurb, streaming), and optionally layer in OMDb purely for the IMDb rating number if having that specific figure matters, rather than just TMDB's own rating.

## Matching timeline entries to TMDB records

This is the fiddly part. Most film/special nodes map 1:1 to a TMDB title. But several TV nodes are **partial-season ranges** (e.g. "Agents of S.H.I.E.L.D. S5, Eps. 1-19"), which don't correspond to a single TMDB record — TMDB only knows about the season/show as a whole.

Plan:
- Search TMDB by parsed title (and year, where present in the label) at runtime, cache the result (`localStorage`, keyed by node index) so repeat visits don't re-query.
- For split-season nodes, match to the season as a whole and note in the UI that the rating/blurb refers to the season, not just that episode range.
- Keep a manual override map (a small JSON file in the repo) for any title that the automatic search gets wrong — cheaper than hand-mapping all 140+ entries up front.

## Poster styling

Apply a CSS filter so posters read as "archived TVA case file photo" rather than a marketing poster — something like a desaturated/sepia base with the site's amber accent tinted in (duotone-style), plus the same fine scanline overlay already used elsewhere on the site. Exact filter values need a visual pass once real posters are in front of us.

## Streaming button

TMDB's watch-providers data is region-specific (defaults to whatever `watch_region` is requested) and requires a JustWatch attribution notice per their terms. The button should:
- Show only if a provider is found for the configured region.
- Use that provider's real color/logo (a small lookup table for the major ones — Disney+, Netflix, Prime Video, Hulu/Disney bundle, etc. — covers nearly everything here).
- Link out to the provider's watch page.

## Open questions (need your input before building)

1. Do you already have a **TMDB API key** (free, sign up at themoviedb.org), or should that be step one?
2. Do you want the actual **IMDb** number specifically (via OMDb, a second free key), or is TMDB's own rating good enough?
3. Which **region** should streaming availability be based on (e.g. `GB`, `US`)?
4. A TMDB API key would be visible in the page's client-side source on GitHub Pages (normal for TMDB's client-side use case, but worth confirming you're fine with that) — or we defer exposing it until the [backend from item 4](04-timeline-editor-backend.md) exists and proxy requests through that instead.
