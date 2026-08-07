# Chrome Web Store listing — TenWords

Everything needed to submit `dist/tenwords-0.3.0.zip` (rebuild any time with
`powershell Compress-Archive -Path extension\* -DestinationPath dist\tenwords-0.3.0.zip -Force`).

## Listing fields

**Name:** TenWords

**Summary (≤132 chars):**
Every paragraph becomes exactly ten words. Condense any article in place,
skim it, restore with one click.

**Category:** Productivity → Tools

**Language:** English

**Description:**

TenWords rewrites the page you are reading so every paragraph is exactly
ten words, with a ten-word TL;DR pinned on top. It is not a summary panel
next to the page: the page itself collapses in place, paragraph by
paragraph, and one click restores the original.

How to use it:
- Press Alt+T (or click the ¶ icon) on any article.
- Or select part of a page, right-click, and choose Condense selection.
- Press again or hit "restore original" to get the full text back.

Setup: open the extension options and paste your own Anthropic API key.
Summaries are generated with Claude Haiku; a long article costs roughly a
tenth of a cent of API usage. Your key stays in your browser profile and is
sent only to api.anthropic.com. (Alternative for developers: run the
open-source local TenWords service and skip the key.)

The ten-word guarantee is enforced in code, not trusted from the model:
word counts are checked, wrong summaries are retried with the reason, and
anything still off is fixed deterministically. Long documents run in
parallel batches and stream onto the page as they finish, so a
10,000-word article condenses in about half a minute.

TenWords collects nothing. No accounts, no servers of ours, no analytics.

**Homepage:** https://tenwords-app.vercel.app
**Privacy policy:** https://tenwords-app.vercel.app/privacy.html

## Screenshots (1280×800, in docs/store-assets/)

1. `shot-extension.png` — an article condensed in place with the TL;DR banner
2. `shot-webapp.png` — the companion web page with a condensed document
3. `shot-options.png` — the options page (BYOK setup)

## Privacy tab answers

**Single purpose:** Condense the text of the current page into ten-word
paragraph summaries, in place, at the user's request.

**Permission justifications:**
- `activeTab` — access the current page's text only when the user clicks
  the icon, presses the shortcut, or uses the context menu.
- `scripting` — inject the content script that replaces paragraphs and
  restores them.
- `storage` — store the user's own Anthropic API key locally.
- `contextMenus` — the "Condense selection" right-click item.
- Host `https://api.anthropic.com/*` — send paragraph text to the user's
  own Anthropic account to generate summaries.
- Host `http://localhost:4710/*` — optional mode that talks to the
  open-source TenWords service running on the user's machine instead.

**Data usage disclosure:** Website content (page text) is transmitted to
Anthropic's API solely to generate the summaries the user requested; it is
not collected, stored, or shared by the developer. Authentication
information (the user's own API key) is stored locally and transmitted only
to api.anthropic.com. No data is sold, no data is used for unrelated
purposes, no data is used for creditworthiness.

**Remote code:** No. All executed code ships in the package; the API
returns data (JSON text), not code.

## Submission steps

1. Create/log into the developer account at
   https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. New item → upload `dist/tenwords-0.3.0.zip`.
3. Paste the listing fields above; upload the three screenshots.
4. Privacy tab: fill in the single purpose, justifications, and data
   disclosures above; set the privacy policy URL.
5. Distribution: Public, all regions. Submit for review (typically 1-3
   days for a first extension).
