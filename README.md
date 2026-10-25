# Cupid 💘

Akinator for food. Tell Cupid where you are, answer **Yes**, **Maybe**, or
**No**, and it figures out what you're craving, then lists restaurants near
you that serve it, with photos.

## Run it

```bash
npm start
```

Then open http://localhost:5050. (Node 18 or newer, no install step.)

Opening `index.html` directly still plays the guessing game, but restaurants
need the server.

## Restaurant photos and ratings (Google key)

Out of the box, restaurants come from **OpenStreetMap**: free, no sign-up, with
addresses, hours and distance. It has no ratings or restaurant photos, so each
card shows a photo of the dish instead. The free map servers can be slow, so
Cupid starts searching as soon as you share your location and the list is
usually ready by the time it guesses.

For each restaurant's **own photos, star ratings, prices and "open now"**, add
a Google Places key:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and turn on billing.
2. Enable **Places API (New)**.
3. Under **APIs & Services → Credentials**, create an API key. Restrict it to
   Places API (New).
4. Copy `.env.example` to `.env` and paste the key after
   `GOOGLE_PLACES_API_KEY=`.
5. Restart `npm start`. The console says `Restaurants: Google Places` when the
   key is picked up.

Google bills per request after a free monthly allowance. Each restaurant search
is one request, and each photo shown is one more (up to 3 per restaurant, only
loaded as you scroll). The key stays on your machine: the browser never sees it,
and `.env` is git-ignored and never served.

## How it works

- `js/data.js`: the knowledge base. A cuisine family tree (Asian → Southeast
  Asian → Thai), yes/no traits (noodles, spicy, cheesy, ...), and ~115 dishes
  tagged with both, plus each dish's Wikipedia photo and the OpenStreetMap
  cuisine tags used to find restaurants for it.
- `js/engine.js`: the guesser. Every dish has a weight; each answer multiplies
  the weights by how likely that answer is for that dish. Cupid asks the
  question that best splits what's left, asking about cuisines first. A
  **Maybe** on a cuisine spreads to its neighbours, so "maybe Thai" keeps
  Vietnamese and other Asian food in play. It guesses once it's 70% sure.
- `js/app.js`: the UI.
- `server.js` and `server/`: serves the app and a small API for location
  lookup (OpenStreetMap Nominatim), dish photos (Wikipedia) and restaurants
  (Google Places or OpenStreetMap).

Your location is only sent to these services to search. It's kept in memory
in the page and not stored, unless you tick **Remember this location on this
device**. Then it's saved in your browser only (never on the server), and you
can remove it with **Forget** on the start screen.

## Adding dishes

Copy a line in `js/data.js`, then check that Cupid can still tell everything
apart:

```bash
npm run simulate
```

It plays a game for every dish with simulated users and lists any dish that's
hard to find. A `~` after a tag means "sometimes" (e.g. `veg~`).

---

## Project history and notes for future sessions

This section records everything that has happened on the project so far, so a
new session (human or Claude) can pick it up without the original
conversation. Built on 2026-10-24 with Claude Code.

### What the owner asked for

1. **An Akinator for food places.** You want lunch but don't know what. Cupid
   asks questions, **cuisine first** ("Do you want Thai food?"), with three
   answers: **Yes / No / Maybe**.
   - **Yes** → narrow down within that cuisine (what kind of Thai?).
   - **Maybe** → treat it as "I'm fine with Asian food", and ask about related
     cuisines next (Vietnamese, Asian fusion...).
   - **No** → move on to other cuisines until things get narrower.
   - Show recommendations as it narrows down.
2. **"It guesses too quickly."** Guesses were happening at 40-50% confidence;
   the owner wanted guesses at around **70%** confidence instead.
3. **No more "go search Google Maps" at the end.** Ask for the user's location
   **before** the game (like a "share your location?" prompt), then show a
   **list of real restaurants** near them that serve the matched dish, with
   **pictures of the food**, and let them see more if they don't like one.
4. Asked whether to keep the per-restaurant **Directions** button (it opens
   Google Maps directions to that one place): owner said **keep it**.
5. **"It loses its train of thought after a wrong guess."** The owner had said
   no to American food, Cupid guessed Korean BBQ, they said no, and Cupid then
   asked about American food again. If the answers already point to a
   cuisine, Cupid shouldn't ask about another one, and it should never re-ask
   about a cuisine that was already answered.
6. **"Don't make it too clicky."** Someone who really doesn't know what they
   want and presses Maybe for everything would be clicking forever. When Cupid
   sees that, it should show a place based on the answers so far, then base
   the rest of the game on those.
7. **Remember the last location**, opt-in only, so returning users can skip
   the location step.

### Timeline of changes

**1. The guessing game (first version).**
- Static web app, no build step and no dependencies: `index.html`,
  `css/styles.css`, `js/data.js`, `js/engine.js`, `js/app.js`. Scripts are
  classic `<script>` tags (not ES modules) on purpose, so `index.html` can be
  opened straight from disk.
- Knowledge base of 115 dishes, 24 leaf cuisines in a family tree, 22 yes/no
  traits (see "Data model").
- Bayesian guessing engine with information-gain question choice, a
  cuisine-first phase, and "maybe spreads to neighbouring cuisines".
- UI: start screen, question card with Yes / Maybe / No, live "Cupid's picks"
  panel (top 4 dishes plus "N in the running"), answer trail chips, Back
  (undo), guesses with Yes / Close / Nope, a match screen, and a "you've
  stumped Cupid" screen. Heart-with-wings mascot (inline SVG) with moods.
  Light and dark mode, phone layout, keyboard shortcuts (Y/M/N or 1/2/3,
  ← or Backspace for Back).
- `scripts/simulate.js` (`npm run simulate`) plays a game for every dish with
  simulated users to check every dish can be found.
- Fixes made during play-testing: it no longer asks a pointless question when
  already very sure; "{cuisine} curry/noodles" wording is only used if that
  cuisine has such a dish; cuisines you already said no to are dropped from
  hints; "in the running" counts real contenders (≥10% as likely as the top
  pick) so it doesn't go up after a "no"; random opening question (it was
  almost always "Classic American"); sad mascot's eyebrows fixed.
- At this stage the match screen linked out to Google Maps / Yelp searches
  (removed in step 3).

**2. Guess at 70% instead of 40-50%.**
- `GUESS.confident` raised from 0.45 to **0.7**. Removed the "leading" rule
  that guessed at 25% when the top dish was 2.5× the runner-up. After a
  rejected guess Cupid asks 2 more questions unless it's already **≥85%** sure
  (`GUESS.certain`).
- Simulator results (115 dishes × 6 seeds × 2 user types):

  | | Before | After |
  |---|---|---|
  | Median confidence at a guess | 67-68% | 81% |
  | Guesses made under 70% | ~53% | ~3% |
  | Right on the first guess | ~91% | ~99% |
  | Average questions | 8.8 | 9.9 |

  The remaining ~3% under 70% are dishes that no question can separate (e.g.
  Gyro vs Shawarma), where Cupid guesses rather than asking forever. The 99% is
  with simulated users who answer perfectly consistently; real people will see
  more misses. Games with many "Maybe" answers run longer (a browser test with
  five Maybes took 10 questions).

**3. Location first, then a real restaurant list with food photos.**
- New **location step** after "Find my match": "Share my location" (browser
  permission prompt), or type a city/ZIP, or skip. A 📍 chip in the header
  shows/changes the location at any time. Location lives in page memory only
  (until step 6 added an opt-in to remember it).
- Added a **local Node server** (`server.js` + `server/`), because the
  restaurant APIs can't be called from the browser (CORS, API key secrecy,
  OpenStreetMap blocks browser user-agents).
- **Match screen redesigned:** big dish photo (from Wikipedia), then
  "*Dish* near *Place*" with restaurant cards (name, distance, rating/price/
  open-now when available, cuisine, address, hours, Directions / Website /
  Call), "Show me more places", and "Not feeling it? Try one of these" chips
  that switch the list to a runner-up dish. Google Maps / Yelp search buttons
  removed.
- Two restaurant sources:
  - **Google Places (New)** if `GOOGLE_PLACES_API_KEY` is set in `.env`: each
    restaurant's own photos (up to 3), rating, price, open now.
  - **OpenStreetMap** otherwise (the current default, no key needed): no
    ratings or restaurant photos, so cards show a small photo of the dish.
- Each dish got a `wiki` field (Wikipedia article for its photo) and many got
  an `osm` field (OpenStreetMap `cuisine=` values); each leaf cuisine got an
  `osm` field too.
- Ranking fixes from testing: Korean BBQ was returning American BBQ joints and
  ramen was returning pho shops, so dish tags were made dish-specific (no
  generic `barbecue`, `chicken`, `noodle`, `seafood`, `sandwich` where they
  pulled in the wrong cuisine). Chains are de-duplicated (nearest location
  only). Without photos of each restaurant, cards use a compact layout with a
  small dish thumbnail instead of repeating a big photo.

**4. Stay on track after a wrong guess** (2026-10-24, branch
`algorithm-followup-questions`).
- Cause: Cupid only avoided repeating the *exact* same question, and cuisine
  answers were soft weights (×0.03), so after a wrong guess another cuisine
  could climb back and get asked about. A "no" to classic American didn't
  touch Southern BBQ at all, so after "Nope, not Korean BBQ" (grilled, meaty,
  for a group) the next-best dish was Smoked BBQ and Cupid asked about
  Southern / American food.
- Cuisine answers are now firm: while any dish that fits them is left, only
  dishes in every cuisine you said yes to, and not wholly inside one you said
  no to, are considered (for questions, guesses, the picks panel and the "try
  one of these" chips). If all of those get turned down, the rest come back.
- Cuisine questions whose answer is already known are skipped: after a yes,
  only cuisines inside it; after a no, nothing inside it and not its wider
  group ("no classic American" → never "American food at all?").
- The cuisine phase ends for good at the first guess, and in the dish phase
  Cupid won't bring up a new part of the world while the regions you said
  yes/maybe to (plus the region of dishes it already guessed) still hold
  ≥25% of the probability (`TRACK_HOLD`).
- Checked with an extra scratch test (not in the repo) using less tidy
  simulated users who sometimes shrug or slip on dish questions, 9,200 games:

  | | Before | After |
  |---|---|---|
  | Games with a cuisine question already settled by earlier answers | 69.1% | 0% |
  | Guess that ignores a cuisine answer | 0.5% | 0% |
  | Jumps to a new region after a wrong guess | 2.2% | 0.6% |
  | "No to American", wrong Korean BBQ guess, then an American question | 2 of 100 | 0 of 84 |
  | Average questions | 11.6 | 11.2 |
  | Games with at least one wrong guess | 14.5% | 16.8% |

  The extra wrong guesses come from the firm cuisine answers: with other
  cuisines out, the top dish reaches 70% about a question sooner. Raising
  `GUESS.confident` to 0.75 brings it back to 15.0% at 11.5 questions; left
  at 0.7 because that's the owner's earlier choice.
- `npm run simulate` (perfectly consistent users): still 100% found, 99.1%
  right first try, 10.3 / 9.7 questions (decisive / flexible), median 86%
  sure at a guess.
- Browser replay: no to Vietnamese and classic American, maybe Chinese and
  Korean, grilled → guessed Korean BBQ at 71% → Nope → asked noodles,
  dumplings, Asian fusion, soup, Filipino (no American) → Sizzling Sisig.

**5. Don't make indecisive people click forever** (2026-10-24, same branch).
- Before: someone answering Maybe to everything clicked ~29 times and almost
  always ended on "You've stumped Cupid" without seeing a single restaurant.
- Now, after **3 Maybes in a row** (`GUESS.maybeRun`), at least one of them
  about the dish rather than the cuisine, Cupid stops asking and goes
  straight to the match screen for its best pick so far, headed "Can't
  decide? Try this" with a note explaining why, the restaurant list and the
  runner-up chips. "Not quite, keep guessing" carries on from the answers so
  far with that pick counted as a "no", so the next questions and picks build
  on everything said. Back from there shows the pick as a normal guess card.
- Why "one about the dish": with every Maybe counting, the flexible simulated
  user ("maybe Thai, maybe Vietnamese, maybe Filipino" = open to Southeast
  Asian, a real answer) dropped from 99.1% to 93.0% right first try. Requiring
  one dish Maybe keeps it at 98.8%. Counting cuisine Maybes as half, or only
  when they hop regions, kept 99.1% but showed places ~1 click later.
- Early picks count toward the 4-wrong-guesses limit, so a person who keeps
  saying Maybe gets ~4 picks with restaurants and then the shortlist, in about
  16-18 clicks.
- `npm run simulate` now has a third persona, **indecisive** (Maybe to 80% of
  questions; not counted in "Hardest foods"), and prints how many clicks
  before each persona sees restaurants:

  | Indecisive persona | Before | After |
  |---|---|---|
  | Clicks before seeing any restaurants | 27.3 | 6.4 |
  | Questions per game | 21.4 | 15.4 |
  | Ends on the exact dish they had in mind | 27.8% | 19.6% |

  The last row drops because early picks use up the guess limit; for someone
  that unsure, being shown places early matters more than the exact dish.
  Decisive persona unchanged; flexible 98.8% right first try (was 99.1%).
- Scratch test, players answering Maybe to everything / 80% / 50%: clicks
  before any place 28.8 → 4.6, 27.3 → 6.5, 22.8 → 11.8.
- Browser: Maybe ×6 (five cuisines, then noodles) → "Can't decide? Try this:
  Ramen" with Pad Thai, Pho, Chinese Takeout, Hand-Pulled Noodles as
  alternatives → keep guessing → Maybe ×3 (rice, spicy, soup) → Soft Tofu
  Stew. Checked Back, dark mode and 375 px width.
- Follow-ups from play-testing: the "Can't decide?" note said "keep going"
  but the only button was at the bottom of the page, so a **Keep going →**
  button now sits in the note. "You've stumped Cupid!" had only Back and
  Play again, so it got a **Keep going →** button that continues past the
  4-guess limit with 4 more guesses. Scratch check, 690 all-Maybe games
  pressing it up to 3 times: never gave up straight after, never re-offered
  a rejected dish, 14% reached their dish (vs ~3% without it). Browser:
  4 early picks passed → stumped screen → Keep going → question 15 ("round
  two"); Back → stumped screen; shortlist pick → keep guessing → continues.

**6. Remember the last location (opt-in)** (2026-10-25, branch
`lastlocation`, merged after the algorithm work).
- Owner asked for returning users to skip the location step, opt-in only.
- The location step has a **Remember this location on this device** checkbox,
  off by default. When it's ticked and a location is set, `{ lat, lng, label }`
  is saved in `localStorage` under `cupid.lastLocation`. Setting a location
  with it unticked deletes any saved one.
- On page load a saved location is restored and `/api/prepare` is called, so
  "Find my match" goes straight to the questions. The start screen then shows
  "📍 Restaurants near *Place*" with **Change** and **Forget**. The checkbox
  starts ticked when a location is already saved.
- Storage access is wrapped in try/catch: if the browser blocks it (private
  windows, strict settings), the location still works for that visit.

### Data model (`js/data.js`)

- `cuisines`: id → `{ name, parent, emoji, phrase?, adj?, osm? }`. Groups:
  Asian (East Asian, Southeast Asian, Indian, Asian fusion), Latin American,
  European, Mediterranean & Middle Eastern, American (Classic American,
  Southern & BBQ, Hawaiian), plus Ethiopian on its own. Foods belong to
  **leaf** cuisines only.
- `traits`: noodles, rice, soup, bread, handheld, fried, grilled, wok, spicy,
  seafood, meat, veg, raw, curry, dumplings, cheesy, cold, healthy, hearty,
  quick, cheap, group. Each has the question text `q`, optional
  cuisine-specific wording `qc` ("Are you feeling {adj} noodles?"), and
  optional `yesFloor` / `noFloor` / `weight` for "soft" questions like budget
  or sharing.
- `foods`: `{ id, name, emoji, cuisine, tags, desc, pop?, search?, wiki?,
  osm? }`. `cuisine` and `tags` are space-separated; `~` means
  "sometimes/partly" (value 0.5). `pop` is a popularity prior (1-1.5).
  `search` is the restaurant search text. `wiki` is the photo article. `osm`
  is dish-specific OpenStreetMap cuisine values.
- Photo substitutions where Wikipedia had no usable lead image: Potstickers →
  "Jiaozi", Chicken Adobo → "Filipino cuisine", Kimchi Fries → "Cheese fries".

### How the guessing engine works (`js/engine.js`)

- Every dish starts with weight = `pop`. A game is a list of steps
  (`{type:'q', qid, answer}` or `{type:'guess', fid, answer:'no'|'close'}`);
  the weights are recomputed from scratch, which is what makes Back/undo
  trivial.
- **Cuisine answers:** yes = 0.03 + 0.97·m, no = 0.03 + 0.97·(1−m), where m is
  1 if the dish is in that cuisine (0.5 for `~`). **Maybe** = best of
  (in this cuisine ×1, in its parent group ×0.9, in its region ×0.75), with a
  floor of 0.22 (0.4 for group questions). That's how "maybe Thai" keeps
  Vietnamese and Asian food alive and pushes everything else down.
- **Cuisine yes/no are also firm:** while any un-rejected dish fits them (in
  every cuisine answered yes, not wholly inside one answered no; a dish in two
  cuisines like pizza survives a no to one of them), every other dish's weight
  is set to 0. If none fit any more, the soft weights above take over again.
- **Trait answers:** yes = floor + (1−floor)·v, no = floor + (1−floor)·(1−v),
  maybe = 0.7 + 0.3·v. Default floors are 0.06.
- **Choosing the next question:** expected information gain (bits), using
  P(yes | dish) = L_yes / (L_yes + L_no), times a multiplier, times random
  jitter (±30% for cuisine questions in the cuisine phase, ±15% otherwise).
  - Cuisine questions that earlier answers settle are never asked: after a
    yes, only cuisines inside it; after a no, nothing inside it and not the
    group above it (`settled()`).
  - The **opening question** is a random cuisine from the 10 most informative,
    weighted by information gain.
  - **Cuisine phase** lasts until a cuisine gets a Yes, or one cuisine holds
    ≥55% of the probability, or "maybe" cuisines hold ≥60%, or 7 questions,
    or Cupid makes its first guess (it doesn't come back after a wrong one).
    During it: specific-cuisine questions ×1, with ×1.8 for siblings of a
    "maybe" cuisine and ×1.4 for the same region. Broad group questions ("Is
    Asian food on the table at all?") only after a cuisine got No/Maybe, at
    ×min(0.9, 0.25 + 0.15 × number of No's). Dish traits only after 3
    questions, at ×0.5.
  - **Dish phase:** traits ×their weight, specific cuisines ×0.6, groups ×0.3.
    Cuisines outside the "track" (regions answered yes/maybe, plus regions of
    rejected guesses) are skipped while the track holds ≥25% of the
    probability (`TRACK_HOLD`).
- **Guessing:** needs ≥3 questions; guesses when the top dish is **≥70%**
  likely, or when no question is worth ≥0.04 bits, or after 22 questions.
  After 3 Maybes in a row (one of them on a dish question) it makes an early
  pick however unsure it is, flagged `indecisive: true` on the prompt.
  Two questions between guesses unless the top dish is ≥85%. After 4 rejected
  guesses it gives up and shows a shortlist; **Keep going** there adds a
  `{type:'more'}` step, which gives 4 more guesses (the limit counts wrong
  guesses since the last `more`). Dishes already turned down stay out.
- **Guess answers:** Nope → that dish ×0.01. Close → that dish ×0.08 and every
  other dish × (0.25 + 0.75 × similarity), where similarity = 0.45 × cuisine
  closeness + 0.55 × weighted Jaccard overlap of tags.
- Tuning knobs: `GUESS`, `MAYBE_FALLOFF`, `CUISINE_FLOOR`, `TRAIT_FLOOR`,
  `TRACK_HOLD` at the top of `engine.js`; trait floors and weights in
  `data.js`.

### The app (`js/app.js`)

- Screens: `start` → `locate` → `play` → `match`, or `giveup`. All rendering
  is template strings into `#app`. The match screen's restaurant list and dish
  photo are filled separately (`renderPlaces`, `renderDishPhoto`) so they can
  update as data arrives.
- An `indecisive` prompt skips the guess card: `showMatch(food, 'suggest')`
  opens the match screen with the "Can't decide? Try this" heading and a
  **Keep going →** button right in the note at the top (the bottom "Not
  quite, keep guessing" button is below the fold, and below up to 8
  restaurant cards once a location is set). Either one records a "no" on
  that dish, as for a guess, and continues the game.
- The give-up screen's main button is **Keep going →** (`keepGoing()`: pushes
  the give-up prompt to history and a `more` step), so Back returns to the
  give-up screen. Picking a shortlist dish and then "Not quite, keep
  guessing" also keeps going. "Play again" there is now a plain button.
- Talks to the server with `api()`. Requests carrying the location are POSTs,
  so coordinates stay out of URLs and logs.
- When a location is set it calls `/api/prepare` so the server starts
  downloading nearby restaurants in the background **while the user is still
  answering questions**. It also prefetches the dish photo as soon as Cupid
  makes a guess.
- Distances are shown in miles for en-US/en-GB browsers, km otherwise.

### The server (`server.js`, `server/`)

- `npm start` → http://localhost:5050, bound to 127.0.0.1 only. It serves
  **only** `index.html`, `css/*.css` and `js/*.js` (whitelist), so `.env` and
  the server code can never be downloaded. Reads `.env` itself (no dotenv
  package).
- API (`server/api.js`):
  - `GET /api/status` → `{ provider: 'google' | 'osm' }`
  - `GET /api/dish-photo?food=<id>` → Wikipedia photo for a dish
  - `POST /api/geocode {query}` → `{ lat, lng, label }` (city/ZIP lookup)
  - `POST /api/reverse {lat, lng}` → `{ label }` (place name for the chip)
  - `POST /api/prepare {lat, lng}` → starts the background restaurant download
  - `POST /api/places {food, lat, lng, page}` → `{ provider, places, next }`
  - `GET /api/photo?name=places/…/photos/…` → redirects to the Google photo,
    so the API key never reaches the browser
- `server/restaurants.js`:
  - **Google:** Places API (New) Text Search with `textQuery` = the dish's
    `search`, biased to an 8 km circle, 8 per page, a field mask for name,
    address, location, rating, price, photos, opening hours, type, status,
    website and phone. Drops closed places and anything over 40 km away.
  - **OpenStreetMap (Overpass):** downloads every named restaurant / fast
    food / food court / cafe within **3 km** once per area (cached 30 min on a
    ~1 km grid), then scores each place for the dish: dish-specific
    `cuisine=` tag +3, the dish's cuisine +1.5, name contains the dish (e.g.
    "Pho 99") +2.5, minus 0.35 per km. Keeps only the nearest branch of a
    chain. If fewer than 3 match, it runs a second dish-only search out to
    **12 km**. 8 per page.
  - Overpass quirks found 2026-10-24: `overpass-api.de` **rejects browser-like
    user-agents (HTTP 406)**, so requests send `Cupid/0.1 (personal
    food-finder app)`. It was slow (about 25-40 s per query) and turned away
    big queries (502/504), hence the small 3 km radius and `[timeout:25]`. The
    fallback mirror is `maps.mail.ru`; `overpass.kumi.systems` and
    `overpass.private.coffee` timed out when tested.
  - Website links from map data are forced to http(s); phone links are
    digits-only.
- `server/geo.js`: OpenStreetMap Nominatim for city/ZIP lookup and reverse
  lookup, cached 24 h.
- `server/dish-photos.js`: Wikipedia `pageimages` API (900 px thumbnails),
  cached, with a credit link to the image's file page.

### Testing that was done

- `npm run simulate` after every engine/data change. Last run (after step 4):
  100% of dishes found, ~99% on the first guess, ~10 questions on average.
  Its users answer perfectly consistently, so Cupid almost never guesses
  wrong there and the after-a-wrong-guess path barely gets exercised; step 4
  was checked with a separate noisier test (see the timeline). Since step 5
  it also plays an indecisive persona and prints clicks before restaurants.
- Played in the browser (light and dark mode, desktop and 375 px phone width,
  no horizontal scrolling). Checked: the "maybe Thai → Vietnamese?" flow, Close
  on a guess, Back through guesses, "Not quite, keep guessing", give-up
  screen, location blocked, location granted (both simulated with a stubbed
  browser location so no real location was used), typed city, skipping the
  location then adding it from the match screen, Show more, switching to a
  runner-up dish.
- Restaurant search was tested with **Seattle, WA** as a public test location.
  Example results: pho → Pho Saigon, Phở Bắc Súp Shop; ramen → Ooink Ramen,
  Ramen Danbo; Korean BBQ → Meet Korean BBQ and Korean restaurants; Korean
  fried chicken → Kkokio Korean Fried Chicken. The first search per area took
  about 30 s; later dishes in the same area were instant.
- Server checks: `/.env`, `/server.js`, `/package.json` and path-traversal
  attempts return 404; bad dish ids and bad coordinates are rejected.

### Known limitations / not done yet

- **The Google Places path has never run against a real key.** It was written
  from Google's documented response format and checked with a sample response
  only. If something fails after adding a key, the error message from Google
  is shown in the app and logged by the server.
- No `.env` exists yet; the app currently runs in OpenStreetMap mode.
- OpenStreetMap mode: no ratings, prices, open-now or restaurant photos; data
  coverage varies by area; the public servers can be slow or busy (the app
  shows "Still looking…" after 6 s and an error with Try again if they fail).
- Some dishes can't be told apart by any question (Pad Thai vs Pad See Ew,
  Gyro vs Shawarma, Italian deli sandwich vs Deli sub), so Cupid sometimes
  needs a second guess there.
- No dessert / drinks category; meals only.
- Not deployed anywhere; runs locally. Deploying would need a host that can
  run the Node server (and the key set as an environment variable).

### Owner's decisions and preferences

- Answers are Yes / Maybe / No; the cuisine comes first; "Maybe" means "open to
  that part of the world".
- Guess only when about 70% sure or more.
- Respect cuisine answers: never re-ask about a cuisine already answered, and
  don't switch to another cuisine while the answers point to one, including
  after a wrong guess.
- Algorithm work goes on its own branch, merged only when the owner says so.
- Don't make people click forever: a run of Maybes gets them a place to eat
  right away, and the game continues from their answers if they want more.
- Restaurants are shown inside the app (no "search Google Maps" step), with
  food photos, after asking for location up front.
- Remembering the location is opt-in (off by default) and stays in the
  browser; Forget removes it.
- Keep the per-restaurant **Directions** button.
- The GitHub repo is named `cupid`.

### Ideas for later

- Set up the Google Places key and verify the Google path end to end.
- Show the dish photo on the guess card too (it's already prefetched).
- Desserts, drinks, breakfast as categories.
