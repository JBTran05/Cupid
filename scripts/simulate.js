#!/usr/bin/env node
/*
 * Plays Cupid against simulated users, once per food, to check that every
 * food can be found and how many questions it takes.
 *
 *   npm run simulate            summary
 *   npm run simulate -- --all   also list every food's result
 */
const data = require('../js/data.js');
const { createEngine } = require('../js/engine.js');

const engine = createEngine(data);
if (engine.problems.length) {
  console.error('Data problems:\n  ' + engine.problems.join('\n  '));
  process.exit(1);
}

function seeded(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How a simulated person answers. `maybeRate`: chance they say "maybe" to a
// different cuisine from the same part of the world. `unsure`: chance they
// shrug and say "maybe" to any question at all.
function answerFor(q, target, rng, persona) {
  if (persona.unsure && rng() < persona.unsure) return 'maybe';
  const v = engine.value(q, target);
  if (v >= 0.75) return 'yes';
  if (v >= 0.25) return 'maybe';
  if (q.kind === 'cuisine' && q.leaf && engine.regionOf(q.node) === engine.regionOf(target.cuisineId) && rng() < persona.maybeRate) {
    return 'maybe';
  }
  return 'no';
}

// An early pick after a run of Maybes goes straight to restaurants; moving on
// from it counts as a "no", like a wrong guess.
function play(target, rng, persona) {
  const steps = [];
  const confidence = []; // how sure Cupid was at each guess
  let placesAt = null; // clicks before Cupid first showed restaurants
  const end = (ok) => ({ ok, steps, confidence, placesAt: placesAt ?? steps.length + (ok ? 1 : 0) });
  for (let turn = 0; turn < 60; turn++) {
    const prompt = engine.nextPrompt(steps, rng);
    if (prompt.type === 'giveup') return end(false);
    if (prompt.type === 'guess') {
      if (prompt.indecisive && placesAt === null) placesAt = steps.length;
      if (!prompt.indecisive) confidence.push(prompt.confidence);
      if (prompt.food.id === target.id) return end(true);
      const close = !prompt.indecisive && engine.similarity(prompt.food, target) > 0.6;
      steps.push({ type: 'guess', fid: prompt.food.id, answer: close ? 'close' : 'no' });
      continue;
    }
    steps.push({ type: 'q', qid: prompt.question.id, answer: answerFor(prompt.question, target, rng, persona) });
  }
  return end(false);
}

const showAll = process.argv.includes('--all');
// `checked`: counts toward "Hardest foods". Someone who says maybe to nearly
// everything can't be expected to land on one exact dish; for them the
// number that matters is how soon they see restaurants.
const personas = [
  { name: 'decisive (never says maybe to other cuisines)', maybeRate: 0, checked: true },
  { name: 'flexible (often says maybe to nearby cuisines)', maybeRate: 0.5, checked: true },
  { name: 'indecisive (says maybe to 80% of questions)', maybeRate: 0.5, unsure: 0.8, checked: false },
];
const SEEDS = 6;
const perFood = new Map(engine.foods.map((f) => [f.id, { found: 0, runs: 0, questions: 0, wrong: 0 }]));

personas.forEach((persona) => {
  let found = 0;
  let runs = 0;
  let questions = 0;
  let wrong = 0;
  let firstTry = 0;
  let maybes = 0;
  let placesAt = 0;
  let placesWorst = 0;
  const confidence = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    engine.foods.forEach((target) => {
      const result = play(target, seeded(seed * 7919 + target.index), persona);
      const q = result.steps.filter((s) => s.type === 'q').length;
      maybes += result.steps.filter((s) => s.answer === 'maybe').length;
      confidence.push(...result.confidence);
      placesAt += result.placesAt;
      placesWorst = Math.max(placesWorst, result.placesAt);
      const g = result.steps.filter((s) => s.type === 'guess').length;
      runs++;
      const stats = persona.checked ? perFood.get(target.id) : { runs: 0, found: 0, questions: 0, wrong: 0 };
      stats.runs++;
      if (result.ok) {
        found++;
        questions += q;
        wrong += g;
        if (g === 0) firstTry++;
        stats.found++;
        stats.questions += q;
        stats.wrong += g;
      }
    });
  }
  console.log(`\n${persona.name}`);
  console.log(`  found:            ${((100 * found) / runs).toFixed(1)}%  (${found}/${runs})`);
  console.log(`  right first try:  ${((100 * firstTry) / runs).toFixed(1)}%`);
  console.log(`  avg questions:    ${(questions / found).toFixed(1)}`);
  console.log(`  avg wrong guesses ${(wrong / found).toFixed(2)}`);
  console.log(`  maybes per game:  ${(maybes / runs).toFixed(2)}`);
  console.log(`  sees restaurants: after ${(placesAt / runs).toFixed(1)} clicks on average, ${placesWorst} at most`);
  const sorted = [...confidence].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const unsure = confidence.filter((c) => c < 0.7).length;
  console.log(`  sure at guess:    median ${(100 * median).toFixed(0)}%, ${((100 * unsure) / confidence.length).toFixed(0)}% of guesses under 70%`);
});

const rows = [...perFood.entries()].map(([id, s]) => ({
  id,
  found: s.found / s.runs,
  questions: s.found ? s.questions / s.found : NaN,
  wrong: s.found ? s.wrong / s.found : NaN,
}));
const trouble = rows.filter((r) => r.found < 1 || r.wrong >= 1.5).sort((a, b) => a.found - b.found || b.wrong - a.wrong);
console.log(`\nHardest foods (${trouble.length}):`);
(showAll ? rows : trouble).forEach((r) => {
  console.log(`  ${r.id.padEnd(22)} found ${(100 * r.found).toFixed(0).padStart(3)}%   ${r.questions.toFixed(1).padStart(4)} q   ${r.wrong.toFixed(1)} wrong`);
});
