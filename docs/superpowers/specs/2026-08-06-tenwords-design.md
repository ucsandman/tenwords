# TenWords — Design Spec

**Date:** 2026-08-06
**Status:** Approved by user

## Problem

AI-generated (and generally verbose) content wastes reading time. The user wants any text — websites, documents, anything — compressed so that every paragraph becomes **exactly 10 plain-vocabulary words**, plus a single 10-word TL;DR for the whole piece. Reading an article should mean reading spaced-out sections of 10-word lines, not prose.

## Decisions made

- **Engine:** Claude API, Haiku 4.5 (`claude-haiku-4-5-20251001`). One batched call per page/document.
- **10-word rule:** exactly 10, enforced server-side (count → corrective retry → truncate as last resort).
- **First surfaces:** local service + Chrome extension (in-place page rewrite) + local webapp (URLs/files). More surfaces later; all reuse the same service.
- **Vocabulary:** summaries use deliberately plain words — prompt requirement, since "too strong a vocabulary" is half the complaint.
- **Skip rule:** paragraphs ≤ 15 words and headings pass through untouched (summarizing them would expand them).
- **Stack:** Node.js + Express. No frameworks beyond that.

## Architecture

```
tenwords/
├── service/     # Express on localhost:4710 — only component that talks to Anthropic
├── extension/   # Chrome MV3 extension — surface #1
└── webapp/      # static page served by the service — surface #2 (documents/URLs)
```

One brain, many faces: every current and future surface POSTs text blocks to the service and renders what comes back.

## Components

### service/ (Express, localhost:4710)

Holds `ANTHROPIC_API_KEY` in `.env` (gitignored; `.env.example` with placeholder).

- **`POST /summarize`** — body `{ blocks: [{id, text}] }` → `{ tldr, summaries: [{id, text}] }`.
  - All blocks batched into **one** Haiku call returning JSON; same call produces the whole-article TL;DR.
  - Prompt: exactly 10 words per block, plain everyday vocabulary, keep the paragraph's main point.
  - **Enforcement loop:** count words on every summary. Offenders get one corrective retry ("this was N words, make it exactly 10"). Still wrong → truncate to 10. Response never contains a non-10-word line.
- **`POST /extract`** — body is a URL or an uploaded file (PDF / docx / txt) → clean paragraph blocks.
  - URL: fetch + Readability extraction.
  - Files: `pdf-parse` (PDF), `mammoth` (docx), raw read (txt).
- **`GET /`** — serves the webapp.

### extension/ (Chrome MV3)

- Trigger: toolbar button or `Alt+T`.
- Content script selects real content paragraphs: inside `article`/`main` (fallback: densest text container), ≥ 16 words. Headings and short paragraphs untouched.
- Sends blocks to `localhost:4710/summarize`, then rewrites the page **in place**: each paragraph's text replaced by its 10-word line with generous spacing; 10-word TL;DR banner injected at top.
- Toggle (button again, or banner control) restores originals instantly — original nodes kept in memory.
- Service unreachable → small toast "TenWords service not running", no silent failure.

### webapp/ (single static page)

Paste a URL or drop a PDF/docx/txt → calls `/extract` then `/summarize` → renders TL;DR + sectioned 10-word lines.

## Data flow

surface (extension or webapp) → `POST /summarize` on localhost → one Anthropic Haiku call → enforcement loop → JSON back → surface renders/replaces.

## Error handling

- API/network failures return structured errors; surfaces show visible messages, never blank output.
- Service fails fast and exits non-zero on missing key or occupied port.
- No swallowed exceptions; unhandled rejections crash loudly (per global working agreement).

## Testing & verification

- Unit tests: word counter + enforcement loop; paragraph-selection rules. No API needed.
- Integration test: `/summarize` with mocked Anthropic response.
- Rendered proof before "done": extension run on a real article; webapp run with a real PDF.

## Run

- `npm start` (and a `launch.cmd`) starts the service.
- Extension loaded unpacked into Chrome once.

## Cost

~0.1¢ per article at Haiku pricing (one batched call).

## Out of scope (later surfaces)

- Windows-wide hotkey (AutoHotkey/PowerShell shim → same endpoint).
- Firefox port, deployment, auth — not needed for single-user local tool.
