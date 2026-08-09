# tenwords.io remake — "the page condenses itself"

Approved 2026-08-09. The site performs the product's arc: loud, then quiet.

## Concept

The visitor lands on the LOUD state: a full viewport of dense, real
long-form copy about TenWords (cramped leading, no whitespace relief,
genuinely readable — no filler). After ~1.5s, or instantly on clicking the
¶ button (Alt+T also works, as an in-joke for extension users), the
CONDENSING state runs: the extension's paper TL;DR banner drops in,
paragraphs fold one by one to their exactly-ten-word lines with red
pilcrows, using the same easing/stagger family as the real extension. The
settled CALM state is the actual marketing site. `restore original` at the
top toggles back to loud; re-condensing after that is instant.

## States

- `loud` — dense article layout; every paragraph has a `data-ten`
  attribute carrying its ten-word line.
- `condensing` — banner drops, staggered folds, ~2.5s total.
- `calm` — condensed lines become the site's section headlines with
  expandable supporting detail (native `<details>` where possible).

Total loud-to-calm run stays under 4 seconds and is skippable (scroll or
click jumps straight to calm). `prefers-reduced-motion`: loads calm, with
a "see it loud" control that swaps states without animation.

## Calm-state content order

1. Pinned TL;DR: "Every paragraph becomes exactly ten words. The page
   just collapsed."
2. How it works (Alt+T / right-click Condense selection / restore).
3. The guarantee (counts enforced in code; retry with reason;
   deterministic fix; the model is never trusted).
4. Proof: launch film (`docs/marketing/launch.mp4` copied into `site/`),
   poster-framed at the completed-fold moment, click-to-play with sound,
   lazy-loaded.
5. Privacy/BYOK: key stays in the browser, text only to Anthropic, no
   analytics, ~a tenth of a cent per long article, paste the key once.
6. CTA: Chrome Web Store button + install-from-source details.

Copy source: the council-hardened brief (animations repo,
out/tenwords/marketing/brief.json). Every visible section headline is
exactly ten words; a check script counts them against the DOM.

## Visual system

Existing brand tokens unchanged: paper #fbfbfb, ink #1f1f1f, muted
#595959, hairline #e2e2e2, pilcrow red #9c2f26 (accent budget: pilcrows,
small ticks, the emphasis word, CTA underline — never fills or full
sentences). Charter/'Sitka Text'/Cambria/Georgia serif stack. Dark mode
palette as today. Zero glow, zero gradients.

## Tech

One static `site/index.html`, no dependencies, no build step. privacy.html
and OG/meta tags unchanged. Page weight excluding the film < ~150KB; the
film lazy-loads below the fold. Vercel static deploy as today.

## Verification

1. Clickable draft reviewed in a browser BEFORE replacing index.html
   (mock-before-wire).
2. Playwright pass: three states, restore toggle, reduced-motion path,
   no console errors, no layout shift after settle.
3. Ten-word DOM check: script counts words of every `data-ten` line and
   section headline; exit non-zero on any count that is not ten.
4. Deploy, then verify live: curl + one rendered screenshot.
