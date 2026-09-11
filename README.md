# The Sacred Timeline — MCU Continuity Archive

A single-page site visualizing every entry and connection from `MCU_Flowchart_v5.drawio.xml`
(142 catalogued entries, 169 traced connections), with two interchangeable views:

- **Timeline** — the original chronological, single-column view grouped by year.
- **Flowchart** — a pannable, zoomable canvas that reproduces the branching layout of
  the source draw.io diagram, redrawn in the site's own dark theme.

## Files
- `index.html` — page structure + embedded data (`const DATA = {...}`) + styles
- `app.js` — rendering, filters, search, detail panel, timeline arcs, and the flowchart
  canvas (pan/zoom, node/edge layout, text wrapping)

## Design
TVA "Sacred Timeline" case-file theme: dark amber/rust palette, Bebas Neue display
font, IBM Plex Mono/Sans for everything else. Card/node shape = format (rounded=film,
hexagon=TV, parallelogram=special). Card/node accent color = studio of origin.

Click a card (in either view) to open a detail panel listing its direct-continuity and
variant/cameo connections. Selecting a connection there jumps to that entry in the
current view — scrolling to it on the Timeline, or panning/zooming to it on the
Flowchart. Search and the Format/Origin filters apply to both views simultaneously.

The **Timeline ↔ Flowchart** toggle lives at the left of the controls bar. The
Flowchart supports drag-to-pan, scroll/pinch-to-zoom, and a small zoom toolbar
(`−` / percentage-as-fit-button / `+`).

## Data provenance
All nodes/edges parsed directly from the uploaded drawio XML (including each node's
`x`/`y`/`width`/`height`, reused for the Flowchart layout). Legend/key shapes in the
XML are excluded from the data set. Four nodes had no month/year in their label
(Elektra, Fantastic Four, Fantastic Four: Rise of the Silver Surfer, Daredevil S3)
and were dated from their real release dates for correct chronological placement;
every other node's date is parsed from the first `(Month Year)` (or `Year`-only)
pattern found in its label.

## Running it
Just open `index.html` in a browser — no build step, no server needed.

## Picking this up in Claude Code
Point Claude Code at this folder and it can read these two files directly to
keep iterating (e.g. `claude` from inside this directory, or the desktop app's
folder picker). It won't have this chat's conversation history, but the files
here plus this README should give it everything it needs to continue the work.
