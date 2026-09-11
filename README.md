# Prompt Autopsy

Paste your AI chats. Get a clinical readout of how you treat a machine that cannot be hurt,
cannot remember, and has never once deserved your apology.

**Live:** https://prompt-autopsy.pages.dev

---

## Why it can go viral without costing anything

Every request is a static file fetch from Cloudflare's CDN. There is no function, no database,
no third-party API, and no per-request compute anywhere in the stack.

This is verifiable, not assumed. Cloudflare's Pages limits page
([developers.cloudflare.com/pages/platform/limits](https://developers.cloudflare.com/pages/platform/limits/),
checked Sep 2026) lists Free-plan limits for builds (500/month), custom domains, file count, file
size and header rules — and **no request or bandwidth limit for static assets**. The same page
states that "requests to Pages functions count towards your quota for Workers plans", which is
the trap: Functions and Workers Free are capped at ~100k requests/day, and a cold load here is 11
requests, so that cap would bite at roughly 9k pageviews — the exact spike this design is meant to
survive. Serving pure static assets sidesteps it entirely.

Concretely:

- A traffic spike of 10 million visits costs **$0**. There is no meter to run.
- There is no backend to fall over, rate-limit, or fan out into a paid service.
- There is nothing to scale, because nothing is executed server-side.

The one thing that *would* have cost money is a leaderboard or result-sharing backend. That was
deliberately not built — see [Design decisions](#design-decisions).

## How the privacy claim is enforced, not just asserted

The page says nothing is uploaded. Three things make that checkable rather than marketing:

1. **The badge counts requests at runtime.** It reads
   `performance.getEntriesByType("resource")` and reports how many external requests were made.
   If someone adds a `fetch()` later, the badge turns red without anyone remembering to update
   the copy.
2. **`connect-src 'none'`** in the Content-Security-Policy makes any future network call from
   the page fail loudly instead of quietly exfiltrating a paste.
3. **Nothing is persisted.** No cookies, no `localStorage`, no analytics. The only copy of a
   conversation is the one in the user's clipboard.

## Architecture

```
index.html            single page, no framework
styles.css            all styling; system fonts only, zero webfont requests
og.html               source for the 1200x630 social card, rendered offline
og.png                the actual social card (checked in, 1200x630)
_headers              CSP + cache policy for Cloudflare Pages
js/
  text.js             pure text primitives (word counts, token estimate, similarity)
  parse.js            turn extraction; handles labelled / inline / raw / conversations.json
  archetypes.js       15 archetypes + the scoring function
  analyze.js          the engine: nine measured axes, evidence, verdict
  card.js             canvas renderer for the shareable card
  samples.js          three demo conversations (each deliberately past MIN_CONFIDENT turns,
                      so the showcase verdicts render as verified rather than tentative)
  app.js              DOM wiring, share, drag-and-drop, gallery
test/engine.test.mjs  engine tests: parsing, scoring separation, caps, thresholds
tools/build.mjs       builds dist/, rewrites absolute URLs, guards against dev files shipping
```

No build step, no bundler, no npm dependencies. `dist/` is a copy of a handful of files.

## Scoring

Nine axes, each measured from the user's own words: apology, grovel, machine abuse, retry
spiral, micro-management, backstory dumping, bot flattery, chaos, deadline panic.

Verdicts are a **weighted distance to each archetype's ideal profile**, not a dot product. The
distinction matters and was a real bug: a dot product punished an archetype for every axis it
wanted *low*, so an archetype with a large negative weight lost ~200 points even when that axis
read a clean zero, and archetypes that simply mentioned fewer axes won by omission. Axes an
archetype does not mention are still not free — they carry an implicit claim of "should be low".

Bars are a threshold rubric with saturation points, not a fake percentile, and the page says so.

## Develop

```bash
npm test        # engine suite (node:test)
npm run serve   # build dist/ and serve on :8099
npm run og      # re-render og.png from og.html (needs headless Chrome)
npm run deploy  # build and deploy to Cloudflare Pages
```

Deployment targets `https://prompt-autopsy.pages.dev`. To move to a custom domain, pass it
explicitly (the base URL is a required argument — see below) and create the DNS record first:

```bash
node tools/build.mjs https://prompt-autopsy.mart.fyi
npx wrangler pages deploy dist --project-name=prompt-autopsy --branch=main
```

**Custom domain status:** `prompt-autopsy.mart.fyi` is attached to the Pages project but does
**not** resolve. Cloudflare does not auto-create DNS for an API-attached Pages domain, and the
wrangler OAuth token in use has no `dns_records:edit` scope, so the record has to be created by
hand. Add it in the mart.fyi zone:

| Type  | Name            | Content                     | Proxy  |
|-------|-----------------|-----------------------------|--------|
| CNAME | `prompt-autopsy`| `prompt-autopsy.pages.dev`  | on     |

Then confirm before repointing anything:

```bash
curl -sI https://prompt-autopsy.mart.fyi/og.png   # expect 200 + image/png
```

Until that returns 200, keep the `pages.dev` base. A canonical/og URL pointing at a host that
does not resolve makes X render every shared link as a bare text card, which is the whole
distribution mechanism.

## Deploy

```bash
node tools/build.mjs https://your-domain.example   # base URL is required
npx wrangler pages deploy dist --project-name=prompt-autopsy --branch=main
```

`tools/build.mjs` requires the base URL rather than defaulting it, because a wrong absolute
`og:image` host silently downgrades every shared link to a bare text card — and the link preview
is the entire distribution mechanism. A default would let `node tools/build.mjs` run with no
argument and quietly repoint the shipped tags at some other host. The build also fails if any
crawler-facing file points somewhere other than the host being deployed to.

> Wrangler 4.x delegates `pages` commands to Workers. The project was created with `--force` to
> stay on classic Pages, deliberately: Workers Free is capped at ~100k requests/day, and a cold
> load of this page costs 11 requests (measured), so that cap would bite at roughly 9k
> pageviews — precisely the viral spike this design exists to survive. Pages static assets have
> no such per-day request limit. **Do not pass `--force` again**, and do not migrate to Workers.

## Design decisions

**No leaderboard, no shared results, no accounts.** All three need a server and a database, and
all three would mean holding other people's conversations. Results are not stored, not counted,
and not visible to anyone including the operator. This is the trade the project refuses to make,
and the method section says so on the page.

**Share text includes the link.** The "Copy the post text" output ends with the URL, because a
screenshot in a reply is worth less than a link someone can click.

**Small samples are flagged.** Below `MIN_CONFIDENT` (20 messages) the verdict is stamped
`tentative` and the UI says so. The method copy imports the same constant, so the number quoted
and the number enforced cannot drift. Confident nonsense from three prompts is how this genre of
site loses credibility.

**Large inputs are capped, not trusted.** A ChatGPT export can carry thousands of turns, so
`MAX_ANALYZED` (1500) bounds the work and the UI says how many were skipped. The retry-spiral scan
is also bounded-window rather than all-pairs: the original compared every message against every
other one while re-tokenising both sides each time, which on a 5k-message export was ~12.5M
Set-allocating comparisons — minutes of frozen tab on the feature the page calls instant. A
6000-message input now analyses in ~40ms. Token sets are built once per message.

**The `the-normal-one` archetype is gated.** An archetype defined by the *absence* of signal
would otherwise win every unremarkable profile by default, so it is only eligible when no axis
is high and there are at least six messages.

## Verification

Measured against the live deployment in Chromium with the cache disabled:

| Metric | Value |
|---|---|
| Requests on cold load | **11** |
| Requests added by running an autopsy | **0** |
| External (third-party) requests | **0** |
| Total transfer | **42.8 KB** |
| DOMContentLoaded | **195 ms** (170–270 ms across runs) |
| Horizontal overflow, 320px → 1440px | **0px** |

- `npm test` — 25/25 passing. Includes a profile-separation test asserting eight distinguishable
  writing styles produce eight distinguishable verdicts (the test that catches scoring
  regressions), a test pinning each demo button's label to the verdict it produces *and*
  asserting that demo clears `MIN_CONFIDENT` so it cannot render as "tentative", and a test
  asserting every axis has a published saturation point that a rate axis can actually reach.
- Production smoke test in a real Chromium: zero console errors, zero failed requests under CSP,
  `0 external requests` reported by the runtime badge, all three samples returning their intended
  verdict, card rendering at 2400×1350.
- The run adding zero requests is the real proof of the privacy claim: analysing a paste performs
  no network I/O at all.
- `og.png` verified live: HTTP 200, `image/png`, exactly 1200×630, matching its declared
  `og:image:width` / `og:image:height`.
- Edge cases exercised in the browser: empty input (must hide any previous report), unlabelled
  paste (must warn about the guess), and the "everything I paste is mine" override.
