# Cupid

Akinator-style food finder: Yes/Maybe/No questions → a dish → nearby restaurants.

Read `README.md` first, especially **"Project history and notes for future
sessions"**: it records what the owner asked for, every change so far, how the
engine and server work, what was tested, and what's still unverified.

- Run: `npm start` → http://localhost:5050 (Node 18+, no dependencies, no build step).
- After changing `js/data.js` or `js/engine.js`, run `npm run simulate` and
  check every dish is still found.
- Browser scripts are classic `<script>` tags, not ES modules, so `index.html`
  also opens straight from disk. Keep it that way.
- Never commit `.env` (it holds `GOOGLE_PLACES_API_KEY`). The server only
  serves `index.html`, `css/*.css` and `js/*.js`; keep that whitelist when
  adding files the browser needs.
