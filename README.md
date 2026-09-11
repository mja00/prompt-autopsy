# Prompt Autopsy

Paste your AI chats. Get a clinical readout of how you treat a machine that cannot be hurt,
cannot remember, and has never once deserved your apology.

**Live:** https://prompt-autopsy.pages.dev

---

## Why it can go viral without costing anything

Every request is a static file fetch from Cloudflare's CDN. There is no function, no database,
no third-party API, and no per-request compute anywhere in the stack. Cloudflare Pages serves
static assets with **unlimited bandwidth and unlimited requests** on the free plan.

Concretely, this means:

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
  samples.js          three demo conversations
  app.js              DOM wiring, share, drag-and-drop, gallery
test/engine.test.mjs  16 tests covering parsing, scoring separation, and edge cases
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
npm test        # 18 engine tests
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
> stay on classic Pages, deliberately: Workers Free is capped at ~100k requests/day, and this
> page costs ~9 requests per view (document + 6 ES modules + CSS + icon), so that cap would bite
> at roughly 11k pageviews — exactly the viral spike this design exists to survive. Pages static
> assets have no such per-day request limit. **Do not pass `--force` again**, and do not migrate
> to Workers.

## Design decisions

**No leaderboard, no shared results, no accounts.** All three need a server and a database, and
all three would mean holding other people's conversations. Results are not stored, not counted,
and not visible to anyone including the operator. This is the trade the project refuses to make,
and the method section says so on the page.

**Share text includes the link.** The "Copy the post text" output ends with the URL, because a
screenshot in a reply is worth less than a link someone can click.

**Small samples are flagged.** Under five messages the verdict is stamped `tentative` and the
UI says so. Confident nonsense from three prompts is how this genre of site loses credibility.

**The `the-normal-one` archetype is gated.** An archetype defined by the *absence* of signal
would otherwise win every unremarkable profile by default, so it is only eligible when no axis
is high and there are at least six messages.

## Verification

- `npm test` — 18/18 passing. Includes a profile-separation test asserting eight distinguishable
  writing styles produce eight distinguishable verdicts (this is the test that catches scoring
  regressions), and a test pinning each demo button's label to the verdict it actually produces.
- Production smoke test in a real Chromium against the deployed site: zero console errors, zero
  failed requests under CSP, `0 external requests` reported by the runtime badge, all three
  samples returning their intended verdict, card rendering at 2400×1350.
- `og.png` verified live: HTTP 200, `image/png`, exactly 1200×630, matching its declared
  `og:image:width` / `og:image:height`.
- Edge cases exercised in the browser: empty input, unlabelled paste, and the
  "everything I paste is mine" override.
