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

Long articles take 1-3 minutes to condense (one batched Haiku call covers
the whole document) and cost roughly a tenth of a cent per document.

## Use it

**On any webpage:** load `extension/` unpacked via `chrome://extensions`
(Developer mode → Load unpacked). Then click the TenWords icon or press
**Alt+T** on any article. Press again (or "restore original") to undo.

**On documents, URLs, and pasted text:** open http://localhost:4710 —
paste a URL, drop a PDF/docx/txt, or paste raw text (a long Claude or
ChatGPT answer, meeting notes, anything) into the text box and hit
Condense (Ctrl+Enter works too).

## How it works

Surfaces send paragraph blocks to `POST /summarize`; the service makes
one batched Haiku call, counts every summary's words, retries offenders
once, and deterministically fixes anything still wrong — you never see
a line that isn't exactly ten words. `POST /extract` turns URLs
(Readability) and files (pdf-parse / mammoth) into blocks.

## API

`POST /summarize` — `{"blocks":[{"id":"p0","text":"..."}]}` →
`{"tldr":"...","summaries":[{"id":"p0","text":"..."}]}`

`POST /extract` — multipart `file` (pdf/docx/txt), `{"url":"..."}`, or
`{"text":"..."}` (raw pasted text, paragraphs split on blank lines) →
`{"blocks":[{"id":"p0","text":"..."}]}`

## Develop

- `npm test` — full suite (no API key needed; Anthropic client is mocked)
- Service code in `service/`, extension in `extension/`, webapp in `webapp/`
