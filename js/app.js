/* Cupid's UI: renders the current screen from `state` and feeds answers to the engine. */
(function () {
  'use strict';

  const engine = CupidEngine.createEngine(CUPID_DATA);
  if (engine.problems.length) console.warn('Cupid data problems:\n  ' + engine.problems.join('\n  '));

  const app = document.getElementById('app');
  const restartButton = document.querySelector('.topbar [data-action="restart"]');
  const locationChip = document.querySelector('.topbar [data-action="change-location"]');
  const useMiles = /^en-(US|GB)\b/i.test(navigator.language || '');

  const state = {
    screen: 'start', // start | locate | play | match | giveup
    steps: [],
    history: [], // prompts already answered, so Back can show them again
    prompt: null,
    match: null,
    matchFrom: null, // 'guess' | 'pick' | 'suggest' (shown early after a run of Maybes)
    location: null, // { lat, lng, label }; kept in memory only
    locate: { busy: '', error: '', query: '', then: 'game' },
    places: null, // { foodId, status, items, next, provider, error, slow, loadingMore, moreError }
    dishPhotos: {}, // food id -> { url, creditUrl } or null when there's none
  };

  // ---------- helpers ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  // Same key, same choice, so going Back shows the same wording.
  const pick = (list, key) => list[hash(key) % list.length];

  const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);
  const cuisineName = (food) => engine.cuisines[food.cuisineId].name;

  function formatDistance(km) {
    if (useMiles) {
      const miles = km * 0.621371;
      return miles < 0.1 ? 'under 0.1 mi' : `${miles.toFixed(1)} mi`;
    }
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  // Talks to Cupid's server (server.js). Location goes in POST bodies, not URLs.
  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    } catch {
      throw new Error("Can't reach Cupid's server. Start it with npm start, then reload this page.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Something went wrong (${res.status}).`);
    return json;
  }

  function mascot(mood, extraClass = '') {
    const wing = '<path class="wing" d="M48 52 C 38 30, 14 22, 6 36 C 14 39, 15 43, 9 48 C 17 51, 18 55, 12 60 C 24 66, 38 64, 48 60 Z"/>';
    return `
      <svg class="mascot ${extraClass}" data-mood="${mood}" viewBox="0 0 160 120" aria-hidden="true">
        <g class="body">
          <g class="wing-l">${wing}</g>
          <g class="wing-r" transform="translate(160 0) scale(-1 1)">${wing}</g>
          <path class="heart" d="M80 110 C 50 92, 34 74, 34 52 C 34 36, 46 25, 60 25 C 70 25, 77 31, 80 39 C 83 31, 90 25, 100 25 C 114 25, 126 36, 126 52 C 126 74, 110 92, 80 110 Z"/>
          <ellipse class="shine" cx="52" cy="42" rx="7" ry="4.5" transform="rotate(-35 52 42)"/>
          <g class="brows"><path d="M58 50 l12 -5"/><path d="M102 50 l-12 -5"/></g>
          <g class="eyes-open"><circle class="eye" cx="66" cy="58" r="5.5"/><circle class="eye" cx="94" cy="58" r="5.5"/><circle class="glint" cx="68" cy="56" r="1.8"/><circle class="glint" cx="96" cy="56" r="1.8"/></g>
          <g class="eyes-happy"><path d="M60 60 q6 -9 12 0"/><path d="M88 60 q6 -9 12 0"/></g>
          <ellipse class="blush" cx="56" cy="70" rx="6.5" ry="4"/><ellipse class="blush" cx="104" cy="70" rx="6.5" ry="4"/>
          <path class="mouth" d="M72 72 q8 8 16 0"/>
          <path class="mouth-sad" d="M72 79 q8 -7 16 0"/>
        </g>
      </svg>`;
  }

  // ---------- wording ----------

  const LEAF_ASKS = ['Are you in the mood for {phrase}?', 'Are you craving {phrase}?', 'How about {phrase}?'];
  const REACTIONS = {
    yes: ['Ooh, nice.', 'Love that.', 'Noted!', 'Good to know.'],
    maybe: ['Keeping my options open…', 'A maybe — noted.', 'Flexible. I like it.'],
    no: ['Got it.', 'Noted.', 'Okay, crossing that off.'],
  };

  function questionCopy(q, ctx) {
    if (q.kind === 'cuisine') {
      const c = engine.cuisines[q.node];
      if (q.leaf) {
        return {
          emoji: c.emoji,
          text: pick(LEAF_ASKS, q.id).replace('{phrase}', c.phrase),
          hint: `Think ${engine.examples(q.node, 3).join(', ')}…`,
        };
      }
      const ruledOut = state.steps
        .filter((s) => s.type === 'q' && s.answer === 'no')
        .map((s) => engine.questionById[s.qid])
        .filter((asked) => asked.kind === 'cuisine')
        .map((asked) => engine.cuisines[asked.node].name);
      const names = engine.leafNames(q.node).filter((name) => !ruledOut.includes(name));
      const hint = names.length > 5 ? `${names.slice(0, 5).join(', ')}, and more` : listJoin(names);
      const text = c.parent ? `Are you leaning toward ${c.phrase}?` : `Is ${c.phrase} on the table at all today?`;
      return { emoji: c.emoji, text, hint };
    }
    const t = engine.traits[q.trait];
    // "Are you feeling Thai noodles?" — only if that cuisine has any.
    const locked = ctx.leafYes && engine.cuisines[ctx.leafYes];
    const fits = locked && t.qc && engine.foods.some((f) => f.member[locked.id] === 1 && f.tags[q.trait]);
    return { emoji: t.emoji, text: fits ? t.qc.replace('{adj}', locked.adj) : t.q, hint: '' };
  }

  function leadLine() {
    const prompt = state.prompt;
    const last = state.steps[state.steps.length - 1];
    const key = state.steps.length + (prompt.type === 'guess' ? prompt.food.id : prompt.question.id);
    if (!last) return pick(["Let's find your match.", 'Okay — what are we craving?', 'Let me read your mind…'], key);
    if (last.type === 'more') return pick(['Fresh arrows! Let’s keep going.', 'Okay, round two — let me dig deeper.'], key);
    if (last.type === 'guess') {
      return last.answer === 'close'
        ? pick(['Close! Let me adjust…', 'Ooh, warm. Getting warmer…'], key)
        : pick(['Hmm, not that. Back to it.', 'Okay, scratch that idea.'], key);
    }
    if (prompt.type === 'guess') return pick(["I think I've got it…", 'Ooh, I have a hunch…', 'Let me take a shot…'], key);

    const prev = engine.questionById[last.qid];
    if (prev.kind === 'cuisine' && prev.leaf) {
      const name = engine.cuisines[prev.node].name;
      const next = prompt.question;
      if (last.answer === 'yes') return `${name} it is! Let's narrow it down.`;
      if (last.answer === 'maybe' && next.kind === 'cuisine' && engine.regionOf(next.node) === engine.regionOf(prev.node)) {
        return `${name} is a maybe — let's stay in the neighborhood.`;
      }
      if (last.answer === 'no') return pick([`No ${name}, got it.`, `Okay, scratch ${name}.`, 'Fair enough.'], key);
    }
    return pick(REACTIONS[last.answer], key);
  }

  // ---------- screens ----------

  function renderStart() {
    return `
      <section class="screen start">
        ${mascot('idle', 'mascot-hero')}
        <p class="eyebrow">Your food matchmaker</p>
        <h1 class="title">Can't decide what to eat?</h1>
        <p class="lede">Answer a few questions with <b>Yes</b>, <b>Maybe</b>, or <b>No</b>.
          Cupid narrows it down — like Akinator, but for your stomach — then shows you restaurants nearby that serve it.</p>
        <button class="btn btn-primary btn-lg" data-action="start">Find my match</button>
        <p class="fine">Tip: press <kbd>Y</kbd> <kbd>M</kbd> <kbd>N</kbd> to answer, <kbd>←</kbd> to go back.</p>
        <ol class="how">
          <li><span>1</span>Share where you are</li>
          <li><span>2</span>Answer a few questions</li>
          <li><span>3</span>Pick from restaurants near you</li>
        </ol>
      </section>`;
  }

  function renderLocate() {
    const { busy, error, query, then } = state.locate;
    const disabled = busy ? 'disabled' : '';
    const skipLabel = then === 'game' ? 'Skip — just tell me what to eat' : 'Not now';
    return `
      <section class="screen locate">
        <div class="pin-badge emoji" aria-hidden="true">📍</div>
        <p class="eyebrow">${then === 'game' ? 'Before we start' : 'Restaurants near you'}</p>
        <h1 class="title" id="prompt-text" tabindex="-1">Where are you eating?</h1>
        <p class="lede">Share your location and Cupid will line up restaurants near you that serve whatever you end up craving.</p>
        <button class="btn btn-primary btn-lg" data-action="use-gps" ${disabled}>Share my location</button>
        <div class="or"><span>or</span></div>
        <form class="place-form" data-form="place">
          <label class="sr-only" for="place-input">City or ZIP code</label>
          <input id="place-input" name="query" type="text" placeholder="Type a city or ZIP code" value="${esc(query)}" autocomplete="off" required ${disabled}>
          <button class="btn btn-ghost" type="submit" ${disabled}>Use this</button>
        </form>
        <p class="locate-status${error ? ' is-error' : ''}" role="status">${esc(busy || error)}</p>
        <button class="link-btn" data-action="skip-location">${skipLabel}</button>
        <p class="locate-note">Your location is only used to search for restaurants. Cupid doesn't save it.</p>
      </section>`;
  }

  function renderPlay() {
    const prompt = state.prompt;
    const ctx = engine.context(state.steps);
    const isGuess = prompt.type === 'guess';
    const qNumber = ctx.qCount + 1;
    const sure = Math.round(prompt.confidence * 100);
    const sureText = sure < 5 ? 'Just warming up' : `${sure}% sure`;

    let body;
    let labels;
    if (isGuess) {
      const f = prompt.food;
      body = `
        <p class="guess-label">I think you're craving…</p>
        <div class="guess-emoji emoji">${f.emoji}</div>
        <h1 class="guess-name" id="prompt-text" tabindex="-1">${esc(f.name)}</h1>
        <p class="guess-meta">${esc(cuisineName(f))}</p>
        <p class="guess-desc">${esc(f.desc)}</p>`;
      labels = { yes: "Yes, that's it!", maybe: 'Close', no: 'Nope' };
    } else {
      const copy = questionCopy(prompt.question, ctx);
      body = `
        <div class="q-emoji emoji">${copy.emoji}</div>
        <h1 class="q-text" id="prompt-text" tabindex="-1">${esc(copy.text)}</h1>
        <p class="q-hint">${esc(copy.hint)}</p>`;
      labels = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
    }

    return `
      <section class="screen play">
        <div class="stage">
          <div class="card${isGuess ? ' card-guess' : ''}">
            <div class="card-top">
              <span class="qnum">${isGuess ? 'My guess' : `Question ${qNumber}`}</span>
              <span class="sure" title="How sure Cupid is about its top pick">
                <span class="meter"><i style="width:${Math.max(3, sure)}%"></i></span>${sureText}
              </span>
            </div>
            <div class="speaker">
              ${mascot(isGuess ? 'excited' : 'think')}
              <p class="lead">${esc(leadLine())}</p>
            </div>
            <div aria-live="polite">${body}</div>
            <div class="answers" role="group" aria-label="Your answer">
              <button class="ans ans-yes" data-answer="yes"><kbd>Y</kbd>${labels.yes}</button>
              <button class="ans ans-maybe" data-answer="maybe"><kbd>M</kbd>${labels.maybe}</button>
              <button class="ans ans-no" data-answer="no"><kbd>N</kbd>${labels.no}</button>
            </div>
            <div class="card-foot">
              <button class="link-btn" data-action="undo" ${state.history.length ? '' : 'disabled'}>← Back</button>
              <span class="keys-hint">${isGuess ? '<b>Close</b> = right idea, not quite the dish.' : 'Not sure? <b>Maybe</b> keeps things open.'}</span>
            </div>
          </div>
          ${renderTrail()}
        </div>
        ${renderPicks()}
      </section>`;
  }

  function renderTrail() {
    if (!state.steps.length) return '';
    const marks = { yes: '✓', maybe: '~', no: '✕' };
    const chips = state.steps.filter((s) => s.type !== 'more').map((s) => {
      let label;
      let answer = s.answer;
      if (s.type === 'guess') {
        label = engine.foodById[s.fid].shortName;
        answer = s.answer === 'close' ? 'maybe' : 'no';
      } else {
        const q = engine.questionById[s.qid];
        label = q.kind === 'cuisine' ? engine.cuisines[q.node].name : engine.traits[q.trait].label;
      }
      return `<li class="chip chip-${answer}" title="${esc(label)}: ${answer}"><span class="chip-mark" aria-hidden="true">${marks[answer]}</span><span class="chip-label">${esc(label)}</span><span class="sr-only">: ${answer}</span></li>`;
    });
    return `<div class="trail-wrap"><h2 class="trail-title">What you've told me</h2><ol class="trail">${chips.join('')}</ol></div>`;
  }

  function renderPicks() {
    const head = `
      <div class="picks-head">
        <h2>Cupid's picks</h2>
        <span class="picks-count">${state.steps.length ? `${engine.optionsLeft(state.steps)} in the running` : `${engine.foods.length} dishes`}</span>
      </div>`;
    if (!state.steps.length) {
      return `<aside class="picks" aria-label="Cupid's picks">${head}<p class="picks-empty">Your top matches will show up here as you answer.</p></aside>`;
    }
    const ranked = engine.ranking(state.steps).slice(0, 4);
    const top = ranked[0].p;
    const items = ranked.map((r) => `
      <li>
        <button class="pick" data-action="choose" data-id="${r.food.id}" title="Pick ${esc(r.food.name)}">
          <span class="pick-emoji emoji">${r.food.emoji}</span>
          <span class="pick-body">
            <span class="pick-name">${esc(r.food.name)}</span>
            <span class="pick-meta">${esc(cuisineName(r.food))}</span>
            <span class="pick-bar"><i style="width:${Math.max(4, Math.round((100 * r.p) / top))}%"></i></span>
          </span>
        </button>
      </li>`);
    return `
      <aside class="picks" aria-label="Cupid's picks">
        ${head}
        <ol class="pick-list">${items.join('')}</ol>
        <p class="picks-foot">Already see the one? Tap it.</p>
      </aside>`;
  }

  function dishChip(food) {
    return `
      <button class="dish-chip" data-action="choose" data-id="${food.id}">
        <span class="pick-emoji emoji">${food.emoji}</span>
        <span class="pick-body"><span class="pick-name">${esc(food.name)}</span><span class="pick-meta">${esc(cuisineName(food))}</span></span>
      </button>`;
  }

  function renderMatch() {
    const f = state.match;
    const others = engine.ranking(state.steps).filter((r) => r.food !== f).slice(0, 4).map((r) => r.food);
    const where = state.location ? state.location.label : 'you';
    const suggested = state.matchFrom === 'suggest';
    return `
      <section class="screen match">
        <div class="match-hero">
          <div class="match-photo" id="dish-photo"></div>
          <div class="match-info">
            <p class="eyebrow">${suggested ? `${mascot('excited', 'mascot-inline')}Can't decide? Try this` : `${mascot('love', 'mascot-inline')}It's a match`}</p>
            <h1 id="prompt-text" tabindex="-1">${esc(f.name)}</h1>
            <p class="match-cuisine">${esc(cuisineName(f))}</p>
            <p class="match-desc">${esc(f.desc)}</p>
            ${suggested ? `
            <div class="match-why">
              <p>Lots of maybes, so here’s my best pick from what you’ve told me. Not it? Keep going and I’ll work from there.</p>
              <button class="btn btn-ghost" data-action="back-to-game">Keep going →</button>
            </div>` : ''}
          </div>
        </div>
        <section class="places" aria-labelledby="places-title">
          <h2 id="places-title">${esc(f.shortName)} near ${esc(where)}</h2>
          <div id="places-body" aria-live="polite"></div>
        </section>
        ${others.length ? `<div class="runners"><h2>Not feeling it? Try one of these</h2><div class="dish-chips">${others.map(dishChip).join('')}</div></div>` : ''}
        <div class="end-actions">
          <button class="btn btn-ghost" data-action="back-to-game">← Not quite, keep guessing</button>
          <button class="btn btn-primary" data-action="restart">Play again</button>
        </div>
      </section>`;
  }

  function renderDishPhoto() {
    const box = document.getElementById('dish-photo');
    if (!box) return;
    const food = state.match;
    const photo = state.dishPhotos[food.id];
    box.innerHTML = `<span class="match-emoji emoji">${food.emoji}</span>${photo
      ? `<img src="${esc(photo.url)}" alt="${esc(food.shortName)}" onerror="this.remove()">
         <a class="photo-credit" href="${esc(photo.creditUrl)}" target="_blank" rel="noopener">Photo: Wikipedia</a>`
      : ''}`;
  }

  // The restaurant list on the match screen; redrawn on its own as results arrive.
  function renderPlaces() {
    const box = document.getElementById('places-body');
    if (!box) return;
    const food = state.match;
    const p = state.places;

    if (!state.location) {
      box.innerHTML = `
        <div class="places-message">
          <p>Tell Cupid where you are and it'll show you places nearby that serve ${esc(food.shortName)}.</p>
          <button class="btn btn-primary" data-action="change-location">Share my location</button>
        </div>`;
      return;
    }
    if (!p || p.foodId !== food.id || p.status === 'loading') {
      box.innerHTML = `
        <p class="places-status">${p && p.slow ? 'Still looking — the free map service can take up to a minute when it’s busy…' : `Finding ${esc(food.shortName)} spots near ${esc(state.location.label)}…`}</p>
        <ul class="place-list">${'<li class="place skeleton"><div class="place-photos"></div><div class="place-body"><i></i><i></i><i></i></div></li>'.repeat(3)}</ul>`;
      return;
    }
    if (p.status === 'error') {
      box.innerHTML = `
        <div class="places-message">
          <p>${esc(p.error)}</p>
          <button class="btn btn-primary" data-action="retry-places">Try again</button>
        </div>`;
      return;
    }
    if (!p.items.length) {
      box.innerHTML = `
        <div class="places-message">
          <p>Cupid couldn't find any ${esc(food.shortName)} spots near ${esc(state.location.label)}. Try one of the dishes below, or change your location.</p>
          <button class="btn btn-ghost" data-action="change-location">Change location</button>
        </div>`;
      return;
    }
    const more = p.next
      ? `<button class="btn btn-ghost places-more" data-action="more-places" ${p.loadingMore ? 'disabled' : ''}>${p.loadingMore ? 'Loading…' : 'Show me more places'}</button>`
      : '';
    const note = p.provider === 'google'
      ? 'Restaurant info and photos from Google Maps.'
      : 'Restaurant data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors. Photos show the dish, not each restaurant. Add a Google Places key to see real restaurant photos and ratings (see README).';
    box.innerHTML = `
      <ul class="place-list">${p.items.map((place) => placeCard(place, food)).join('')}</ul>
      ${p.moreError ? `<p class="places-status is-error">${esc(p.moreError)}</p>` : ''}
      ${more}
      <p class="places-note">${note}</p>`;
  }

  function placeCard(place, food) {
    const dish = state.dishPhotos[food.id];
    const photos = place.photos.length
      ? place.photos.map((ph, i) => `<img src="${esc(ph.url)}" alt="${i ? '' : esc(`Photo from ${place.name}`)}" loading="lazy" onerror="this.remove()">`).join('')
      : `<span class="emoji">${food.emoji}</span>${dish ? `<img src="${esc(dish.url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}`;
    const meta = [
      place.rating != null ? `<span class="rating">★ ${place.rating.toFixed(1)}${place.ratingCount ? ` <span class="muted">(${place.ratingCount.toLocaleString()})</span>` : ''}</span>` : '',
      place.price ? esc(place.price) : '',
      place.distanceKm != null ? formatDistance(place.distanceKm) : '',
      place.openNow === true ? '<span class="open">Open now</span>' : place.openNow === false ? '<span class="closed">Closed now</span>' : '',
    ].filter(Boolean).join('<span class="dot" aria-hidden="true">·</span>');
    const links = [
      `<a href="${esc(place.directionsUrl)}" target="_blank" rel="noopener">Directions</a>`,
      place.website ? `<a href="${esc(place.website)}" target="_blank" rel="noopener">Website</a>` : '',
      place.phone ? `<a href="tel:${esc(place.phone.replace(/[^\d+]/g, ''))}">Call</a>` : '',
    ].filter(Boolean).join('');
    const credit = place.photos[0] && place.photos[0].credit;
    return `
      <li class="place ${place.photos.length ? 'has-photos' : 'dish-photo'}">
        <div class="place-photos count-${place.photos.length || 1}">${photos}</div>
        <div class="place-body">
          <h3 class="place-name">${esc(place.name)}</h3>
          ${meta ? `<p class="place-meta">${meta}</p>` : ''}
          ${place.kind ? `<p class="place-kind">${esc(place.kind)}</p>` : ''}
          ${place.address ? `<p class="place-address">${esc(place.address)}</p>` : ''}
          ${place.hours ? `<p class="place-hours">${esc(place.hours)}</p>` : ''}
          <div class="place-links">${links}</div>
          ${credit ? `<p class="place-credit">Photo: ${place.photos[0].creditUrl ? `<a href="${esc(place.photos[0].creditUrl)}" target="_blank" rel="noopener">${esc(credit)}</a>` : esc(credit)}</p>` : ''}
        </div>
      </li>`;
  }

  function renderGiveup() {
    const shortlist = engine.ranking(state.steps).slice(0, 6).map((r) => r.food);
    return `
      <section class="screen match giveup">
        <div class="match-card">
          ${mascot('sad')}
          <p class="eyebrow">Out of arrows</p>
          <h1 id="prompt-text" tabindex="-1">You've stumped Cupid!</h1>
          <p class="match-desc">Here's my best shortlist from everything you told me. Pick one to see places near you, or keep going and I'll ask a few more questions.</p>
          <button class="btn btn-primary" data-action="keep-going">Keep going →</button>
        </div>
        <div class="runners"><div class="dish-chips">${shortlist.map(dishChip).join('')}</div></div>
        <div class="end-actions">
          <button class="btn btn-ghost" data-action="undo">← Back</button>
          <button class="btn btn-ghost" data-action="restart">Play again</button>
        </div>
      </section>`;
  }

  function renderChrome() {
    const inGame = state.screen !== 'start' && state.screen !== 'locate';
    restartButton.hidden = !inGame;
    locationChip.hidden = !inGame;
    locationChip.textContent = state.location ? `📍 ${state.location.label}` : '📍 Set location';
    locationChip.title = state.location ? 'Change your location' : 'Share your location to see restaurants';
  }

  function render() {
    const focusWasOnButton = document.activeElement && document.activeElement.matches('.ans, [data-action]');
    const screens = { start: renderStart, locate: renderLocate, play: renderPlay, match: renderMatch, giveup: renderGiveup };
    app.innerHTML = screens[state.screen]();
    renderChrome();
    if (state.screen === 'match') {
      renderDishPhoto();
      renderPlaces();
    }
    if (state.screen !== 'start' && focusWasOnButton) {
      const target = document.getElementById('prompt-text');
      if (target) target.focus({ preventScroll: true });
    }
  }

  // ---------- actions ----------

  function startGame() {
    state.steps = [];
    state.history = [];
    state.match = null;
    state.prompt = engine.nextPrompt([]);
    state.screen = 'play';
    render();
    window.scrollTo({ top: 0 });
  }

  function advance() {
    const next = engine.nextPrompt(state.steps);
    if (next.type === 'giveup') {
      state.prompt = next; // so Back can return here after "keep going"
      state.screen = 'giveup';
    } else {
      state.prompt = next;
      // After a run of Maybes, skip the guess card and go straight to places.
      if (next.indecisive) return showMatch(next.food, 'suggest');
      state.screen = 'play';
      if (next.type === 'guess') loadDishPhoto(next.food); // ready in case it's a yes
    }
    render();
  }

  function answer(value) {
    const prompt = state.prompt;
    if (prompt.type === 'guess' && value === 'yes') {
      showMatch(prompt.food, 'guess');
      return;
    }
    state.history.push(prompt);
    state.steps.push(
      prompt.type === 'guess'
        ? { type: 'guess', fid: prompt.food.id, answer: value === 'maybe' ? 'close' : 'no' }
        : { type: 'q', qid: prompt.question.id, answer: value },
    );
    advance();
  }

  function undo() {
    if (!state.history.length) return;
    state.prompt = state.history.pop();
    state.steps.pop();
    state.screen = state.prompt.type === 'giveup' ? 'giveup' : 'play';
    render();
  }

  // Past the guess limit: Cupid gets a fresh set of guesses and carries on
  // from everything said so far (dishes already turned down stay out).
  function keepGoing() {
    state.history.push(state.prompt);
    state.steps.push({ type: 'more' });
    advance();
  }

  function showMatch(food, from) {
    state.match = food;
    state.matchFrom = from;
    state.screen = 'match';
    loadDishPhoto(food);
    render();
    loadPlaces();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToGame() {
    // Opened from the give-up shortlist: keep going means another round.
    if (state.prompt.type === 'giveup') return keepGoing();
    state.screen = 'play';
    // Moving on from a guess or an early pick counts as "not that one".
    if (state.matchFrom === 'guess' || state.matchFrom === 'suggest') answer('no');
    else render();
  }

  function goHome() {
    state.screen = 'start';
    render();
  }

  // ---------- location ----------

  let locateAttempt = 0; // ignore answers that arrive after the user moved on

  function askForLocation(then) {
    state.locate = { busy: '', error: '', query: state.locate.query, then };
    state.screen = 'locate';
    render();
    window.scrollTo({ top: 0 });
  }

  function locateBusy(message) {
    state.locate.busy = message;
    state.locate.error = '';
    render();
    return ++locateAttempt;
  }

  function locateFailed(attempt, message) {
    if (attempt !== locateAttempt || state.screen !== 'locate') return;
    state.locate.busy = '';
    state.locate.error = message;
    render();
  }

  function useGps() {
    if (!navigator.geolocation) {
      locateFailed(locateAttempt, "This browser can't share your location. Type a city or ZIP code instead.");
      return;
    }
    const attempt = locateBusy('Waiting for your browser to share your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = 'you';
        try {
          label = (await api('/api/reverse', { lat, lng })).label || label;
        } catch {
          // the place name is only for display
        }
        if (attempt === locateAttempt && state.screen === 'locate') setLocation({ lat, lng, label });
      },
      (err) => locateFailed(attempt, err.code === err.PERMISSION_DENIED
        ? 'Location is blocked for this site. Type a city or ZIP code instead, or allow location in your browser’s site settings.'
        : "Couldn't pin down your location. Type a city or ZIP code instead."),
      { timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function searchLocation(query) {
    state.locate.query = query;
    const attempt = locateBusy('Looking that up…');
    try {
      const hit = await api('/api/geocode', { query });
      if (attempt === locateAttempt && state.screen === 'locate') setLocation(hit);
    } catch (err) {
      locateFailed(attempt, err.message);
    }
  }

  function setLocation({ lat, lng, label }) {
    state.location = { lat, lng, label };
    state.locate.busy = '';
    // Start gathering nearby restaurants now, while the user answers questions.
    api('/api/prepare', { lat, lng }).catch(() => {});
    leaveLocate();
  }

  function leaveLocate() {
    locateAttempt++;
    const then = state.locate.then;
    if (then === 'game') return startGame();
    state.screen = then;
    render();
    if (then === 'match') loadPlaces();
  }

  // ---------- restaurants ----------

  let placesRequest = 0;

  async function loadPlaces({ more = false } = {}) {
    const food = state.match;
    if (!food || !state.location) return;
    const id = ++placesRequest;
    const { lat, lng } = state.location;
    if (more) {
      Object.assign(state.places, { loadingMore: true, moreError: '' });
    } else {
      state.places = { foodId: food.id, status: 'loading', items: [], next: null, provider: null, error: '', slow: false };
    }
    renderPlaces();
    const slowTimer = setTimeout(() => {
      if (id === placesRequest && state.places.status === 'loading') {
        state.places.slow = true;
        renderPlaces();
      }
    }, 6000);
    try {
      const res = await api('/api/places', { food: food.id, lat, lng, page: more ? state.places.next : undefined });
      if (id !== placesRequest) return;
      const seen = new Set(state.places.items.map((p) => p.id));
      state.places.items = state.places.items.concat(res.places.filter((p) => !seen.has(p.id)));
      Object.assign(state.places, { status: 'ready', next: res.next, provider: res.provider });
    } catch (err) {
      if (id !== placesRequest) return;
      if (more) state.places.moreError = err.message;
      else Object.assign(state.places, { status: 'error', error: err.message });
    } finally {
      clearTimeout(slowTimer);
      if (id === placesRequest) {
        state.places.loadingMore = false;
        renderPlaces();
      }
    }
  }

  const photoRequests = new Set();

  function loadDishPhoto(food) {
    if (food.id in state.dishPhotos || photoRequests.has(food.id)) return;
    photoRequests.add(food.id);
    api('/api/dish-photo?food=' + encodeURIComponent(food.id))
      .then((res) => res.photo, () => null)
      .then((photo) => {
        state.dishPhotos[food.id] = photo;
        photoRequests.delete(food.id);
        if (photo) new Image().src = photo.url; // warm the cache
        if (state.screen === 'match' && state.match === food) {
          renderDishPhoto();
          renderPlaces();
        }
      });
  }

  // ---------- events ----------

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-answer], [data-action]');
    if (!el || el.disabled) return;
    if (el.dataset.answer) return answer(el.dataset.answer);
    const actions = {
      start: () => (state.location ? startGame() : askForLocation('game')),
      restart: startGame,
      home: goHome,
      undo,
      choose: () => showMatch(engine.foodById[el.dataset.id], 'pick'),
      'back-to-game': backToGame,
      'keep-going': keepGoing,
      'use-gps': useGps,
      'skip-location': leaveLocate,
      'change-location': () => askForLocation(state.screen === 'start' ? 'game' : state.screen),
      'retry-places': () => loadPlaces(),
      'more-places': () => loadPlaces({ more: true }),
    };
    if (actions[el.dataset.action]) {
      e.preventDefault();
      actions[el.dataset.action]();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'place') return;
    e.preventDefault();
    const query = new FormData(e.target).get('query').trim();
    if (query) searchLocation(query);
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (state.screen === 'play') {
      const answers = { y: 'yes', 1: 'yes', m: 'maybe', 2: 'maybe', n: 'no', 3: 'no' };
      if (answers[key]) {
        e.preventDefault();
        answer(answers[key]);
      } else if (key === 'arrowleft' || key === 'backspace') {
        e.preventDefault();
        undo();
      }
    } else if (state.screen === 'giveup' && (key === 'arrowleft' || key === 'backspace')) {
      e.preventDefault();
      undo();
    }
  });

  document.querySelector('.brand-mark').innerHTML = mascot('idle');
  render();
})();
