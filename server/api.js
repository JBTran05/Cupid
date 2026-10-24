// The JSON API the app calls: location lookups, restaurants and photos.
// Requests that carry the user's location are POSTs, so it stays out of URLs and logs.
const data = require('../js/data.js');
const { createEngine } = require('../js/engine.js');
const { HttpError } = require('./lib');
const geo = require('./geo');
const restaurants = require('./restaurants');
const { dishPhoto } = require('./dish-photos');

const { foodById } = createEngine(data);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 10000) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function coords(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Missing or invalid location.');
  }
  return { lat, lng };
}

function food(id) {
  if (!Object.prototype.hasOwnProperty.call(foodById, id)) throw new HttpError(404, 'Unknown dish.');
  return foodById[id];
}

const routes = {
  'GET /api/status': () => ({ provider: restaurants.provider() }),
  'GET /api/dish-photo': async (req, url) => ({ photo: await dishPhoto(food(url.searchParams.get('food'))) }),
  'POST /api/geocode': async (req) => geo.geocode((await readJson(req)).query),
  'POST /api/reverse': async (req) => {
    const { lat, lng } = coords(await readJson(req));
    return geo.reverse(lat, lng);
  },
  'POST /api/prepare': async (req) => {
    const { lat, lng } = coords(await readJson(req));
    restaurants.prepare(lat, lng);
    return { ok: true };
  },
  'POST /api/places': async (req) => {
    const body = await readJson(req);
    const { lat, lng } = coords(body);
    return restaurants.findPlaces(food(body.food), lat, lng, body.page);
  },
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === 'GET /api/photo') {
      const target = await restaurants.googlePhotoUrl(url.searchParams.get('name') || '');
      res.writeHead(302, { Location: target, 'Cache-Control': 'private, max-age=1800' });
      return res.end();
    }
    if (!routes[route]) throw new HttpError(404, 'Not found.');
    send(res, 200, await routes[route](req, url));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.warn(`${route}: ${err.message}`);
    send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
  }
}

module.exports = { handleApi };
