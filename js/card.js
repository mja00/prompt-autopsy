// Canvas renderer for the shareable verdict card.
// Colours mirror the CSS tokens in styles.css; canvas cannot read custom
// properties, so they are repeated here on purpose.

import { num } from "./text.js";

const C = {
  bg: "#0a0a0b",
  surface: "#0c0c0f",
  line: "#26262c",
  line2: "#34343d",
  ink: "#f4f4f2",
  inkDim: "#a4a4ad",
  inkFaint: "#6d6d77",
  accent: "#ff4d1c",
  data: "#c8ff2f",
};

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const W = 1200;
const H = 675;
const SCALE = 2; // exported at 2400x1350 so it stays sharp when X re-encodes it
const PAD = 56;

export function renderCard(canvas, analysis, site) {
  const ctx = canvas.getContext("2d");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  drawBackground(ctx);
  drawHeader(ctx, analysis, site);

  const v = analysis.verdict;

  ctx.textBaseline = "alphabetic";
  ctx.font = `58px ${SANS}`;
  ctx.fillText(v.archetype.emoji, PAD, 138);

  fitText(ctx, v.archetype.name, {
    x: PAD,
    y: 208,
    maxWidth: W - PAD * 2 - 150,
    start: 66,
    min: 32,
    weight: 800,
    family: SANS,
    colour: C.ink,
    tracking: "-1.5px",
  });

  ctx.font = `22px ${MONO}`;
  ctx.fillStyle = C.data;
  ctx.fillText(ellipsize(ctx, v.archetype.tagline, W - PAD * 2), PAD, 244);

  hairline(ctx, 274);

  const punch = punchline(analysis);
  label(ctx, "PRIMARY FINDING", PAD, 306);
  ctx.font = `28px ${SANS}`;
  ctx.fillStyle = C.ink;
  const lines = wrap(ctx, punch, W - PAD * 2 - 210).slice(0, 3);
  lines.forEach((line, i) => ctx.fillText(line, PAD, 344 + i * 36));

  label(ctx, "RELATIONSHIP STATUS WITH AI", PAD, 468);
  ctx.font = `24px ${SANS}`;
  ctx.fillStyle = C.inkDim;
  wrap(ctx, analysis.relationship, W - PAD * 2).slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, PAD, 502 + i * 32);
  });

  hairline(ctx, 566);
  drawStats(ctx, analysis);

  return canvas;
}

function drawBackground(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(-80, -120, 0, -80, -120, 900);
  glow.addColorStop(0, "rgba(255,77,28,0.20)");
  glow.addColorStop(1, "rgba(255,77,28,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.022)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 44) line(ctx, x, 0, x, H);
  for (let y = 0; y < H; y += 44) line(ctx, 0, y, W, y);

  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, 5, H);
}

function drawHeader(ctx, analysis, site) {
  ctx.font = `700 17px ${MONO}`;
  ctx.fillStyle = C.ink;
  ctx.fillText("✚ PROMPT AUTOPSY", PAD, 62);

  ctx.font = `15px ${MONO}`;
  ctx.fillStyle = C.inkFaint;
  ctx.textAlign = "right";
  ctx.fillText(site.url, W - PAD, 56);
  ctx.fillText(headerCount(analysis), W - PAD, 78);
  ctx.textAlign = "left";

  ctx.strokeStyle = C.line;
  hairline(ctx, 96);
}

function drawStats(ctx, analysis) {
  const top = [...analysis.metrics].sort((a, b) => b.value - a.value).slice(0, 3);
  const colW = (W - PAD * 2) / 3;
  top.forEach((metric, i) => {
    const x = PAD + i * colW;
    ctx.font = `700 38px ${MONO}`;
    ctx.fillStyle = i === 0 ? C.accent : C.ink;
    ctx.fillText(String(metric.value), x, 616);

    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(ellipsize(ctx, metric.label.toUpperCase(), colW - 24), x, 641);

    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(ellipsize(ctx, metric.stat, colW - 24), x, 660);
  });
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = C.inkFaint;
}

function punchline(analysis) {
  const loud = analysis.metrics.filter((m) => m.value >= 45).sort((a, b) => b.value - a.value);
  const pick = loud[0] || [...analysis.metrics].sort((a, b) => b.value - a.value)[0];
  return pick ? pick.joke : "Insufficient evidence. Which is its own finding.";
}

function label(ctx, text, x, y) {
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = C.inkFaint;
  ctx.fillText(spaced(text), x, y);
}

function spaced(text) {
  return text.split("").join("\u2009");
}

function hairline(ctx, y) {
  ctx.strokeStyle = C.line2;
  ctx.lineWidth = 1;
  line(ctx, PAD, y, W - PAD, y);
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function ellipsize(ctx, text, maxWidth) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function fitText(ctx, text, opts) {
  const { x, y, maxWidth, start, min, weight, family, colour, tracking } = opts;
  let size = start;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > min);
  if (tracking && "letterSpacing" in ctx) ctx.letterSpacing = tracking;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  if (tracking && "letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

export function cardBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas produced no image"))), "image/png");
  });
}

// Exported so the count line can be tested without a canvas: this is the
// artifact people screenshot, and it must not claim a count the run that
// produced it denies. analyze() counts only the capped slice.
export function headerCount(analysis) {
  const counted = analysis.truncated
    ? `${num(analysis.messageCount)} of ${num(analysis.messageCount + analysis.droppedCount)} messages`
    : `${num(analysis.messageCount)} messages`;
  return `${counted} · ${num(analysis.tokens)} tokens`;
}

// The text half of the share: what people actually paste into the composer.
export function shareText(analysis, site) {
  const v = analysis.verdict;
  const top = [...analysis.metrics].sort((a, b) => b.value - a.value).slice(0, 3);
  const bars = analysis.metrics
    .map((m) => `${bar(m.value)} ${m.label} ${m.value}`)
    .join("\n");
  return [
    `I ran an autopsy on my own AI chats. Verdict: ${v.archetype.emoji} ${v.archetype.name}`,
    "",
    `"${v.archetype.tagline}"`,
    "",
    top.map((m) => `${m.stat} — ${m.label}`).join("\n"),
    "",
    bars,
    "",
    analysis.relationship,
    "",
    `Paste your own (nothing is uploaded, there is no server): ${site.href}`,
  ].join("\n");
}

function bar(value) {
  const filled = Math.round(value / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}
