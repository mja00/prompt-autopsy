// The autopsy engine. Pure functions over an array of the user's own prompts.
// Every number below is measured from the pasted text; nothing is randomised
// and nothing is sent anywhere.

import { ratePer100, median, similarityOfSets, wordSet, tokens, charCount, emojiCount, upperWordCount, scale, clamp } from "./text.js";
import { rankArchetypes } from "./archetypes.js";

const P = {
  apology: [
    /\bsorry\b/i, /\bapolog(?:y|ies|ise|ize|etic|ising|izing)\b/i, /\bmy bad\b/i,
    /\bforgive me\b/i, /\bsry\b/i, /\bexcuse me\b/i, /\bmy fault\b/i,
  ],
  politeness: [
    /\bplease\b/i, /\bpls\b/i, /\bplz\b/i, /\bthank(?:s| you)\b/i, /\bthx\b/i,
    /\bwould you mind\b/i, /\bcould you\b/i, /\bwould you\b/i, /\bkindly\b/i,
    /\bappreciate it\b/i, /\bmuch appreciated\b/i, /\bif you don'?t mind\b/i, /\bcheers\b/i,
  ],
  hostility: [
    /\b(?:you'?re|you are|thats|that'?s|this is|its|it'?s)\s+(?:still\s+)?(?:wrong|broken|incorrect|useless|garbage|trash)\b/i,
    /\bnot what i (?:asked|said|meant|wanted)\b/i,
    /\bstill (?:wrong|broken|not working|doesn'?t work|fails?)\b/i,
    /\b(?:didn'?t|doesn'?t|won'?t|does not|did not) work\b/i,
    /\bdidn'?t help\b/i, /\bnope\b/i, /\buseless\b/i, /\bgarbage\b/i, /\bworthless\b/i,
    /\bhallucinat/i, /\bmade (?:that|this|it) up\b/i, /\b(?:lies|lying)\b/i,
    /\bwhy (?:did|would) you\b/i, /\bthat'?s not (?:what|right|correct)\b/i, /\bwdym\b/i,
    /\bare you (?:serious|kidding)\b/i, /\bno,? (?:that|this|it)\b/i, /\bwrong\b/i,
  ],
  controlStrong: [
    /\bnever\b/i, /\balways\b/i, /\bonly\b/i, /\bexactly\b/i, /\bmust\b/i,
    /\bmake sure\b/i, /\bensure\b/i, /\bdon'?t\b/i, /\bdo not\b/i, /\bforbidden\b/i,
    /\brequirement/i, /\bno more than\b/i, /\bat most\b/i, /\bavoid\b/i, /\bwithout\b/i,
    /\binstead of\b/i, /\bstop\b/i, /\bi want (?:it|you) to\b/i, /\bi need (?:it|you) to\b/i,
  ],
  controlWeak: [/\bjust\b/i, /\bkeep it\b/i, /\bmake it\b/i, /\bdon'?t forget\b/i],
  // Compliments only. "thank you so much" is deliberately absent: it is a
  // courtesy, and it was double-counting here and in `politeness`.
  flattery: [
    /\bperfect\b/i, /\bamazing\b/i, /\bgreat job\b/i, /\bawesome\b/i, /\blegend\b/i, /\bgoat\b/i,
    /\byou'?re the best\b/i, /\bbrilliant\b/i, /\bi love (?:it|this|you)\b/i,
    /\bbeautiful\b/i, /\bexcellent\b/i, /\bgenius\b/i, /\bnice work\b/i, /\bwell done\b/i,
    /\byou'?re a (?:lifesaver|genius|legend|star)\b/i, /\bthis is great\b/i, /\bthat'?s perfect\b/i,
    /\bthank you so much\b.*\b(?:perfect|amazing|best|legend)\b/i,
  ],
  urgency: [
    /\basap\b/i, /\burgent/i, /\bright now\b/i, /\bimmediately\b/i, /\bhurry\b/i, /\bquickly\b/i,
    /\bdeadline\b/i, /\bby (?:today|tonight|eod|tomorrow|monday|friday)\b/i, /\btime sensitive\b/i,
    /\bin a hurry\b/i, /\bneed (?:this|it) (?:now|fast|asap)\b/i, /\brunning out of time\b/i,
    /\bquick question\b/i, /\blast minute\b/i,
  ],
  churn: [
    /\btry again\b/i, /\bagain\b/i, /\bone more time\b/i, /\bsame (?:error|issue|problem|thing)\b/i,
    /\bstill\b/i, /\bredo\b/i, /\brewrite\b/i, /\bno wait\b/i, /\bi said\b/i, /\bi meant\b/i,
    /\bonce more\b/i, /\bnow it\b/i, /\bkeep going\b/i, /\bcontinue\b/i, /\bnot quite\b/i,
  ],
};

const NIGHT_RE = /\b(?:1|2|3|4|5)\s?(?:am|a\.m\.)\b|\bmidnight\b|\b(?:three|two|four) in the morning\b/gi;
const EXCLAIM_RE = /!{2,}/g;
const LOOSE_RE = /\b(?:wtf|ffs|omg|lol|lmao|haha|smh|bruh|bro|dude|nah|ugh|argh?)\b/gi;

function hits(prompts, patterns) {
  let n = 0;
  const matched = [];
  for (const p of prompts) {
    let hit = false;
    for (const re of patterns) {
      if (new RegExp(re.source, re.flags).test(p)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      n += 1;
      matched.push(p);
    }
  }
  return { count: n, matched };
}

function totalMatches(prompts, patterns) {
  let n = 0;
  for (const p of prompts) {
    for (const re of patterns) {
      const m = p.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
      if (m) n += m.length;
    }
  }
  return n;
}

// "I don't trust my own judgement", "I don't like Tailwind" and "I've avoided
// X" are self-description, not instructions. Counting them made any reflective
// writer look like a micro-manager, so pronoun-led negations are subtracted
// from the imperative ones.
const SELF_NEGATION = /\b(?:i|we|they|you|it|he|she)\s+(?:don'?t|do not)\b/gi;

function countConstraints(prompts) {
  const raw = totalMatches(prompts, P.controlStrong);
  const selfTalk = prompts.reduce((n, p) => n + ((p.match(SELF_NEGATION) || []).length), 0);
  return Math.max(0, raw - selfTalk);
}

// Shouted words, excluding the acronyms that every engineer types in caps
// without raising their voice. Without this, "respond with JSON only" scored
// as maximum chaos, which sent directive-style users to the wrong verdict.
const SHOUT_EXEMPT = new Set([
  "JSON", "JSONL", "API", "APIS", "CSS", "HTML", "SQL", "HTTP", "HTTPS", "URL", "URLS",
  "UUID", "XML", "CSV", "PNG", "SVG", "JPG", "JPEG", "GIF", "PDF", "ZIP", "TAR",
  "CPU", "GPU", "RAM", "SSD", "AWS", "GCP", "IDE", "CLI", "GUI", "DNS", "TLS", "SSL",
  "SSH", "JWT", "ORM", "CDN", "CORS", "REST", "GRPC", "ENV", "NPM", "CI", "CD", "UI",
  "UX", "DB", "OS", "TTY", "DOM", "AST", "LLM", "GPT", "RAG", "YAML", "TOML", "MD",
  "TSX", "JSX", "NODE", "DOCKER", "WASM", "CRUD", "EOD", "ASAP", "FAQ", "SEO", "SDK",
  "TTL", "ACL", "RBAC", "IAM", "S3", "EC2", "VPC", "EDI", "ETL", "CRM", "CMS", "MVP",
]);

function shoutedWords(text) {
  const caps = text.match(/\b[A-Z]{3,}\b/g) || [];
  return caps.filter((w) => !SHOUT_EXEMPT.has(w)).length;
}

// The value at which each axis reads a full 100. Published on the page, so a
// reader can check the bars rather than take them on faith. It lives here (and
// is imported by the UI) because it drifted once already during calibration —
// hardcoding it in the HTML as well guarantees the two disagree eventually.
//
// `percent: true` matters: those axes are measured as a share of the user's
// messages, so "80" means 80%, not "80 messages". Rendering it as a bare count
// makes the published rubric false for exactly the large samples the page asks
// people to paste.
export const SATURATION = {
  apology: { fullAt: 80, percent: true, unit: "of your messages contain an apology" },
  politeness: { fullAt: 90, percent: true, unit: "of your messages contain a please or thank-you" },
  hostility: { fullAt: 50, percent: true, unit: "of your messages accuse it of being wrong" },
  churn: { fullAt: 60, percent: true, unit: "of your messages retry or near-repeat the previous one" },
  verbosity: { fullAt: 170, percent: false, unit: "words in your median message" },
  flattery: { fullAt: 40, percent: true, unit: "of your messages compliment it" },
  // Both composite axes are weighted and the unit text says so: a reader
  // counting plain markers would otherwise land on ~83 and think the bar lied.
  // Chaos = (caps 1.5x + bang pileups 0.5x + emoji 1.2x + slang 1x) / 1.2.
  // Control = hard constraints 1x + soft nudges ("just", "make it") 0.34x.
  control: { fullAt: 1.6, percent: false, unit: "weighted constraints per message (hard 1×, soft nudges 0.34×)" },
  chaos: { fullAt: 1.0, percent: false, unit: "weighted chaos markers per message (caps 1.5×, emoji 1.2×, slang 1×, bang pileups 0.5×)" },
  urgency: { fullAt: 35, percent: true, unit: "of your messages carry an asap/hurry/deadline word" },
};

// Shared thresholds, exported so the copy on the page and the behaviour in the
// code cannot drift apart (the saturation table already drifted once).
export const REASK_THRESHOLD = 0.55;
export const REPEAT_LOOKAHEAD = 40;

// Below this many messages a verdict is stamped "tentative", and the method
// section quotes the same number.
export const MIN_CONFIDENT = 20;

// Above this, analysis stops being instant on a phone. A single ChatGPT export
// can carry thousands of turns, so the cap is enforced rather than assumed, and
// the UI reports when it truncates.
export const MAX_ANALYZED = 1500;

function fmtPct(n) {
  return `${Math.round(n)}%`;
}

// These stats get posted verbatim to Twitter, so "1 compliments" is not
// acceptable anywhere a count reaches the user.
function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

function pctOf(part, whole) {
  return whole ? (part / whole) * 100 : 0;
}

// The "asked N times" highlight. A retry spiral is local by definition, so the
// scan is bounded rather than all-pairs: comparing every message against every
// other one is O(n^2) set intersections, and on a real 5k-message ChatGPT
// export that is ~12.5M comparisons — a frozen tab on the feature the page
// advertises as instant.
function findTopRepeat(entries) {
  let best = null;
  for (let i = 0; i < entries.length; i += 1) {
    let run = 1;
    const end = Math.min(entries.length, i + 1 + REPEAT_LOOKAHEAD);
    for (let j = i + 1; j < end; j += 1) {
      if (similarityOfSets(entries[i].set, entries[j].set) >= REASK_THRESHOLD) run += 1;
    }
    if (!best || run > best.run) best = { run, text: entries[i].text };
  }
  return best && best.run >= 3 ? best : null;
}

function wildestLine(prompts) {
  let best = null;
  for (const p of prompts) {
    let s = 0;
    s += shoutedWords(p) * 3;
    s += ((p.match(/!/g) || []).length) * 2;
    s += ((p.match(/\?/g) || []).length) * 1.5;
    s += emojiCount(p) * 2;
    s += ((p.match(LOOSE_RE) || []).length) * 3;
    if (p.length < 8 || p.length > 400) s -= 4;
    if (!best || s > best.score) best = { text: p, score: s };
  }
  return best && best.score >= 6 ? best : null;
}

function preview(text, max = 58) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function analyze(prompts) {
  const all = (prompts || []).map((p) => String(p).trim()).filter((p) => p.length > 0);
  // A ChatGPT export can carry thousands of turns. Analysis is meant to feel
  // instant, so the tail is dropped and reported rather than silently making
  // the page hang.
  const truncated = all.length > MAX_ANALYZED;
  const list = truncated ? all.slice(0, MAX_ANALYZED) : all;
  const m = list.length;
  const joined = list.join("\n");
  const totalChars = list.reduce((n, p) => n + charCount(p), 0);
  const wordCounts = list.map((p) => (p.match(/[\p{L}\p{N}']+/gu) || []).length);
  const medWords = median(wordCounts);
  const longest = Math.max(0, ...wordCounts);

  // Tokenise once. Building a Set dominates the cost of a comparison, and the
  // previous implementation rebuilt both sides on every pair.
  const entries = list.map((text) => ({ text, set: wordSet(text) }));

  const apology = hits(list, P.apology);
  const politeness = hits(list, P.politeness);
  const hostility = hits(list, P.hostility);
  const flattery = hits(list, P.flattery);
  const urgency = hits(list, P.urgency);
  const churnPhrase = hits(list, P.churn);

  let simReasks = 0;
  for (let i = 1; i < entries.length; i += 1) {
    if (similarityOfSets(entries[i - 1].set, entries[i].set) >= REASK_THRESHOLD) simReasks += 1;
  }
  const reasks = churnPhrase.count + simReasks;

  // Strong constraints weigh a full point; incidental prose words ("just",
  // "make it") weigh a third. Without this split, any long-form writing reads
  // as micro-management because English prose is full of weak imperatives.
  const controlTotal = countConstraints(list);
  const controlWeak = totalMatches(list, P.controlWeak);
  const controlScore = controlTotal + controlWeak * 0.34;
  const capsWords = list.reduce((n, p) => n + shoutedWords(p), 0);
  const emojis = list.reduce((n, p) => n + emojiCount(p), 0);
  const bangs = list.reduce((n, p) => n + ((p.match(EXCLAIM_RE) || []).length), 0);
  const loose = list.reduce((n, p) => n + ((p.match(LOOSE_RE) || []).length), 0);
  const nightHits = (joined.match(NIGHT_RE) || []).length;

  const perMsg = (n) => pctOf(n, m);

  const chaosScore = (perMsg(capsWords) * 1.5 + perMsg(bangs) * 0.5 + perMsg(emojis) * 1.2 + perMsg(loose) * 1.0) / 1.2;

  const axes = {
    apology: scale(perMsg(apology.count), SATURATION.apology.fullAt),
    politeness: scale(perMsg(politeness.count), SATURATION.politeness.fullAt),
    hostility: scale(perMsg(hostility.count), SATURATION.hostility.fullAt),
    churn: scale(perMsg(reasks), SATURATION.churn.fullAt),
    control: scale(controlScore / Math.max(m, 1), SATURATION.control.fullAt),
    verbosity: scale(medWords, SATURATION.verbosity.fullAt),
    flattery: scale(perMsg(flattery.count), SATURATION.flattery.fullAt),
    chaos: scale(chaosScore, SATURATION.chaos.fullAt),
    urgency: scale(perMsg(urgency.count), SATURATION.urgency.fullAt),
  };

  const metrics = [
    {
      id: "apology",
      label: "Apology Index",
      value: axes.apology,
      stat: `${apology.count} of ${plural(m, "message")}`,
      evidence:
        apology.count === 0
          ? "You have never apologised to a language model. Correct, arguably."
          : `You apologised in ${fmtPct(perMsg(apology.count))} of your messages. It cannot be offended and it cannot forgive you.`,
      joke:
        apology.count >= 5
          ? `That is ${apology.count} apologies to something with no memory of any of them.`
          : "A modest, survivable amount of guilt.",
    },
    {
      id: "politeness",
      label: "Grovel",
      value: axes.politeness,
      stat: `${politeness.count} please/thanks`,
      evidence:
        politeness.count === 0
          ? "Not a single please or thank-you. It is a machine, so this is fine, but it is noted."
          : `Pleases and thank-yous in ${fmtPct(perMsg(politeness.count))} of your messages.`,
      joke:
        axes.politeness > 60
          ? "You are paying respects to a next-token predictor. It is not grading you."
          : "Basic courtesy, no bowing.",
    },
    {
      id: "hostility",
      label: "Machine Abuse",
      value: axes.hostility,
      stat: plural(hostility.count, "accusation"),
      evidence:
        hostility.count === 0
          ? "You never once accused it of being wrong. Either it behaved, or you did not check."
          : `You called it wrong, broken, useless or a liar in ${hostility.count} messages.`,
      joke:
        axes.hostility > 55
          ? "It is not lying to you. It simply does not know things and will not say so."
          : "Restrained. Suspiciously restrained.",
    },
    {
      id: "churn",
      label: "Retry Spiral",
      value: axes.churn,
      stat: plural(reasks, "re-ask"),
      evidence:
        reasks === 0
          ? "You asked once and accepted the answer. Rare and slightly unnerving."
          : `${churnPhrase.count} explicit retries plus ${simReasks} messages that were near-copies of the one before.`,
      joke:
        axes.churn > 60
          ? "Repeating the same sentence louder is not a prompt strategy. It is a coping mechanism."
          : "You iterate, but you iterate like an adult.",
    },
    {
      id: "control",
      label: "Micro-Management",
      value: axes.control,
      stat: plural(controlTotal, "constraint"),
      evidence: `${controlTotal} don'ts, onlys, exactlys and musts across ${m} messages — ${(controlTotal / Math.max(m, 1)).toFixed(1)} per message${controlWeak ? `, plus ${controlWeak} softer \u201cjust/make it\u201d style nudges` : ""}.`,
      joke:
        axes.control > 60
          ? "More instructions about what not to do than requests for anything. Contractual."
          : "You ask for things. You do not draft terms.",
    },
    {
      id: "verbosity",
      label: "Backstory Dumping",
      value: axes.verbosity,
      stat: `${Math.round(medWords)} words median`,
      evidence: `Median prompt ${Math.round(medWords)} words; longest ${longest} words. Roughly ${tokens(joined).toLocaleString()} tokens handed over.`,
      joke:
        medWords > 180
          ? "Your median prompt is longer than most stand-up sets. The question is on line 34."
          : medWords < 25
            ? "Terse. You communicate in telegrams and implications."
            : "Enough context to be useful, not enough to be a memoir.",
    },
    {
      id: "flattery",
      label: "Bot Flattery",
      value: axes.flattery,
      stat: plural(flattery.count, "compliment"),
      evidence:
        flattery.count === 0
          ? "You have never once told it that it did a good job. It has also never done a good job, so."
          : `You praised it in ${flattery.count} messages — perfect, amazing, legend, and so on.`,
      joke:
        flattery.count >= 4
          ? "You are training a sycophant and then complaining that it is a sycophant."
          : "You keep your compliments rare. It will never know.",
    },
    {
      id: "chaos",
      label: "Chaos",
      value: axes.chaos,
      stat: `${capsWords} caps · ${emojis} emoji · ${bangs} bangs`,
      evidence: `${capsWords} shouted words, ${emojis} emoji, ${bangs} multi-exclamation pileups${loose ? `, ${loose} instances of \u201cwtf/ugh/bruh\u201d` : ""}.`,
      joke:
        axes.chaos > 55
          ? "Caps lock is a volume knob and you have it at eleven."
          : "Composed keystrokes. Nothing here needed a wellness check.",
    },
    {
      id: "urgency",
      label: "Deadline Panic",
      value: axes.urgency,
      stat: plural(urgency.count, "urgency marker"),
      evidence: `${urgency.count} asaps, right-nows and hurry-ups${nightHits ? `, plus ${nightHits} reference${nightHits === 1 ? "" : "s"} to what time it is` : ""}.`,
      joke:
        axes.urgency > 55
          ? "You have told a chatbot what time it is, as if it is a manager who needs to know how badly you are doing."
          : "Calm. Everything is fine. Nothing is due.",
    },
  ].map((metric) => ({ ...metric, value: Math.round(metric.value) }));

  const ranked = rankArchetypes(axes, m);
  const top = ranked[0];
  const runnerUp = ranked[1];

  const secondary = metrics
    .filter((mt) => !(mt.id in top.archetype.weights) || top.archetype.weights[mt.id] <= 0)
    .sort((a, b) => b.value - a.value)[0];

  const relationship = relationshipLine(metrics, axes, m);
  const wild = wildestLine(list);
  const topRepeat = findTopRepeat(entries);

  return {
    ok: m > 0,
    messageCount: m,
    truncated,
    droppedCount: truncated ? all.length - m : 0,
    chars: totalChars,
    tokens: tokens(joined),
    medianWords: Math.round(medWords),
    longestWords: longest,
    axes,
    metrics,
    ranked,
    verdict: {
      archetype: top.archetype,
      score: Math.round(top.score),
      runnerUp: runnerUp.archetype,
      margin: Math.round(top.score - runnerUp.score),
      secondaryTrait: secondary ? secondary.label : null,
      smallSample: m < MIN_CONFIDENT,
    },
    relationship,
    wildest: wild,
    topRepeat,
    // The slice actually analysed. Callers that need to quote individual
    // messages (the exhibits) MUST use this rather than the original array, or
    // they will quote a message the UI just said was skipped.
    analyzedMessages: list,
    sampleNote:
      m < MIN_CONFIDENT
        ? `Only ${plural(m, "message")} analysed. The verdict is provisional until you paste about ${MIN_CONFIDENT}.`
        : null,
  };
}

function relationshipLine(metrics, axes, m) {
  const by = Object.fromEntries(metrics.map((x) => [x.id, x.value]));
  const both = by.apology + by.politeness;
  if (m === 0) return "No messages. You have not spoken to it. Wise.";
  if (by.flattery >= 55 && both >= 90) return "It's not a relationship. It's a hostage situation where you are the hostage and also the guard.";
  if (by.flattery >= 55) return "It's complicated — mainly because you keep telling it how well it's doing.";
  if (by.hostility >= 60 && both <= 25) return "Open warfare. You have stopped being polite and started filing complaints.";
  if (by.hostility >= 60) return "Passive-aggressive with a thin veneer of please and thank you.";
  if (by.churn >= 65) return "Codependent. You will leave the moment it works, and it never works.";
  if (by.control >= 65) return "Married. You handle the instructions, it handles the disappointment.";
  if (by.verbosity >= 65) return "You are treating it as a therapist and it is billing you in hallucinations.";
  if (by.apology >= 60) return "You are the one being trained here.";
  if (both <= 15 && by.hostility <= 20) return "Two professionals, no feelings, zero small talk. Refreshing.";
  return "Functional. Uneventful. The kind of relationship that gets described as 'fine'.";
}

export { P as PHRASES };
