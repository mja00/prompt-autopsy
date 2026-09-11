// Archetype table. `weights` drive a deterministic weighted fit over the nine
// axes (positive = wants the axis high, negative = wants it low). No RNG, no
// server, same input always yields the same verdict.

export const AXES = [
  { id: "apology", label: "Apology Index", blurb: "Times you said sorry to software." },
  { id: "politeness", label: "Grovel", blurb: "Pleases, thank-yous, and other courtesies." },
  { id: "hostility", label: "Machine Abuse", blurb: "Accusations that it is wrong, broken, or lying." },
  { id: "churn", label: "Retry Spiral", blurb: "How many times you re-asked the same thing." },
  { id: "control", label: "Micro-Management", blurb: "Constraints, bans, and exact specifications." },
  { id: "verbosity", label: "Backstory Dumping", blurb: "Length of the average briefing." },
  { id: "flattery", label: "Bot Flattery", blurb: "Compliments paid to a text predictor." },
  { id: "chaos", label: "Chaos", blurb: "Caps lock, emoji, and exclamation pileups." },
  { id: "urgency", label: "Deadline Panic", blurb: "ASAPs, 'right now's, and 3am timestamps." },
];

export const ARCHETYPES = [
  {
    id: "apologetic-overexplainer",
    name: "The Apologetic Overexplainer",
    emoji: "🙇",
    tagline: "Sorry, quick question, sorry — and then 900 words.",
    blurb:
      "You open with an apology for existing and close with one for asking. In between you give so much context that the actual question arrives like a plot twist. The model does not need your company's headcount to fix a CSS bug, but you told it anyway.",
    weights: { apology: 1.6, verbosity: 1.4, politeness: 1.0, hostility: -1.0, control: -0.6 },
    rare: false,
  },
  {
    id: "polite-dictator",
    name: "The Polite Dictator",
    emoji: "🎩",
    tagline: "\u201cPlease\u201d has never carried more menace.",
    blurb:
      "Immaculate manners, total submission required. You say please, then specify line numbers, variable names, and the exact tone you expect to be addressed in. It is a hostage note written on monogrammed paper.",
    weights: { politeness: 1.5, control: 1.6, hostility: 0.4, verbosity: 0.6, chaos: -0.8 },
    rare: false,
  },
  {
    id: "feral-debugger",
    name: "The Feral Debugger",
    emoji: "🪓",
    tagline: "FOURTH TIME. IT IS STILL BROKEN.",
    blurb:
      "You have stopped asking questions and started issuing findings. Caps lock is a tool. Exclamation marks are punctuation. You are not mad at the model, you are mad at the last three hours, and it happens to be the only thing in the room.",
    weights: { hostility: 1.8, chaos: 1.4, churn: 1.0, politeness: -1.0, verbosity: -0.3 },
    rare: false,
  },
  {
    id: "micro-manager",
    name: "The Micro-Manager",
    emoji: "📐",
    tagline: "Don't, only, exactly, never, just — in that order.",
    blurb:
      "Your prompts read like a design spec handed to a contractor you do not trust. Constraints outnumber requests. You have banned more things than you have asked for, and you would like it noted that you said not to use that word.",
    weights: { control: 2.2, verbosity: 0.3, flattery: -0.7, apology: -0.5, chaos: -0.5 },
    rare: false,
  },
  {
    id: "retry-spiral",
    name: "The Retry Spiral",
    emoji: "🌀",
    tagline: "\u201cThat didn't work. Try again.\u201d x 40.",
    blurb:
      "You do not explain, you iterate. Same request, twelve times, each one shorter and colder than the last. Somewhere around attempt nine you stopped writing sentences and started writing search queries with attitude.",
    weights: { churn: 2.2, verbosity: -0.9, control: 0.5, hostility: 0.6 },
    rare: false,
  },
  {
    id: "bot-flatterer",
    name: "The Flatterer",
    emoji: "🥰",
    tagline: "You tell a text predictor it's doing a great job.",
    blurb:
      "You say \u201cperfect\u201d, \u201camazing\u201d, \u201cyou're a legend\u201d to something with no feelings, no memory of this, and no capacity to care. Your praise is sincere and completely unreciprocated. It is the healthiest relationship in your life.",
    weights: { flattery: 2.0, politeness: 1.0, hostility: -1.2, chaos: 0.4 },
    rare: false,
  },
  {
    id: "midnight-rambler",
    name: "The 3AM Rambler",
    emoji: "🌙",
    tagline: "Every prompt is a monologue and it is always too late at night.",
    blurb:
      "Your message history is a diary with a question mark at the end. You explain the whole project, then the history of the project, then how you feel about the project. There is a real request in there and it is on line 34.",
    weights: { verbosity: 2.0, urgency: 1.0, churn: 0.4, control: -0.4 },
    rare: false,
  },
  {
    id: "one-liner",
    name: "The One-Liner",
    emoji: "⚡",
    tagline: "No hello. No context. No thanks. Just demands.",
    blurb:
      "You communicate with machines the way you wish you could communicate with people. Five words, no punctuation, no apology, no explanation, and a faint implication that it should already know. You asked one flat question, took the answer, and left — the most functional relationship with AI on this website, and the coldest.",
    weights: { verbosity: -1.8, churn: 0.5, politeness: -0.8, apology: -0.8, flattery: -1.2, control: 0.4 },
    rare: false,
  },
  {
    id: "machine-gaslighter",
    name: "The Machine Gaslighter",
    emoji: "🔪",
    tagline: "Confidently telling the thing that it is confidently wrong.",
    blurb:
      "You have caught it hallucinating exactly enough times to never trust it again, and you open every new conversation by letting it know. Your politeness is gone. Your pattern is: paste output, type \u201cno\u201d, paste again.",
    weights: { hostility: 2.2, politeness: -1.4, apology: -1.2, verbosity: -0.4, chaos: 0.5 },
    rare: false,
  },
  {
    id: "doormat",
    name: "The Doormat",
    emoji: "🧎",
    tagline: "You thanked it for ignoring you.",
    blurb:
      "You apologise for interrupting it. You say sorry when it gets something wrong. You have thanked a chatbot for a response that began with \u201cAs an AI language model\u201d. Somewhere a customer service manager would like to hire you immediately.",
    weights: { apology: 2.0, politeness: 1.6, hostility: -1.6, control: -1.0, flattery: 0.6 },
    rare: false,
  },
  {
    id: "chaos-gremlin",
    name: "The Chaos Gremlin",
    emoji: "🔮",
    tagline: "Caps, emoji, six exclamation marks, zero plan.",
    blurb:
      "Your prompts look like a slot machine hitting. Ideas arrive faster than sentences. You have typed \u201cwait\u201d and then a completely different request in the same breath, and you expect both to be handled.",
    weights: { chaos: 2.2, churn: 0.7, verbosity: -0.3, control: -0.6, flattery: 0.5 },
    rare: false,
  },
  {
    id: "contract-lawyer",
    name: "The Contract Lawyer",
    emoji: "⚖️",
    tagline: "Sections. Headings. Numbered requirements.",
    blurb:
      "You write prompts with headings and lettered sub-clauses, and you would like each requirement addressed individually by name. There is a closing paragraph reserving the right to request revisions. Nobody has ever made you sign anything.",
    weights: { control: 1.8, verbosity: 1.6, politeness: 0.7, chaos: -1.4, hostility: 0.2 },
    rare: false,
  },
  {
    id: "deadline-goblin",
    name: "The Deadline Goblin",
    emoji: "⏰",
    tagline: "\u201cASAP\u201d is doing a lot of work here.",
    blurb:
      "Everything is urgent and it is always urgent in the past tense. You have told it what time it is, as if it is a manager who needs to know how badly you are doing. Whatever this is for, it was due forty minutes ago.",
    weights: { urgency: 2.2, chaos: 0.9, verbosity: 0.3, churn: 0.6, flattery: -0.6 },
    rare: false,
  },
  {
    id: "the-thrall",
    name: "The Thrall",
    emoji: "🫠",
    tagline: "It says jump, you say \u201cthank you so much, you're the best\u201d.",
    blurb:
      "Perfect manners, zero boundary, unlimited gratitude. You thank it before it helps, after it fails, and in advance for the next time. If it asked you to rate it five stars you would write a paragraph.",
    weights: { flattery: 2.2, politeness: 2.0, apology: 1.2, hostility: -2.0, control: -0.8 },
    rare: false,
  },
  {
    id: "the-normal-one",
    name: "The Normal One",
    emoji: "🫥",
    tagline: "Statistically suspicious levels of composure.",
    blurb:
      "Polite but brief. Specific but not deranged. You asked, it answered, you moved on. You are the control group of this entire website and honestly, in this dataset, that makes you the weird one.",
    weights: { chaos: -1.2, hostility: -1.0, apology: -0.6, flattery: -0.6, urgency: -0.8, churn: -0.8, verbosity: -0.2 },
    rare: true,
  },
];

// Scoring is a weighted distance to each archetype's ideal profile, NOT a dot
// product. A dot product punished an archetype for every axis it wants low (a
// large negative weight on hostility cost The Thrall ~200 points even when
// hostility was a clean 0) and rewarded archetypes that simply omitted axes.
// The ideal profile is 100 for every positive weight and 0 for every negative
// one. Axes an archetype does not mention are not free either: without an
// implicit claim of "should be low", an archetype could ignore the loudest
// signal in the profile and win on the silence alone.
const UNCLAIMED_WEIGHT = 0.5;

export function fitFor(archetype, axes) {
  let weighted = 0;
  let total = 0;
  for (const axis of AXES) {
    const weight = archetype.weights[axis.id] ?? -UNCLAIMED_WEIGHT;
    const value = axes[axis.id] ?? 0;
    const ideal = weight > 0 ? 100 : 0;
    weighted += Math.abs(weight) * Math.abs(value - ideal);
    total += Math.abs(weight);
  }
  return total ? 100 - weighted / total : 0;
}

// The Normal One is defined by the absence of signal, so it would otherwise be
// a free pass on any profile that is merely unremarkable. It only becomes a
// verdict when nothing on any axis actually fired.
const GATE = {
  "the-normal-one": (axes, messageCount) => Math.max(...Object.values(axes)) < 60 && messageCount >= 6,
};

export function rankArchetypes(axes, messageCount = 0) {
  return ARCHETYPES.map((a) => ({ archetype: a, score: fitFor(a, axes) }))
    .filter(({ archetype }) => {
      const gate = GATE[archetype.id];
      return gate ? gate(axes, messageCount) : true;
    })
    .sort((x, y) => y.score - x.score);
}
