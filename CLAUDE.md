# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebGuessr is a browser-based daily guessing game (like Wordle) hosted on GitHub Pages. Players are shown archived versions of websites via the Wayback Machine and must guess the year the snapshot is from. There are 5 rounds per game, with up to 5000 points per round.

The game is deployed statically with no build step — files are served directly.

## Architecture

- **`index.html`** — Landing/home page. Clicking "Play" navigates to `play.html`.
- **`play.html`** — Main game page. Initializes a `WebGuessr` instance using game data from `data-sample.js`, starts the game, and handles round flow.
- **`results.html`** — Results page. Game state is passed via URL query string (`?g=<JSON>`). Reconstructs and displays all rounds using `WebGuessr.fromSaved()`.
- **`app.js`** — Core game logic. Contains `BadRNG` (seeded PRNG) and `WebGuessr` class. Game state is serialized to/from URL query params for sharing results.
- **`round.js`** — `Round` class managing UI for a single round (iframe, sliders, submit/next buttons). Fetches HTML from `templates.html` to create round DOM.
- **`templates.html`** — HTML `<template>` element defining the round UI structure (iframe + input controls + results controls).
- **`styles.css`** — Shared styles.
- **`data-sample.js`** — Game data: exports `sites` (array of domain strings) and `counts` (object mapping year strings to arrays of indices into `sites`). The real `data.js` follows the same format.

## Game Flow

1. `play.html` determines game number from URL hash (`#N`) or defaults to days since epoch (daily game).
2. `WebGuessr.create()` initializes a seeded RNG (`BadRNG`) with the game number and creates a `Round` UI.
3. Each round: picks a random year from `counts`, then a random site index for that year, loads the Wayback Machine URL in an iframe.
4. Player adjusts a slider to guess the year and submits.
5. Score is calculated with exponential decay: `floor(5000 * e^(-ln(2) * |years_off| / 7))` — halving every 7 years off.
6. After 5 rounds, navigates to `results.html?g=<serialized game state>`.

## Data Format

`data-sample.js` (and `data.js`) export:
- `sites`: flat array of domain strings
- `counts`: `{ "year": [index, index, ...], ... }` — indices into `sites` for domains archived that year

`cdx_batch_check2.py` and `filter_adult_domains.py` are data preparation scripts for building `data.js` from web crawl data.

## Development

No build system — open HTML files directly in a browser or serve locally:
```
python3 -m http.server
```

The game requires a local server (not `file://`) because `round.js` fetches `templates.html` via `fetch()`, and the Wayback Machine iframe uses `sandbox="allow-forms allow-scripts"` (no `allow-same-origin`).

To test a specific game number, append `#<number>` to the URL in `play.html`, e.g. `http://localhost:8000/play.html#42`.

## Year Redaction in Iframe

To hide the target year from the archived page, we must fetch the HTML and modify it before display.

### Working Approach
1.  **Fetch via Proxy:** Use a CORS proxy to fetch the "naked" Wayback URL (`...id_/http...`).
2.  **Regex Replace:** Apply `/\b(19|20)\d{2}\b/g` to the HTML string to replace years with `XXXX`.
3.  **Manual URL Rewriting:** Rewrite root-relative URLs (`href="/..."`, `src="/..."`, `url(/...)`) to absolute Wayback URLs (e.g., `https://web.archive.org/web/[timestamp]/[original_url]/[path]`) to prevent 404s and CORB blocks.
4.  **Inject via `srcdoc`:** Set the modified HTML to the iframe's `srcdoc` attribute. This allows the iframe to inherit the parent origin, facilitating smoother resource loading.
5.  **Base Tag:** Inject a `<base>` tag as a fallback for truly relative URLs.

### What Didn't Work
-   **Direct `src`:** Content cannot be modified due to CORS.
-   **Blob URLs:** Often triggered `CORB` (Cross-Origin Read Blocking) because the browser treated the `blob:` origin as a security boundary, blocking CSS/images that lacked CORS headers.
-   **Solely `<base>` tag:** Root-relative links (starting with `/`) ignore the base path and resolve to the current domain's root, causing 404s (which are then blocked by CORB as HTML-loaded-as-CSS).