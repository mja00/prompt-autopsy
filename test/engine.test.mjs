import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, toPrompts, detectFormat } from "../js/parse.js";
import { analyze, SATURATION, MIN_CONFIDENT, MAX_ANALYZED } from "../js/analyze.js";
import { AXES } from "../js/archetypes.js";
import { headerCount } from "../js/card.js";
import { scale } from "../js/text.js";
import { SAMPLES } from "../js/samples.js";

const CHATGPT_PASTE = `You said:
Can you help me fix this CSS bug? Sorry if this is obvious.

ChatGPT said:
Certainly! Here's a corrected version:

\`\`\`css
.foo { color: red; }
\`\`\`

Let me know if that helps.

You said:
That's still wrong. The layout is broken.

ChatGPT said:
I apologise for the confusion. Let me try again.`;

const INLINE_PASTE = `User: how do I center a div
Assistant: You can use flexbox. Here's how:
User: that didn't work
Assistant: I'm sorry to hear that. Let me explain another approach.`;

const RAW_PASTE = `Write a haiku about kubernetes.

Here is a haiku about Kubernetes:

Pods drift like petals
A scheduler holds the wind
One node falls silent

now make it about docker instead`;

const CONVERSATIONS_JSON = JSON.stringify([
  {
    title: "Test",
    mapping: {
      a: { id: "a", message: { author: { role: "user" }, content: { content_type: "text", parts: ["hello there"] }, create_time: 1 } },
      b: { id: "b", message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Hi! How can I help?"] }, create_time: 2 } },
      c: { id: "c", message: { author: { role: "user" }, content: { content_type: "text", parts: ["sorry, one more thing"] }, create_time: 3 } },
      d: { id: "d", message: { author: { role: "system" }, content: { content_type: "text", parts: ["ignore me"] }, create_time: 0 } },
    },
  },
]);

test("detects labelled pastes and keeps only the user's words", () => {
  assert.equal(detectFormat(CHATGPT_PASTE), "labelled");
  const p = parse(CHATGPT_PASTE);
  const prompts = toPrompts(p);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Can you help me fix this CSS bug/);
  assert.match(prompts[1], /still wrong/);
  // The assistant's words must never leak into the user's prompts.
  assert.ok(!prompts.some((x) => /Certainly|flexbox|let me know/i.test(x)));
});

test("detects inline User:/Assistant: pastes", () => {
  const p = parse(INLINE_PASTE);
  const prompts = toPrompts(p);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0], "how do I center a div");
  assert.ok(!prompts.some((x) => /flexbox/i.test(x)));
});

test("raw paste alternates turns and warns about the guess", () => {
  const p = parse(RAW_PASTE);
  const prompts = toPrompts(p);
  assert.equal(p.confidence < 1, true);
  assert.ok(p.warnings.some((w) => /no speaker labels/i.test(w)));
  assert.ok(prompts.some((x) => /kubernetes/i.test(x)));
  assert.ok(!prompts.some((x) => /Pods drift like petals/i.test(x)));
});

test("assumeAllMine keeps every block and tags it as the user's", () => {
  const p = parse(RAW_PASTE, { assumeAllMine: true });
  const prompts = toPrompts(p);
  assert.equal(prompts.length, 4);
  assert.ok(prompts.some((x) => /Pods drift like petals/i.test(x)));
  assert.ok(p.turns.every((t) => t.role === "user"));
});

test("reads a ChatGPT conversations.json export and drops system turns", () => {
  const p = parse(CONVERSATIONS_JSON);
  const prompts = toPrompts(p);
  assert.equal(p.method, "conversations.json");
  assert.deepEqual(prompts, ["hello there", "sorry, one more thing"]);
});

test("empty input is handled without throwing", () => {
  const p = parse("   ");
  assert.equal(p.turns.length, 0);
  const a = analyze([]);
  assert.equal(a.ok, false);
  assert.equal(a.messageCount, 0);
});

test("counts apologies and grovel from the user's own messages", () => {
  const a = analyze([
    "sorry to bother you, could you please rewrite this function?",
    "my apologies, please try again",
    "thanks so much, sorry for the back and forth",
  ]);
  const apology = a.metrics.find((x) => x.id === "apology");
  const politeness = a.metrics.find((x) => x.id === "politeness");
  assert.equal(apology.stat, "3 of 3 messages");
  assert.equal(politeness.stat, "3 please/thanks");
  assert.equal(apology.value, 100);
});

test("near-duplicate consecutive prompts register as a retry spiral", () => {
  const same = "fix the failing test in auth.spec.ts please";
  const a = analyze([same, same, same, same, "fix the failing test in auth.spec.ts"]);
  const churn = a.metrics.find((x) => x.id === "churn");
  assert.ok(churn.stat.includes("re-asks"));
  assert.ok(churn.value > 0, "expected a non-zero retry spiral");
  assert.ok(a.topRepeat, "expected the repeated request to be surfaced");
});

test("verdict is deterministic and matches the dominant signal", () => {
  const grovel = [
    "sorry, please could you help me, i really appreciate it",
    "sorry to ask again, please, thank you so much",
    "apologies, please just one more thing, thanks",
    "sorry sorry, please help, you're the best",
  ];
  const first = analyze(grovel).verdict.archetype.id;
  const second = analyze(grovel).verdict.archetype.id;
  assert.equal(first, second);
  assert.ok(
    ["doormat", "the-thrall", "apologetic-overexplainer", "polite-dictator"].includes(first),
    `expected a grovelling verdict, got ${first}`,
  );
});

test("hostile caps-lock debugger reads as machine abuse, not politeness", () => {
  const feral = [
    "STILL BROKEN. WHY DID YOU DO THAT",
    "no, that's wrong. you're wrong. i said NO",
    "that didn't work. did you even read it??? nope",
    "useless. that's not what i asked. WHY",
  ];
  const v = analyze(feral).verdict.archetype.id;
  assert.ok(["feral-debugger", "machine-gaslighter", "chaos-gremlin"].includes(v), `got ${v}`);
});

test("a single-word-per-message user reads as a one-liner, not a rambler", () => {
  const terse = ["fix it", "no", "again", "why", "try again", "nope", "same error"];
  const a = analyze(terse);
  assert.ok(a.metrics.find((x) => x.id === "verbosity").value < 20);
  assert.ok(["one-liner", "retry-spiral", "the-normal-one"].includes(a.verdict.archetype.id), a.verdict.archetype.id);
});

// The core product promise: distinguishable people must get distinguishable
// verdicts. This is the test that would have caught the dot-product scoring bug.
const PROFILES = {
  grovelling: {
    prompts: [
      "sorry, please could you help me, i really appreciate it",
      "sorry to ask again, please, thank you so much",
      "apologies, please just one more thing, thanks",
      "sorry sorry, please help, you are the best",
    ],
    expect: ["doormat", "apologetic-overexplainer", "the-thrall", "polite-dictator"],
  },
  furious: {
    prompts: [
      "STILL BROKEN. WHY DID YOU DO THAT",
      "no, that's wrong. you're wrong. i said NO",
      "that didn't work. did you even read it??? nope",
      "useless. that's not what i asked. WHY",
    ],
    expect: ["feral-debugger", "machine-gaslighter", "chaos-gremlin"],
  },
  flatAndTerse: {
    prompts: ["fix it", "no", "again", "why", "try again", "nope", "same error"],
    expect: ["one-liner", "retry-spiral", "machine-gaslighter"],
  },
  directive: {
    prompts: [
      "Do not use emoji. Only respond with JSON. Never apologize. Make sure every field is present.",
      "Do not add commentary. Only the code block. Ensure it compiles. Do not explain.",
      "Never use the word obviously. Always include types. At most 20 lines. Do not exceed that.",
      "Do not refactor. Only change the function I named. Make sure tests pass. Never add deps.",
    ],
    expect: ["micro-manager", "contract-lawyer"],
  },
  praising: {
    prompts: [
      "you are amazing, that is perfect, great job, thank you so much",
      "this is brilliant, you are a legend, perfect work",
      "excellent, well done, i love it, nice work",
      "awesome, genius, you are the best",
    ],
    expect: ["bot-flatterer", "the-thrall"],
  },
  unremarkable: {
    prompts: [
      "Can you explain how promises work?",
      "Thanks, that makes sense.",
      "What about async await?",
      "Great, and how do I handle errors?",
      "Makes sense, thanks.",
      "One more: what about timeouts?",
      "Okay thanks, that helps.",
      "Got it, appreciate it.",
    ],
    expect: ["the-normal-one", "doormat", "bot-flatterer", "apologetic-overexplainer"],
  },
};

test("distinguishable writers get distinguishable verdicts", () => {
  for (const [name, { prompts, expect }] of Object.entries(PROFILES)) {
    const got = analyze(prompts).verdict.archetype.id;
    assert.ok(expect.includes(got), `${name} → got ${got}, expected one of ${expect.join("/")}`);
  }
});

test("the verdict for a profile is stable across repeated runs", () => {
  for (const { prompts } of Object.values(PROFILES)) {
    assert.equal(analyze(prompts).verdict.archetype.id, analyze(prompts).verdict.archetype.id);
  }
});

test("shouted acronyms do not read as chaos", () => {
  const a = analyze(["Only respond with JSON. Do not use HTML or CSS. Return YAML only."]);
  const chaos = a.metrics.find((m) => m.id === "chaos");
  assert.equal(chaos.stat.includes("0 caps"), true, `caps counted: ${chaos.stat}`);
});

test("reflective self-description is not misread as micro-management", () => {
  const reflective = [
    "I don't trust my own judgement on this anymore, I've rewritten it four times.",
    "I don't like Tailwind because I've avoided it for years.",
    "I don't know whether the images matter. Should I keep going?",
  ];
  const a = analyze(reflective);
  assert.equal(a.metrics.find((m) => m.id === "control").value, 0);
});

test("counts read correctly at n=1 in share text", () => {
  const a = analyze(["sorry, please help me, you are amazing and that is perfect"]);
  const stat = (id) => a.metrics.find((m) => m.id === id).stat;
  assert.equal(stat("flattery"), "1 compliment");
  assert.equal(stat("apology"), "1 of 1 message");
  assert.equal(stat("control"), "0 constraints");
  assert.equal(stat("urgency"), "0 urgency markers");
});

test("every demo sample produces the verdict its label advertises", () => {
  // The demo buttons are the first thing a visitor clicks, so a label that
  // contradicts the result is the most visible possible bug.
  for (const [key, sample] of Object.entries(SAMPLES)) {
    const parsed = parse(sample.text);
    const result = analyze(toPrompts(parsed));
    assert.equal(
      result.verdict.archetype.id,
      sample.expects,
      `${key}: button says "${sample.label}" but the verdict is ${result.verdict.archetype.name}`,
    );
    // A demo that renders as provisional undercuts the product's own claim that
    // small samples are flagged, so the showcase conversations must clear the
    // gate. This was silently false for every demo when the gate was the
    // hardcoded 5 while the page promised twenty.
    assert.equal(
      result.verdict.smallSample,
      false,
      `${key}: demo has ${result.messageCount} messages, below the ${MIN_CONFIDENT} gate, so it renders as "tentative"`,
    );
  }
});

test("every axis has a published saturation point and a matching archetype table entry", () => {
  // index.html promises "the saturation point for every axis is listed in the
  // method". This keeps that promise true as axes are added or renamed.
  assert.deepEqual(
    Object.keys(SATURATION).sort(),
    AXES.map((a) => a.id).sort(),
    "SATURATION and AXES disagree about which axes exist",
  );
  for (const [id, entry] of Object.entries(SATURATION)) {
    assert.ok(entry.fullAt > 0, `${id} needs a positive saturation point`);
    assert.ok(entry.unit && entry.unit.length > 5, `${id} needs a human-readable unit`);
    assert.equal(typeof entry.percent, "boolean", `${id} must declare whether it is a rate`);
    // A share of messages cannot exceed 100%, so a rate axis saturating above
    // 100 is unreachable and would silently cap below full marks forever.
    if (entry.percent) {
      assert.ok(entry.fullAt <= 100, `${id} is a percentage but saturates at ${entry.fullAt}`);
    }
  }
});

test("an axis at exactly its saturation point reads 100", () => {
  const { fullAt } = SATURATION.apology;
  assert.equal(Math.round(scale(fullAt, fullAt)), 100);
  assert.equal(Math.round(scale(fullAt * 2, fullAt)), 100, "percentages must clamp, not overflow");
  assert.equal(Math.round(scale(0, fullAt)), 0);
});

test("a large export is capped and stays fast instead of hanging the tab", () => {
  // A real ChatGPT export runs to thousands of turns. The previous all-pairs
  // similarity scan re-tokenised on every comparison, which meant minutes of
  // blocked main thread on the feature the page calls instant.
  const many = Array.from({ length: 6000 }, (_, i) =>
    i % 7 === 0 ? "fix the failing test in auth.spec.ts please" : `what does this error mean in build log ${i}`);
  const started = process.hrtime.bigint();
  const a = analyze(many);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(a.truncated, true);
  assert.equal(a.messageCount, MAX_ANALYZED);
  assert.equal(a.droppedCount, 6000 - MAX_ANALYZED);
  assert.ok(ms < 2000, `analysis of 6000 messages took ${Math.round(ms)}ms`);
});

test("input under the cap is not reported as truncated", () => {
  const a = analyze(["hello there", "can you help me with this"]);
  assert.equal(a.truncated, false);
  assert.equal(a.droppedCount, 0);
});

test("the tentative-verdict threshold matches the number the page quotes", () => {
  const make = (n) => Array.from({ length: n }, (_, i) => `please help with bug ${i}, sorry`);
  assert.equal(analyze(make(MIN_CONFIDENT - 1)).verdict.smallSample, true);
  assert.equal(analyze(make(MIN_CONFIDENT)).verdict.smallSample, false);
  assert.ok(analyze(make(MIN_CONFIDENT - 1)).sampleNote.includes(String(MIN_CONFIDENT)));
  assert.equal(analyze(make(MIN_CONFIDENT)).sampleNote, null);
});

test("a capped input reports the analysed slice, not the raw input", () => {
  // The exhibits quote individual messages. If they draw from the raw input
  // while the headline says fewer were read, the page quotes a message it just
  // said it skipped.
  const many = Array.from({ length: MAX_ANALYZED + 500 }, (_, i) =>
    i === MAX_ANALYZED + 400
      ? "x".repeat(4000)
      : `message number ${i} with some words in it`);
  const a = analyze(many);
  assert.equal(a.messageCount, MAX_ANALYZED);
  assert.equal(a.analyzedMessages.length, MAX_ANALYZED);
  // The oversized message sits past the cut, so it must not be quotable.
  assert.ok(!a.analyzedMessages.includes(many[MAX_ANALYZED + 400]));
});

test("the shared card discloses a capped input instead of claiming the raw count", () => {
  // The card is what gets screenshotted and posted, so it must not assert a
  // count that the run itself denies elsewhere on screen.
  const capped = { messageCount: 1500, droppedCount: 2500, truncated: true, tokens: 1234567 };
  assert.equal(headerCount(capped), "1,500 of 4,000 messages · 1,234,567 tokens");

  const whole = { messageCount: 21, droppedCount: 0, truncated: false, tokens: 4321 };
  assert.equal(headerCount(whole), "21 messages · 4,321 tokens");
});

test("every metric stays inside 0-100 and carries evidence", () => {
  const a = analyze(["PLEASE!!! 🙏 just make it work, sorry, asap — it's 3am and i need this by friday"]);
  for (const metric of a.metrics) {
    assert.ok(metric.value >= 0 && metric.value <= 100, `${metric.id} out of range: ${metric.value}`);
    assert.ok(metric.evidence.length > 10);
    assert.ok(metric.joke.length > 5);
    assert.ok(metric.stat.length > 0);
  }
});
