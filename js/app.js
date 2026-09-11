import { parse, toPrompts } from "./parse.js";
import { analyze, SATURATION, MIN_CONFIDENT } from "./analyze.js";
import { ARCHETYPES, AXES } from "./archetypes.js";
import { SAMPLES } from "./samples.js";
import { renderCard, cardBlob, shareText } from "./card.js";

const $ = (id) => document.getElementById(id);
const el = {
  input: $("input"),
  drop: $("drop"),
  dropOverlay: $("dropOverlay"),
  runBtn: $("runBtn"),
  loadSampleTop: $("loadSampleTop"),
  assumeAll: $("assumeAll"),
  detect: $("detect"),
  notice: $("notice"),
  report: $("report"),
  findings: $("findings"),
  exhibits: $("exhibits"),
  share: $("share"),
  metrics: $("metrics"),
  verdictEmoji: $("verdictEmoji"),
  verdictName: $("verdictName"),
  verdictTagline: $("verdictTagline"),
  verdictBlurb: $("verdictBlurb"),
  verdictRel: $("verdictRel"),
  verdictRunner: $("verdictRunner"),
  headline: $("headline"),
  exhibitList: $("exhibitList"),
  canvas: $("cardCanvas"),
  gallery: $("galleryGrid"),
  shareBtn: $("shareBtn"),
  downloadBtn: $("downloadBtn"),
  copyBtn: $("copyBtn"),
  shareStatus: $("shareStatus"),
  privacyBadge: $("privacyBadge"),
  privacyText: $("privacyText"),
  stamp: $("stamp"),
};

let current = null;

// A single missing id used to take the whole page down silently: the module
// threw during evaluation, so nothing attached and nothing appeared to be
// wrong. Fail loudly and name the offenders instead.
{
  const missing = Object.entries(el).filter(([, node]) => !node).map(([key]) => key);
  if (missing.length) {
    throw new Error(`index.html is missing elements required by app.js: ${missing.join(", ")}`);
  }
}

/* ---------------------------------------------------------------- privacy --
 * The claim on the page is "no network requests after load". Rather than
 * asserting it in prose, read it out of the browser's own resource timing
 * buffer and show the count. If someone adds a fetch later, the badge
 * turns red without anyone having to remember to update the copy. */

let externalRequests = 0;

function checkNetwork() {
  externalRequests = performance.getEntriesByType("resource")
    .map((e) => e.name)
    .filter((name) => !name.startsWith(location.origin))
    .length;
  el.privacyBadge.classList.toggle("ok", externalRequests === 0);
  el.privacyBadge.classList.toggle("bad", externalRequests > 0);
  renderPrivacyText();
}

// The full sentence is ~360px of unbreakable text, which pushed the sticky
// header to 550px on a 390px phone and gave the whole page a horizontal
// scrollbar — on the surface most of this will actually be read on. Narrow
// viewports get a shorter form and the title attribute keeps the full sentence.
// Only the number is set here. Which suffix is visible is decided by CSS media
// queries, because measuring the viewport in JS raced against layout at 320px
// and picked the wrong tier.
function renderPrivacyText() {
  el.privacyText.textContent = externalRequests === 0 ? "0" : String(externalRequests);
  const full = externalRequests === 0
    ? "0 external requests · nothing leaves this page"
    : `${externalRequests} external request${externalRequests === 1 ? "" : "s"} — see network tab`;
  el.privacyBadge.title = `${full}. Counted at runtime from the browser's own resource timings.`;
}

function watchNetwork() {
  checkNetwork();
  if (typeof PerformanceObserver === "function") {
    try {
      new PerformanceObserver(checkNetwork).observe({ type: "resource", buffered: true });
    } catch {
      /* Resource timing is unsupported; the initial count still stands. */
    }
  }
  window.matchMedia("(max-width: 700px)").addEventListener("change", renderPrivacyText);
}

/* ----------------------------------------------------------------- notice -- */

// Transient inline feedback for the drop path, plus the sticky truncation
// notice. Deliberately not a toast overlay: nothing here should cover the
// results the user just waited for.
let noticeTimer = 0;

function showNotice(message, { bad = false, sticky = false } = {}) {
  clearTimeout(noticeTimer);
  const box = $("notice");
  if (!message) {
    box.hidden = true;
    return;
  }
  box.textContent = message;
  box.classList.toggle("bad", bad);
  box.hidden = false;
  // Anything the reader must not miss stays put. A timer that removes the only
  // trace of dropped messages would leave "messages read 1,500" standing over a
  // report actually drawn from 4,000.
  if (!sticky && !bad) noticeTimer = setTimeout(() => { box.hidden = true; }, 4000);
}

/* ------------------------------------------------------------------- run -- */

function run() {
  const raw = el.input.value;
  const parsed = parse(raw, { assumeAllMine: el.assumeAll.checked });
  const prompts = toPrompts(parsed);

  renderDetection(parsed, prompts);

  if (!prompts.length) {
    // Without this, a previous report stays on screen underneath a
    // "0 messages of yours" header, which reads as a result rather than a
    // failure to parse.
    for (const section of [el.report, el.findings, el.exhibits, el.share]) section.hidden = true;
    // The truncation notice is sticky, so it has to be cleared here too —
    // otherwise emptying the box leaves "held 4,000 messages" standing over an
    // empty input.
    showNotice(null);
    current = null;
    el.detect.hidden = false;
    el.detect.scrollIntoView({ block: "center" });
    return;
  }

  current = analyze(prompts);
  if (current.truncated) {
    showNotice(
      `That input held ${(current.messageCount + current.droppedCount).toLocaleString()} messages. The first ${current.messageCount.toLocaleString()} were analysed — the rest were skipped so the page stayed responsive.`,
      { sticky: true },
    );
  } else {
    showNotice(null);
  }
  renderVerdict(current);
  renderGallery(current.verdict.archetype.id);
  renderMetrics(current);
  renderExhibits(current);
  renderCard(el.canvas, current, site());
  resetShareStatus();
  [el.report, el.findings, el.exhibits, el.share].forEach((s) => (s.hidden = false));
  el.report.scrollIntoView({ block: "start" });
}

function site() {
  const href = location.origin + location.pathname;
  return { href, url: location.host + location.pathname };
}

/* ------------------------------------------------------------- detection -- */

function renderDetection(parsed, prompts) {
  el.detect.hidden = false;
  const methodLabels = {
    labelled: "<b>speaker labels</b> — took only the lines attributed to you",
    inline: "<b>inline labels</b> — took only the lines attributed to you",
    "conversations.json": "<b>ChatGPT export</b> — read locally, system turns dropped",
    raw: "<b>no labels</b> — guessed at alternating turns",
    "assume-all-mine": "<b>your own messages only</b> — every block counted as yours",
    empty: "<b>nothing</b>",
  };

  const head = document.createElement("div");
  head.className = "detect-head";
  head.innerHTML = `
    <span>Parsed: ${methodLabels[parsed.method] || parsed.method}</span>
    <span>${parsed.turns.length} turn${parsed.turns.length === 1 ? "" : "s"} found</span>
    <span>${prompts.length} message${prompts.length === 1 ? "" : "s"} of yours</span>
  `;
  for (const warning of parsed.warnings) {
    const span = document.createElement("span");
    span.className = "warn";
    span.textContent = `⚠ ${warning}`;
    head.appendChild(span);
  }

  const list = document.createElement("div");
  list.className = "turnlist";
  for (const turn of parsed.turns.slice(0, 200)) {
    const row = document.createElement("div");
    row.className = `turn${turn.role === "user" ? " mine" : ""}`;
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = turn.role === "user" ? "you" : "them";
    const body = document.createElement("span");
    body.className = "body";
    body.textContent = turn.text.length > 460 ? `${turn.text.slice(0, 460)}…` : turn.text;
    row.append(role, body);
    list.appendChild(row);
  }

  const hint = document.createElement("p");
  hint.className = "hint tiny";
  hint.innerHTML = parsed.turns.length > 200
    ? "Showing the first 200 turns. All of them were counted."
    : "Check the split below before trusting the numbers. If it is wrong, tick the box and re-run, or paste only your own messages.";

  el.detect.replaceChildren(head, list, hint);
}

/* --------------------------------------------------------------- verdict -- */

function renderVerdict(a) {
  const v = a.verdict;
  el.verdictEmoji.textContent = v.archetype.emoji;
  el.verdictName.textContent = v.archetype.name;
  el.verdictTagline.textContent = `“${v.archetype.tagline}”`;
  el.verdictBlurb.textContent = v.archetype.blurb;
  el.verdictRel.textContent = a.relationship;
  el.stamp.textContent = v.smallSample ? "tentative" : "verified";

  const bits = [];
  if (v.secondaryTrait) bits.push(`secondary finding: ${v.secondaryTrait}`);
  if (a.topRepeat) bits.push(`you asked essentially the same thing ${a.topRepeat.run} times`);
  bits.push(`next closest verdict: ${v.runnerUp.name} (${a.ranked[1].score.toFixed(0)} vs ${a.ranked[0].score.toFixed(0)})`);
  el.verdictRunner.textContent = bits.join(" · ");

  const cells = [
    // The cap is disclosed in the cell label, not only in the transient
    // notice — a screenshot of the report should not imply the whole input was
    // read when most of it was skipped.
    {
      k: a.truncated ? `messages read (of ${(a.messageCount + a.droppedCount).toLocaleString()})` : "messages read",
      v: String(a.messageCount),
    },
    { k: "tokens you spent", v: a.tokens.toLocaleString() },
    { k: "median prompt", v: `${a.medianWords} words` },
    { k: "verdict confidence", v: a.sampleNote ? "low" : "normal", small: true },
  ];
  el.headline.replaceChildren(...cells.map((c) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = c.k;
    const val = document.createElement("div");
    val.className = `v${c.small ? " small" : ""}`;
    val.textContent = c.v;
    cell.append(k, val);
    return cell;
  }));

  if (a.sampleNote) {
    const note = document.createElement("div");
    note.className = "cell";
    note.style.gridColumn = "1 / -1";
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = "small sample warning";
    const val = document.createElement("div");
    val.className = "v small";
    val.textContent = a.sampleNote;
    note.append(k, val);
    el.headline.appendChild(note);
  }
}

/* --------------------------------------------------------------- metrics -- */

function renderMetrics(a) {
  const items = a.metrics.map((metric) => {
    const li = document.createElement("li");
    li.className = `metric${metric.value >= 60 ? " hot" : metric.value <= 20 ? " cool" : ""}`;
    li.innerHTML = `
      <div class="metric-top">
        <span class="metric-name">${metric.label}</span>
        <span class="metric-val">${metric.value}<span class="of">/100</span></span>
      </div>
      <div class="metric-stat">${escapeHtml(metric.stat)}</div>
      <div class="bar"><i data-w="${metric.value}"></i></div>
      <p class="metric-evidence">${escapeHtml(metric.evidence)}</p>
      <p class="metric-joke">${escapeHtml(metric.joke)}</p>
    `;
    return li;
  });
  el.metrics.replaceChildren(...items);
  requestAnimationFrame(() => {
    for (const fill of el.metrics.querySelectorAll(".bar i")) {
      fill.style.width = `${fill.dataset.w}%`;
    }
  });
}

/* -------------------------------------------------------------- exhibits -- */

function renderExhibits(a) {
  // Quote only from the analysed slice. On a capped input the raw prompts run
  // longer, and an exhibit drawn from a skipped message would contradict the
  // "messages read" figure directly above it.
  const prompts = a.analyzedMessages;
  const out = [];

  if (a.wildest) {
    out.push({
      title: "Exhibit A1 — the message that did the most",
      body: a.wildest.text,
      note: "Chosen for density of caps, emoji, exclamation and shouting, not for content.",
    });
  }
  if (a.topRepeat) {
    out.push({
      title: `Exhibit A2 — asked ${a.topRepeat.run} times`,
      body: a.topRepeat.text,
      note: "Later attempts were near-copies of this. Repeating a sentence is not a prompt strategy.",
    });
  }
  const longest = [...prompts].sort((x, y) => y.length - x.length)[0];
  if (longest && longest.length > 120) {
    out.push({
      title: `Exhibit A3 — the longest thing you typed (${longest.length} chars)`,
      body: longest,
      note: "The actual request is usually in the last line of these.",
    });
  }
  const shortest = [...prompts].sort((x, y) => x.length - y.length)[0];
  if (shortest && shortest.length < 30) {
    out.push({
      title: "Exhibit A4 — the least effort expended",
      body: shortest,
      note: "No context, no courtesy, no ambiguity about what you want.",
    });
  }

  el.exhibitList.replaceChildren(...out.map((item) => {
    const div = document.createElement("div");
    div.className = "exhibit";
    const h = document.createElement("h5");
    h.textContent = item.title;
    const q = document.createElement("blockquote");
    q.textContent = item.body;
    const n = document.createElement("p");
    n.className = "note";
    n.textContent = item.note;
    div.append(h, q, n);
    return div;
  }));
}

/* ----------------------------------------------------------------- share -- */

function resetShareStatus() {
  el.shareStatus.textContent = "1200 × 675 — sized for the timeline.";
}

async function share() {
  if (!current) return;
  const text = shareText(current, site());
  try {
    const blob = await cardBlob(el.canvas);
    const file = new File([blob], "prompt-autopsy.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ text, files: [file] });
      el.shareStatus.textContent = "Shared.";
      return;
    }
    if (navigator.share) {
      await navigator.share({ text, url: site().href });
      el.shareStatus.textContent = "Shared the text. The card is one click away under Download PNG.";
      return;
    }
    download();
    el.shareStatus.textContent = "This browser has no share sheet — the card was downloaded and the text copied.";
    await copyText(text);
  } catch (error) {
    if (error?.name === "AbortError") return;
    el.shareStatus.textContent = `Share failed (${error.message}). Try Download PNG.`;
  }
}

function download() {
  el.canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prompt-autopsy.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context and permission; fall back to a
    // hidden textarea so this still works when opened from disk.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/* --------------------------------------------------------------- gallery -- */

const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
  "Nineteen", "Twenty",
];

function numberWord(n) {
  return NUMBER_WORDS[n] ?? String(n);
}

function renderGallery(winnerId) {
  const count = $("galleryCount");
  if (count) count.textContent = numberWord(ARCHETYPES.length);
  el.gallery.replaceChildren(...ARCHETYPES.map((a) => {
    const card = document.createElement("div");
    card.className = `gcard${a.id === winnerId ? " you" : ""}`;
    card.innerHTML = `
      <div class="ge">${a.emoji}</div>
      <div class="gn">${a.name}</div>
      <div class="gt">${escapeHtml(a.tagline)}</div>
    `;
    return card;
  }));
}

/* ----------------------------------------------------------- saturation -- */

// Rendered from the same constant the scoring uses, so the published rubric
// cannot drift away from the maths it describes.
function renderSaturation() {
  // The method copy quotes the same constant the verdict gate uses, so
  // "paste at least N" and the tentative-stamp threshold cannot disagree.
  const minEl = $("minConfident");
  if (minEl) minEl.textContent = String(MIN_CONFIDENT);

  const table = $("saturation");
  if (!table) return;

  const head = document.createElement("tr");
  for (const [text, cls] of [["Axis", "axis"], ["Reads 100 at", "num"], ["Measured as", "unit"]]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.className = cls;
    th.textContent = text;
    head.appendChild(th);
  }
  const thead = document.createElement("thead");
  thead.appendChild(head);

  const tbody = document.createElement("tbody");
  for (const { id, label } of AXES) {
    const { fullAt, unit, percent } = SATURATION[id];
    const tr = document.createElement("tr");
    const axis = document.createElement("td");
    axis.className = "axis";
    axis.textContent = label;
    const num = document.createElement("td");
    num.className = "num";
    num.textContent = percent ? `${fullAt}%` : fullAt >= 10 ? String(fullAt) : fullAt.toFixed(1);
    const u = document.createElement("td");
    u.className = "unit";
    u.textContent = unit;
    tr.append(axis, num, u);
    tbody.appendChild(tr);
  }

  table.replaceChildren(thead, tbody);
}

/* ------------------------------------------------------------------ boot -- */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSample(name) {
  const sample = SAMPLES[name];
  if (!sample) return;
  el.input.value = sample.text;
  el.assumeAll.checked = false;
  run();
}

el.runBtn.addEventListener("click", run);
el.shareBtn.addEventListener("click", share);
el.downloadBtn.addEventListener("click", () => {
  download();
  el.shareStatus.textContent = "Card downloaded at 2400 × 1350.";
});
el.copyBtn.addEventListener("click", async () => {
  if (!current) return;
  const ok = await copyText(shareText(current, site()));
  el.shareStatus.textContent = ok
    ? "Post text copied — including the link back here."
    : "Could not reach the clipboard. Select the text from the card instead.";
});
el.loadSampleTop.addEventListener("click", () => {
  loadSample("apologetic");
});
for (const btn of document.querySelectorAll("[data-sample]")) {
  btn.addEventListener("click", () => loadSample(btn.dataset.sample));
}

// Keyboard shortcut: cmd/ctrl+enter runs, which is what everyone tries.
el.input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    run();
  }
});

// Drop a conversations.json straight in. Read with the File API — the file is
// never sent anywhere, because there is nowhere to send it.
const MAX_FILE_BYTES = 64 * 1024 * 1024;

for (const type of ["dragenter", "dragover"]) {
  el.drop.addEventListener(type, (event) => {
    event.preventDefault();
    el.drop.classList.add("over");
  });
}
el.drop.addEventListener("dragleave", () => el.drop.classList.remove("over"));

el.drop.addEventListener("drop", async (event) => {
  // MUST be prevented. Without it the browser's default drop action navigates
  // the tab to the dropped file, replacing the app — the exact opposite of what
  // the overlay promises.
  event.preventDefault();
  el.drop.classList.remove("over");

  const file = event.dataTransfer?.files?.[0];
  if (!file) return;

  if (file.size > MAX_FILE_BYTES) {
    showNotice(`That file is ${Math.round(file.size / 1048576)} MB. The limit is 64 MB.`, { bad: true });
    return;
  }
  const looksJson = /\.json$/i.test(file.name) || file.type.includes("json");
  if (!looksJson) {
    showNotice(`${file.name} is not a .json file. Paste your messages into the box instead.`, { bad: true });
    return;
  }

  showNotice(`Reading ${file.name} locally…`);
  try {
    el.input.value = await file.text();
  } catch (error) {
    showNotice(`Could not read that file: ${error.message}`, { bad: true });
    return;
  }
  el.assumeAll.checked = false;
  showNotice(null);
  run();
});

// Element-scoped protection only covers the drop zone, so releasing a file a
// few pixels off it would still navigate the tab away and discard whatever was
// pasted. Killing the default for the whole document means a near-miss is
// harmless. The panel handler above still does the actual reading.
for (const type of ["dragover", "drop"]) {
  document.addEventListener(type, (event) => {
    if (!el.drop.contains(event.target)) event.preventDefault();
  });
}

renderGallery(null);
renderSaturation();
watchNetwork();

if (location.hash === "#evidence") el.input.focus({ preventScroll: true });
