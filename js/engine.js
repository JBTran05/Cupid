/*
 * Cupid's guessing engine — a small Bayesian "Akinator" over the food list.
 *
 * Every food starts with a weight (its popularity). Each answer multiplies
 * every food's weight by how likely that answer would be if the user were
 * craving it. Cupid then asks whichever question best splits what's left,
 * with a nudge to settle the cuisine first, and guesses once one food clearly
 * leads.
 *
 * A game is just a list of steps, so undo is "drop the last step":
 *   { type: 'q', qid: 't:noodles', answer: 'yes' | 'maybe' | 'no' }
 *   { type: 'guess', fid: 'pho', answer: 'no' | 'close' }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CupidEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // A "maybe" on a cuisine spreads to its neighbours: the cuisine itself, its
  // parent group (Thai -> Southeast Asian), then the wider region (-> Asian).
  const MAYBE_FALLOFF = [1, 0.9, 0.75];
  const MAYBE_FLOOR_LEAF = 0.22;
  const MAYBE_FLOOR_GROUP = 0.4;
  // Leaves room for people answering a little inconsistently.
  const CUISINE_FLOOR = 0.03;
  const TRAIT_FLOOR = 0.06;
  // After the cuisine questions, don't bring up a new part of the world while
  // the ones the user leaned toward still hold this much of the probability.
  const TRACK_HOLD = 0.25;

  const GUESS = {
    minQuestions: 3,
    gapAfterGuess: 2, // questions to ask between guesses...
    certain: 0.85, // ...unless the next pick is already this likely
    confident: 0.7, // guess once the top food is this likely,
    stale: 0.04, // or when no question left is worth asking (bits)
    maybeRun: 3, // or after this many Maybes in a row, however unsure
    maxQuestions: 22,
    maxRejected: 4,
  };

  function parseList(str) {
    const out = {};
    String(str || '').split(/\s+/).filter(Boolean).forEach((tok) => {
      if (tok.endsWith('~')) out[tok.slice(0, -1)] = 0.5;
      else out[tok] = 1;
    });
    return out;
  }

  // Shannon entropy (bits) of a list of non-negative weights.
  function entropy(ws) {
    let total = 0;
    for (const w of ws) total += w;
    if (total <= 0) return 0;
    let h = 0;
    for (const w of ws) {
      if (w > 0) {
        const p = w / total;
        h -= p * Math.log2(p);
      }
    }
    return h;
  }

  function createEngine(data) {
    const problems = [];

    const cuisines = {};
    Object.entries(data.cuisines).forEach(([id, c]) => {
      cuisines[id] = { id, parent: null, ...c, phrase: c.phrase || `${c.name} food`, adj: c.adj || c.name, children: [] };
    });
    Object.values(cuisines).forEach((c) => {
      if (!c.parent) return;
      if (cuisines[c.parent]) cuisines[c.parent].children.push(c.id);
      else problems.push(`cuisine ${c.id}: unknown parent "${c.parent}"`);
    });
    const isLeaf = (id) => cuisines[id].children.length === 0;
    // [id, parent, grandparent, ...]
    const lineage = (id) => {
      const out = [];
      for (let n = id; n && cuisines[n]; n = cuisines[n].parent) out.push(n);
      return out;
    };
    const regionOf = (id) => lineage(id).pop();

    const traits = {};
    Object.entries(data.traits).forEach(([id, t]) => {
      traits[id] = { id, yesFloor: TRAIT_FLOOR, noFloor: TRAIT_FLOOR, weight: 1, ...t };
    });

    const seen = new Set();
    const foods = data.foods.map((f, index) => {
      if (seen.has(f.id)) problems.push(`food ${f.id}: duplicate id`);
      seen.add(f.id);
      const cz = parseList(f.cuisine);
      const tags = parseList(f.tags);
      const member = {};
      Object.entries(cz).forEach(([leaf, w]) => {
        if (!cuisines[leaf]) return problems.push(`food ${f.id}: unknown cuisine "${leaf}"`);
        if (!isLeaf(leaf)) problems.push(`food ${f.id}: "${leaf}" is a group, use a specific cuisine`);
        lineage(leaf).forEach((n) => { member[n] = Math.max(member[n] || 0, w); });
      });
      Object.keys(tags).forEach((t) => { if (!traits[t]) problems.push(`food ${f.id}: unknown tag "${t}"`); });
      return {
        ...f,
        index,
        cz,
        tags,
        member,
        cuisineId: Object.keys(cz)[0],
        prior: f.pop || 1,
        shortName: f.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
        search: f.search || f.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
      };
    });
    const foodById = Object.fromEntries(foods.map((f) => [f.id, f]));

    const questions = [];
    Object.values(cuisines).forEach((c) => {
      const leaf = isLeaf(c.id);
      if (!leaf && c.children.length < 2) return; // a one-child group is the same question twice
      if (!foods.some((f) => f.member[c.id])) return;
      questions.push({ id: 'c:' + c.id, kind: 'cuisine', node: c.id, leaf });
    });
    Object.values(traits).forEach((t) => questions.push({ id: 't:' + t.id, kind: 'trait', trait: t.id }));
    const questionById = Object.fromEntries(questions.map((q) => [q.id, q]));

    function value(q, f) {
      return q.kind === 'cuisine' ? f.member[q.node] || 0 : f.tags[q.trait] || 0;
    }

    function likelihood(q, answer, f) {
      if (q.kind === 'cuisine') {
        const m = f.member[q.node] || 0;
        if (answer === 'yes') return CUISINE_FLOOR + (1 - CUISINE_FLOOR) * m;
        if (answer === 'no') return CUISINE_FLOOR + (1 - CUISINE_FLOOR) * (1 - m);
        let best = q.leaf ? MAYBE_FLOOR_LEAF : MAYBE_FLOOR_GROUP;
        lineage(q.node).forEach((n, depth) => {
          best = Math.max(best, (f.member[n] || 0) * (MAYBE_FALLOFF[depth] ?? 0));
        });
        return best;
      }
      const t = traits[q.trait];
      const v = f.tags[q.trait] || 0;
      if (answer === 'yes') return t.yesFloor + (1 - t.yesFloor) * v;
      if (answer === 'no') return t.noFloor + (1 - t.noFloor) * (1 - v);
      return 0.7 + 0.3 * v; // maybe = open to it
    }

    // P(user says yes | craving this food), for scoring how useful a question is.
    questions.forEach((q) => {
      q.pYes = foods.map((f) => {
        const y = likelihood(q, 'yes', f);
        return y / (y + likelihood(q, 'no', f));
      });
    });

    // 0..1: how alike two foods are, used when a guess is "close".
    const simCache = new Map();
    function similarity(a, b) {
      const key = a.index < b.index ? a.index + ':' + b.index : b.index + ':' + a.index;
      if (simCache.has(key)) return simCache.get(key);
      let cuisineSim = 0;
      Object.entries(b.cz).forEach(([leaf, w]) => {
        lineage(leaf).forEach((n, depth) => {
          cuisineSim = Math.max(cuisineSim, Math.min(w, a.member[n] || 0) * [1, 0.7, 0.45][depth]);
        });
      });
      let shared = 0;
      let union = 0;
      new Set([...Object.keys(a.tags), ...Object.keys(b.tags)]).forEach((t) => {
        const x = a.tags[t] || 0;
        const y = b.tags[t] || 0;
        shared += Math.min(x, y);
        union += Math.max(x, y);
      });
      const sim = 0.45 * cuisineSim + 0.55 * (union ? shared / union : 0);
      simCache.set(key, sim);
      return sim;
    }

    function stepLikelihood(step, f) {
      if (step.type === 'guess') {
        if (f.id === step.fid) return step.answer === 'close' ? 0.08 : 0.01;
        return step.answer === 'close' ? 0.25 + 0.75 * similarity(f, foodById[step.fid]) : 1;
      }
      return likelihood(questionById[step.qid], step.answer, f);
    }

    const rejectedIds = (steps) => new Set(steps.filter((s) => s.type === 'guess').map((s) => s.fid));

    // Cuisine nodes the user answered yes / maybe / no to.
    function cuisineAnswers(steps) {
      const said = { yes: [], maybe: [], no: [] };
      steps.forEach((s) => {
        const q = s.type === 'q' && questionById[s.qid];
        if (q && q.kind === 'cuisine') said[s.answer].push(q.node);
      });
      return said;
    }

    // In every cuisine the user said yes to, and not wholly inside one they
    // said no to (pizza survives "no classic American" — it's Italian too).
    function fits(f, said) {
      return said.yes.every((n) => f.member[n]) &&
        said.no.every((n) => Object.keys(f.cz).some((leaf) => !lineage(leaf).includes(n)));
    }

    // Cuisine answers are taken at their word: while any dish that fits them is
    // still in play, the rest are out, so a wrong guess can't send Cupid back
    // to a cuisine you ruled out. If every dish that fits is turned down, the
    // others come back rather than leaving nothing to guess.
    function posterior(steps) {
      const w = foods.map((f) => f.prior);
      steps.forEach((s) => foods.forEach((f, i) => { w[i] *= stepLikelihood(s, f); }));
      const said = cuisineAnswers(steps);
      const rejected = rejectedIds(steps);
      const fit = foods.map((f) => fits(f, said));
      if (foods.some((f, i) => fit[i] && !rejected.has(f.id))) fit.forEach((ok, i) => { if (!ok) w[i] = 0; });
      const total = w.reduce((a, b) => a + b, 0);
      return w.map((x) => x / total);
    }

    function infoGain(q, p, h) {
      const yes = p.map((pi, i) => pi * q.pYes[i]);
      const no = p.map((pi, i) => pi * (1 - q.pYes[i]));
      const pYes = yes.reduce((a, b) => a + b, 0);
      return h - pYes * entropy(yes) - (1 - pYes) * entropy(no);
    }

    function context(steps, p = posterior(steps)) {
      const qSteps = steps.filter((s) => s.type === 'q');
      let leafYes = null;
      let leafNo = 0;
      const maybeLeaves = [];
      qSteps.forEach((s) => {
        const q = questionById[s.qid];
        if (q.kind !== 'cuisine' || !q.leaf) return;
        if (s.answer === 'yes') leafYes = q.node;
        else if (s.answer === 'no') leafNo++;
        else maybeLeaves.push(q.node);
      });

      const leafMass = {};
      foods.forEach((f, i) => Object.entries(f.cz).forEach(([leaf, w]) => {
        leafMass[leaf] = (leafMass[leaf] || 0) + p[i] * w;
      }));
      const topLeafMass = Math.max(0, ...Object.values(leafMass));
      const maybeMass = maybeLeaves.reduce((s, n) => s + (leafMass[n] || 0), 0);

      let sinceGuess = 0;
      for (let i = steps.length - 1; i >= 0 && steps[i].type === 'q'; i--) sinceGuess++;
      // Maybes in a row, counted only if one of them is about the dish itself:
      // "maybe Thai, maybe Vietnamese" is someone open to Southeast Asian
      // food, not someone who can't decide.
      let maybeRun = 0;
      let dishMaybe = false;
      for (let i = steps.length - 1; i >= 0 && steps[i].type === 'q' && steps[i].answer === 'maybe'; i--) {
        maybeRun++;
        if (questionById[steps[i].qid].kind === 'trait') dishMaybe = true;
      }
      if (!dishMaybe) maybeRun = 0;
      const rejected = rejectedIds(steps);

      // Where the game has been heading: regions of cuisines the user said yes
      // or maybe to, and of dishes Cupid already guessed.
      const said = cuisineAnswers(steps);
      const track = new Set([...said.yes, ...said.maybe].map(regionOf));
      rejected.forEach((id) => Object.keys(foodById[id].cz).forEach((leaf) => track.add(regionOf(leaf))));
      let trackMass = 0;
      foods.forEach((f, i) => { if ([...track].some((r) => f.member[r])) trackMass += p[i]; });

      return {
        qCount: qSteps.length,
        leafYes,
        leafNo,
        maybeLeaves,
        said,
        track,
        trackMass,
        // Until we know roughly which cuisine, ask about cuisines first. Once
        // Cupid has made a guess it has picked a direction, so a wrong guess
        // doesn't restart the cuisine hunt.
        cuisinePhase: !leafYes && !rejected.size && topLeafMass < 0.55 && maybeMass < 0.6 && qSteps.length < 7,
        sinceGuess,
        maybeRun,
        rejected,
      };
    }

    // Whether earlier answers already settle a cuisine question. After a yes,
    // only cuisines inside it are still open. After a no, nothing inside it,
    // and not the wider group either: "no to classic American" followed by
    // "American food at all?" reads as the same question twice.
    function settled(q, said) {
      if (q.kind !== 'cuisine') return false;
      const mine = lineage(q.node);
      if (said.yes.some((n) => n === q.node || !mine.includes(n))) return true;
      return said.no.some((n) => mine.includes(n) || lineage(n).includes(q.node));
    }

    // After "maybe Thai", prefer Vietnamese/Filipino next, then other Asian.
    function relatedBonus(node, maybeLeaves) {
      let bonus = 1;
      const mine = lineage(node);
      maybeLeaves.forEach((m) => {
        const theirs = lineage(m);
        if (mine[1] && mine[1] === theirs[1]) bonus = Math.max(bonus, 1.8);
        else if (mine[mine.length - 1] === theirs[theirs.length - 1]) bonus = Math.max(bonus, 1.4);
      });
      return bonus;
    }

    function multiplier(q, ctx) {
      const weight = q.kind === 'trait' ? traits[q.trait].weight : 1;
      if (ctx.cuisinePhase) {
        if (q.kind === 'trait') return ctx.qCount >= 3 ? 0.5 * weight : 0;
        if (q.leaf) return relatedBonus(q.node, ctx.maybeLeaves);
        // Open with a specific cuisine; go broad ("Asian at all?") after some no's.
        if (ctx.leafNo + ctx.maybeLeaves.length === 0) return 0;
        return Math.min(0.9, 0.25 + 0.15 * ctx.leafNo);
      }
      if (q.kind === 'trait') return weight;
      // Keep digging where the answers point (say, Korean after a wrong Korean
      // BBQ guess) rather than bringing up a part of the world the user hasn't
      // shown interest in, until that direction has mostly run dry.
      if (ctx.trackMass >= TRACK_HOLD && !ctx.track.has(regionOf(q.node))) return 0;
      return q.leaf ? 0.6 : 0.3;
    }

    function nextPrompt(steps, rng = Math.random) {
      const p = posterior(steps);
      const ctx = context(steps, p);
      const ranked = foods
        .map((food, i) => ({ food, p: p[i] }))
        .filter((r) => !ctx.rejected.has(r.food.id))
        .sort((a, b) => b.p - a.p);
      if (!ranked.length || ctx.rejected.size >= GUESS.maxRejected) return { type: 'giveup' };

      const h = entropy(p);
      // Open with a hunch, like Akinator: one of the big cuisines, picked at
      // random in proportion to how much it would tell us.
      if (!steps.length) {
        const openers = questions
          .filter((q) => q.kind === 'cuisine' && q.leaf)
          .map((q) => ({ q, gain: infoGain(q, p, h) }))
          .sort((a, b) => b.gain - a.gain)
          .slice(0, 10);
        let r = rng() * openers.reduce((s, o) => s + o.gain, 0);
        const opener = openers.find((o) => (r -= o.gain) <= 0) || openers[0];
        return { type: 'question', question: opener.q, confidence: ranked[0].p };
      }

      const asked = new Set(steps.filter((s) => s.type === 'q').map((s) => s.qid));
      let best = null;
      let bestGain = 0;
      questions.forEach((q) => {
        if (asked.has(q.id) || settled(q, ctx.said)) return;
        const mult = multiplier(q, ctx);
        if (!mult) return;
        const gain = infoGain(q, p, h);
        if (gain < 0.005) return;
        bestGain = Math.max(bestGain, gain);
        const spread = ctx.cuisinePhase && q.kind === 'cuisine' ? 0.6 : 0.3;
        const score = gain * mult * (1 - spread / 2 + spread * rng());
        if (!best || score > best.score) best = { q, score };
      });

      const top = ranked[0];
      const ready = ctx.qCount >= GUESS.minQuestions && (ctx.sinceGuess >= GUESS.gapAfterGuess || top.p >= GUESS.certain);
      const sure = top.p >= GUESS.confident;
      const stuck = bestGain < GUESS.stale;
      const longGame = ctx.qCount >= GUESS.maxQuestions && ctx.sinceGuess >= 1;
      if (!best || (ready && (sure || stuck)) || longGame) {
        return { type: 'guess', food: top.food, confidence: top.p };
      }
      // Someone who answers Maybe to everything would be clicking forever, so
      // after a run of them Cupid stops asking and offers its best pick from
      // the answers so far. If that's not it, the game carries on from there,
      // with the pick counted as a "no".
      if (ctx.qCount >= GUESS.minQuestions && ctx.maybeRun >= GUESS.maybeRun) {
        return { type: 'guess', food: top.food, confidence: top.p, indecisive: true };
      }
      return { type: 'question', question: best.q, confidence: top.p };
    }

    function ranking(steps) {
      const p = posterior(steps);
      const ctx = context(steps, p);
      return foods
        .map((food, i) => ({ food, p: p[i] }))
        .filter((r) => r.p > 0 && !ctx.rejected.has(r.food.id))
        .sort((a, b) => b.p - a.p);
    }

    // How many foods are still real contenders: at least 10% as likely as the top pick.
    function optionsLeft(steps) {
      const ranked = ranking(steps);
      return ranked.filter((r) => r.p >= ranked[0].p * 0.1).length;
    }

    // A few well-known dishes from a cuisine, picked to be different from each other.
    function examples(node, n = 3) {
      const pool = foods
        .filter((f) => f.member[node] === 1)
        .sort((a, b) => b.prior - a.prior || a.index - b.index);
      const chosen = pool.slice(0, 1);
      while (chosen.length < Math.min(n, pool.length)) {
        let best = null;
        let bestSim = Infinity;
        pool.forEach((f) => {
          if (chosen.includes(f)) return;
          const sim = Math.max(...chosen.map((c) => similarity(f, c)));
          if (sim < bestSim - 0.05) {
            best = f;
            bestSim = sim;
          }
        });
        chosen.push(best);
      }
      return chosen.map((f) => f.shortName);
    }

    // Leaf cuisine names under a group, alternating between its branches.
    function leafNames(node) {
      const branches = cuisines[node].children.map((child) =>
        isLeaf(child) ? [child] : cuisines[child].children.filter(isLeaf));
      const out = [];
      for (let i = 0; branches.some((b) => b[i]); i++) {
        branches.forEach((b) => { if (b[i]) out.push(cuisines[b[i]].name); });
      }
      return out;
    }

    return {
      cuisines,
      traits,
      foods,
      questions,
      foodById,
      questionById,
      problems,
      lineage,
      regionOf,
      value,
      similarity,
      posterior,
      context,
      nextPrompt,
      ranking,
      optionsLeft,
      examples,
      leafNames,
    };
  }

  return { createEngine, GUESS };
});
