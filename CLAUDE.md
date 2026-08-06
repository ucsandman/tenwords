# TenWords

Local tool: condenses any text to exactly-10-word paragraph summaries.

- `service/` — Express on :4710, only component calling Anthropic (Haiku
  4.5, model in `service/summarizer.js`). Key in `.env`. `.env` is loaded
  with `override: true`, so it deliberately overrides any inherited env vars.
- `extension/` — Chrome MV3; background does the localhost fetch,
  content script does DOM. Re-injection of content.js = toggle.
- `webapp/` — single static HTML file served at `/`.
- Tests: `npm test` (node --test, no API calls). The exactly-10-words
  guarantee lives in `summarizeBlocks` — never bypass its enforcement.
- Run: `launch.cmd` or `npm start`.
