// Turn extraction. Input: raw paste or a ChatGPT conversations.json payload.
// Output: { turns: [{role, text, index}], method, confidence, warnings }
//
// This is the highest-risk part of the product: if we mis-attribute the AI's
// words to the user, every score is wrong. So every strategy is explicit and
// the UI shows the user exactly which turns we kept.

const ROLE_MARKERS = [
  { re: /^\s*(?:#{1,6}\s*)?(?:you said|you|user|human|me)\s*:\s*$/im, role: "user" },
  { re: /^\s*(?:#{1,6}\s*)?(?:chatgpt|claude|gemini|copilot|grok|deepseek|assistant|ai|bot|model)\s*(?:said|responded|replied)?\s*:\s*$/im, role: "assistant" },
];

// "You: hi" / "Human: hi" on one line.
const INLINE_ROLE = /^\s*(?:>{0,2}\s*)?(?:\*\*)?(you|user|human|me|chatgpt|claude|gemini|assistant|ai|bot|model|copilot|grok|deepseek)(?:\*\*)?\s*:\s+(.*)$/i;

const USER_WORDS = new Set(["you", "user", "human", "me"]);
const ASSISTANT_WORDS = new Set([
  "chatgpt", "claude", "gemini", "assistant", "ai", "bot", "model", "copilot", "grok", "deepseek",
]);

// Sentences that only an assistant says. Used to break ties during block
// classification when role labels are absent.
const ASSISTANT_TELLS = [
  /\bi(?:'m| am) sorry,? but\b/i,
  /\b(?:certainly|sure|absolutely)[!,]/i,
  /\bhere(?:'s| is) (?:a|an|the)\b/i,
  /\bI (?:can(?:no|'?)t|cannot|don't) (?:help|assist|provide)\b/i,
  /\bas an AI\b/i,
  /\blet me know if\b/i,
  /\bI hope (?:this|that) helps\b/i,
  /\bwould you like me to\b/i,
  /\bfeel free to\b/i,
  /^\s*(?:#{1,6}\s|\d+\.\s|[-*]\s)/m,
  /```/,
];

export function detectFormat(raw) {
  const text = raw.trim();
  if (!text) return "empty";
  if (/^[[{]/.test(text) && /"(?:mapping|messages|conversation)"|"author"|"role"/.test(text.slice(0, 4000))) {
    return "json";
  }
  const markerHits = ROLE_MARKERS.reduce((n, m) => n + (text.match(new RegExp(m.re, "gim")) || []).length, 0);
  if (markerHits >= 2) return "labelled";
  const inlineHits = (text.match(new RegExp(INLINE_ROLE, "gim")) || []).length;
  if (inlineHits >= 2) return "inline";
  return "raw";
}

function splitLabelled(text) {
  // Normalise the various "X said:" dialogs onto a single delimiter, then split.
  const lines = text.split(/\r?\n/);
  const turns = [];
  let current = null;
  for (const line of lines) {
    const isMarker = ROLE_MARKERS.some((m) => new RegExp(m.re.source, "i").test(line));
    if (isMarker) {
      const role = ROLE_MARKERS.find((m) => new RegExp(m.re.source, "i").test(line)).role;
      if (current && current.text.trim()) turns.push(current);
      current = { role, text: "" };
      continue;
    }
    if (current) current.text += (current.text ? "\n" : "") + line;
  }
  if (current && current.text.trim()) turns.push(current);
  return turns;
}

function splitInline(text) {
  const turns = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(INLINE_ROLE);
    if (m) {
      const word = m[1].toLowerCase();
      const role = USER_WORDS.has(word) ? "user" : ASSISTANT_WORDS.has(word) ? "assistant" : null;
      if (role) {
        if (current && current.text.trim()) turns.push(current);
        current = { role, text: m[2] };
        continue;
      }
    }
    if (current) current.text += (current.text ? "\n" : "") + line;
  }
  if (current && current.text.trim()) turns.push(current);
  return turns;
}

// A line that only a human types when they want something.
const USER_SIGNALS =
  /(?:^|\n)\s*(?:can|could|would|will|please|pls|plz|how|what|why|when|where|which|who|make|write|give|show|tell|explain|fix|help|do|don'?t|add|remove|change|update|create|build|refactor|rewrite|now|also|and|then|but|ok|okay|no|yes|yeah|hey|hi|hello|i|i')\b/i;
const STRUCTURE_RE = /```|^\s*#{1,6}\s|^\s*[-*]\s|^\s*\d+\.\s|^\s*\|/m;

function classifyBlock(block) {
  let a = 0;
  for (const re of ASSISTANT_TELLS) if (re.test(block)) a += 1;
  if (STRUCTURE_RE.test(block)) a += 1;
  if (/:\s*$/.test(block)) a += 0.5;
  let u = 0;
  if (/\?/.test(block)) u += 1;
  if (USER_SIGNALS.test(block)) u += 1;
  if (/\b(?:i|i'm|my|me)\b/i.test(block)) u += 0.5;
  return { a, u };
}

function splitBlocks(text) {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const roles = blocks.map((block) => {
    const { a, u } = classifyBlock(block);
    return a > u && a >= 1 ? "assistant" : "user";
  });
  // Assistant replies routinely contain blank lines (prose, then a code block).
  // Fold a following unsignalled block back into the answer it belongs to.
  for (let i = 1; i < blocks.length; i += 1) {
    if (roles[i - 1] !== "assistant" || roles[i] !== "user") continue;
    const { a, u } = classifyBlock(blocks[i]);
    if (a >= 1 || u === 0) roles[i] = "assistant";
  }
  return blocks.map((blockText, i) => ({ role: roles[i], text: blockText }));
}

export function parseChatGptJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const conversations = Array.isArray(data) ? data : [data];
  const turns = [];
  for (const conv of conversations) {
    if (Array.isArray(conv?.messages)) {
      for (const msg of conv.messages) {
        const role = msg?.author?.role || msg?.role;
        const text = normaliseJsonContent(msg?.content);
        if (!text) continue;
        if (role === "user" || role === "assistant") turns.push({ role, text });
      }
      continue;
    }
    if (conv?.mapping && typeof conv.mapping === "object") {
      const nodes = Object.values(conv.mapping);
      const ordered = nodes
        .map((n) => ({
          role: n?.message?.author?.role,
          text: normaliseJsonContent(n?.message?.content),
          t: n?.message?.create_time ?? 0,
          id: n?.id,
        }))
        .filter((n) => n.text && (n.role === "user" || n.role === "assistant"));
      ordered.sort((a, b) => (a.t || 0) - (b.t || 0));
      for (const n of ordered) turns.push({ role: n.role, text: n.text });
    }
  }
  return turns.length ? turns : null;
}

function normaliseJsonContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(content.parts)) return content.parts.filter((p) => typeof p === "string").join("\n");
  if (typeof content.text === "string") return content.text;
  return "";
}

export function parse(raw, opts = {}) {
  const text = (raw || "").replace(/\u00a0/g, " ");
  const warnings = [];
  if (!text.trim()) return { turns: [], method: "empty", warnings: ["No text to read."], confidence: 0 };

  let turns = [];
  let method = detectFormat(text);
  let confidence = 0.9;

  if (method === "json") {
    const parsed = parseChatGptJson(text);
    if (parsed) {
      turns = parsed;
      method = "conversations.json";
      confidence = 1;
    } else {
      warnings.push("Looked like JSON but no user/assistant turns were found in it.");
      method = "raw";
    }
  }

  if (!turns.length && method === "labelled") {
    turns = splitLabelled(text);
  }
  if (!turns.length && method === "inline") {
    turns = splitInline(text);
  }
  if (!turns.length) {
    method = "raw";
    turns = splitBlocks(text);
    confidence = 0.45;
    warnings.push("No speaker labels found. Blocks were treated as alternating turns, starting with you.");
  }

  if (opts.assumeAllMine) {
    turns = turns.map((t) => ({ ...t, role: "user" }));
    method = "assume-all-mine";
    confidence = 1;
  }

  turns = turns
    .map((t, i) => ({ role: t.role, text: t.text.trim(), index: i }))
    .filter((t) => t.text && !isNoise(t.text));

  const mine = turns.filter((t) => t.role === "user");
  if (!mine.length) warnings.push("No messages from you were found — check the detection below.");

  return { turns, userTurns: mine, method, confidence, warnings };
}

function isNoise(text) {
  const stripped = text.replace(/[\s\d.,;:!?()\-–—_*#>`]/g, "");
  return stripped.length < 2;
}

export function toPrompts(parsed) {
  return (parsed.userTurns || []).map((t) => t.text);
}
