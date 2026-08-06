# TenWords

Local tool: condenses any text to exactly-10-word paragraph summaries.

- `service/` — Express on :4710, calls Anthropic (Haiku 4.5, model in
  `service/summarizer.js`). Key in `.env`. `.env` is loaded with
  `override: true`, so it deliberately overrides any inherited env vars.
- `extension/` — Chrome MV3; content script does DOM, background streams
  over a runtime port. Two modes: localhost service (default) or direct
  Anthropic calls when a key is saved in its options (BYOK). The
  enforcement core is synced copies in `extension/lib/` — edit
  `service/words.js`/`summarizer.js` then `npm run sync-ext` (a test
  fails on drift). Re-injection of content.js = toggle.
- `webapp/` — single static HTML file served at `/`.
- Tests: `npm test` (node --test, no API calls). The exactly-10-words
  guarantee lives in `summarizeBlocks` — never bypass its enforcement.
- `/summarize` streams NDJSON progress events when the request has
  `Accept: application/x-ndjson`; plain JSON otherwise. Batching
  (40 blocks, 4 parallel) is internal to `summarizeBlocks`.
- Run: `launch.cmd` or `npm start`.
