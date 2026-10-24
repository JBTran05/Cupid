// Cupid's local server: serves the app and a small API for finding restaurants.
// `npm start`, then open http://localhost:5050.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));
const { handleApi } = require('./server/api');

const PORT = Number(process.env.PORT) || 5050;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
// Only the app itself is public: never .env or the server code.
const PUBLIC = /^\/(index\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js)$/;

// Reads KEY=value lines from .env into process.env (real env vars win).
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!PUBLIC.test(pathname)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    fs.readFile(path.join(ROOT, pathname), (err, body) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(pathname)], 'Cache-Control': 'no-cache' });
      res.end(body);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Cupid is ready at http://localhost:${PORT}`);
    console.log(process.env.GOOGLE_PLACES_API_KEY
      ? 'Restaurants: Google Places (photos, ratings, open now)'
      : 'Restaurants: OpenStreetMap. Add GOOGLE_PLACES_API_KEY to .env for restaurant photos and ratings.');
  });
