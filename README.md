# TenWords

Every paragraph becomes exactly ten words. A local service + Chrome
extension + web page that condense verbose text (webpages, PDFs, docx,
txt) into 10-word-per-paragraph summaries with a 10-word TL;DR.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.
3. `launch.cmd` (or `npm start`) — service runs on http://localhost:4710

The Chrome extension always talks to `http://localhost:4710` (hardcoded), so
the service must run on that port for the extension to work. `PORT` in `.env`
only changes the port for direct webapp/API use.

## What to expect

Documents are condensed in parallel batches of 40 paragraphs (up to 4
batches at once), and summaries stream in as each batch finishes — a
typical long article completes in 20-40 seconds and costs roughly a
tenth of a cent.

## Use it

**On any webpage:** load `extension/` unpacked via `chrome://extensions`
(Developer mode → Load unpacked). Then click the TenWords icon or press
**Alt+T** on any article. Press again (or "restore original") to undo.

**On documents, URLs, and pasted text:** open http://localhost:4710 —
paste a URL, drop a PDF/docx/txt, or paste raw text (a long Claude or
ChatGPT answer, meeting notes, anything) into the text box and hit
Condense (Ctrl+Enter works too).

## How it works

Surfaces send paragraph blocks to `POST /summarize`; the service splits
them into batches of 40, runs up to 4 batched Haiku calls in parallel,
counts every summary's words, retries offenders once (wrong count or a
sentence that trails off), and deterministically fixes anything still
wrong — you never see a line that isn't exactly ten words. For
multi-batch documents the TL;DR is written from the finished summaries
in one final call. `POST /extract` turns URLs (Readability) and files
(pdf-parse / mammoth) into blocks.

## API

`POST /summarize` — `{"blocks":[{"id":"p0","text":"..."}]}` →
`{"tldr":"...","summaries":[{"id":"p0","text":"..."}]}`

With `Accept: application/x-ndjson` the same endpoint streams progress
as NDJSON lines instead: `{"type":"batch","summaries":[...]}` per
finished batch, then `{"type":"tldr","tldr":"..."}`, then
`{"type":"done"}` (or `{"type":"error","error":"..."}`).

`POST /extract` — multipart `file` (pdf/docx/txt), `{"url":"..."}`, or
`{"text":"..."}` (raw pasted text, paragraphs split on blank lines) →
`{"blocks":[{"id":"p0","text":"..."}]}`

## Develop

- `npm test` — full suite (no API key needed; Anthropic client is mocked)
- Service code in `service/`, extension in `extension/`, webapp in `webapp/`
