// Finds restaurants near the user that serve a given dish.
//
// With GOOGLE_PLACES_API_KEY set (see README), results come from Google Places:
// ratings, prices, open-now and each restaurant's own photos.
//
// Without a key, results come from OpenStreetMap. It's free but has no photos
// or ratings, and its public servers can take 30+ seconds when busy. So the app
// calls prepare() as soon as it knows the location, and we fetch every food
// place nearby in the background while the user is still answering questions.
const data = require('../js/data.js');
const { createEngine } = require('../js/engine.js');
const { HttpError, fetchJson, distanceKm, memo } = require('./lib');

const { cuisines } = createEngine(data);
const PAGE_SIZE = 8;

function provider() {
  return process.env.GOOGLE_PLACES_API_KEY ? 'google' : 'osm';
}

async function findPlaces(food, lat, lng, page) {
  if (provider() === 'google') {
    return { provider: 'google', ...(await searchGoogle(food, lat, lng, page || null)) };
  }
  const all = await osmMatches(food, lat, lng);
  const offset = Math.max(0, parseInt(page, 10) || 0);
  return {
    provider: 'osm',
    places: all.slice(offset, offset + PAGE_SIZE),
    next: offset + PAGE_SIZE < all.length ? String(offset + PAGE_SIZE) : null,
  };
}

function prepare(lat, lng) {
  if (provider() === 'osm') nearbyFoodPlaces(lat, lng).catch(() => {});
}

// ---------- Google Places ----------

const GOOGLE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.shortFormattedAddress',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.photos',
  'places.currentOpeningHours',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'nextPageToken',
].join(',');

const PRICE = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function searchGoogle(food, lat, lng, pageToken) {
  // Google requires the same query on every page, plus the token.
  const body = {
    textQuery: food.search,
    pageSize: PAGE_SIZE,
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 8000 } },
  };
  if (pageToken) body.pageToken = pageToken;
  const json = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': GOOGLE_FIELDS,
    },
    body: JSON.stringify(body),
  });
  const places = (json.places || [])
    .filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL')
    .map((p) => fromGoogle(p, lat, lng))
    .filter((p) => p.distanceKm == null || p.distanceKm <= 40);
  return { places, next: json.nextPageToken || null };
}

function fromGoogle(p, lat, lng) {
  const name = (p.displayName && p.displayName.text) || 'Restaurant';
  const where = p.location || {};
  const hours = p.currentOpeningHours || {};
  return {
    id: p.id,
    name,
    address: p.shortFormattedAddress || p.formattedAddress || null,
    kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    distanceKm: where.latitude != null ? distanceKm(lat, lng, where.latitude, where.longitude) : null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: p.userRatingCount || null,
    price: PRICE[p.priceLevel] || null,
    openNow: typeof hours.openNow === 'boolean' ? hours.openNow : null,
    hours: null,
    website: p.websiteUri || null,
    phone: p.nationalPhoneNumber || null,
    photos: (p.photos || []).slice(0, 3).map((photo) => {
      const author = (photo.authorAttributions || [])[0] || {};
      return {
        url: '/api/photo?name=' + encodeURIComponent(photo.name),
        credit: author.displayName || null,
        creditUrl: author.uri || null,
      };
    }),
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name)}&destination_place_id=${encodeURIComponent(p.id)}`,
  };
}

// The browser loads photos through us so the API key never reaches it.
const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;
const photoUris = memo(30 * 60 * 1000, 1000);

function googlePhotoUrl(name) {
  if (provider() !== 'google') throw new HttpError(404, 'Restaurant photos need a Google Places key.');
  if (!PHOTO_NAME.test(name)) throw new HttpError(400, 'Bad photo name.');
  return photoUris(name, async () => {
    const params = new URLSearchParams({ maxWidthPx: '640', skipHttpRedirect: 'true', key: process.env.GOOGLE_PLACES_API_KEY });
    const json = await fetchJson(`https://places.googleapis.com/v1/${name}/media?${params}`);
    if (!json.photoUri) throw new HttpError(502, 'Google sent no photo.');
    return json.photoUri;
  });
}

// ---------- OpenStreetMap ----------

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const FOOD_PLACE = '["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"]';
// Busy servers turn away big or long-running queries, so keep both modest.
const NEARBY_RADIUS_M = 3000;
const WIDE_RADIUS_M = 12000;
const QUERY = '[out:json][timeout:25];';

async function overpass(query) {
  for (const url of OVERPASS) {
    try {
      const json = await fetchJson(url, { method: 'POST', body: new URLSearchParams({ data: QUERY + query }), timeout: 60000 });
      return json.elements || [];
    } catch (err) {
      console.warn(`OpenStreetMap search via ${new URL(url).host} failed: ${err.message}`);
    }
  }
  throw new HttpError(503, 'The free restaurant map is busy right now. Try again in a minute.');
}

// Every food place within a few km, fetched once per area and filtered per dish.
const nearbyCache = memo(30 * 60 * 1000, 30);
function nearbyFoodPlaces(lat, lng) {
  return nearbyCache(`${lat.toFixed(2)},${lng.toFixed(2)}`, () =>
    overpass(`nwr${FOOD_PLACE}(around:${NEARBY_RADIUS_M},${lat},${lng});out center tags;`));
}

const matchCache = memo(15 * 60 * 1000, 100);
function osmMatches(food, lat, lng) {
  return matchCache(`${food.id}@${lat.toFixed(3)},${lng.toFixed(3)}`, async () => {
    const score = scorer(food);
    let found = rank(await nearbyFoodPlaces(lat, lng), score, lat, lng);
    if (found.length < 3) {
      // Slim pickings close by: look farther, for this dish only.
      const wide = rank(await overpass(widerQuery(food, lat, lng)), score, lat, lng);
      const seen = new Set(found.map((p) => p.id));
      found = found.concat(wide.filter((p) => !seen.has(p.id)));
    }
    return found;
  });
}

function rank(elements, score, lat, lng) {
  const names = new Set();
  return elements
    .map((el) => {
      const s = score(el.tags || {});
      if (s <= 0) return null;
      const place = fromOsm(el, lat, lng);
      return place && { place, rank: s - 0.35 * place.distanceKm };
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank)
    .map((r) => r.place)
    .filter((place) => {
      // One location per chain: the nearest, which ranks first.
      const name = normalize(place.name);
      if (names.has(name)) return false;
      names.add(name);
      return true;
    });
}

function cuisineRegex(values) {
  return new RegExp(`(^|;)\\s*(${values})\\s*(;|$)`, 'i');
}

function leafOsmValues(food) {
  return Object.entries(food.cz)
    .filter(([, weight]) => weight === 1)
    .map(([leaf]) => cuisines[leaf] && cuisines[leaf].osm)
    .filter(Boolean);
}

// " Bánh Mì #2 " -> " banh mi 2 "
function normalize(text) {
  return ` ${String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

const GENERIC_WORDS = new Set(['restaurant', 'restaurants', 'shop', 'food', 'near', 'me']);
function nameKeywords(food) {
  const out = new Set();
  [food.search, food.shortName].forEach((phrase) => {
    const words = normalize(phrase).trim().split(' ').filter((w) => w && !GENERIC_WORDS.has(w));
    const joined = words.join(' ');
    if (joined.length >= 3) out.add(joined);
    if (joined.length > 4 && joined.endsWith('s')) out.add(joined.slice(0, -1)); // tacos -> taco
  });
  return [...out];
}

// How well a place fits the dish: its exact style beats the general cuisine
// (a Korean place tagged korean_barbecue gets both), and a name like
// "Pho 99" counts too.
function scorer(food) {
  const specific = food.osm ? cuisineRegex(food.osm) : null;
  const leaves = leafOsmValues(food);
  const general = leaves.length ? cuisineRegex(leaves.join('|')) : null;
  const keywords = nameKeywords(food).map((k) => ` ${k} `);
  return (tags) => {
    const cuisine = tags.cuisine || '';
    let s = 0;
    if (specific && specific.test(cuisine)) s += 3;
    if (general && general.test(cuisine)) s += 1.5;
    const name = normalize(tags.name);
    if (keywords.some((k) => name.includes(k))) s += 2.5;
    return s;
  };
}

function widerQuery(food, lat, lng) {
  const around = `(around:${WIDE_RADIUS_M},${lat},${lng})`;
  const styles = [food.osm, ...leafOsmValues(food)].filter(Boolean).join('|');
  const keywords = nameKeywords(food).join('|');
  const parts = [];
  if (styles) parts.push(`nwr${FOOD_PLACE}["cuisine"~"${styles}",i]${around};`);
  if (keywords) parts.push(`nwr${FOOD_PLACE}["name"~"${keywords}",i]${around};`);
  return `(${parts.join('')});out center tags;`;
}

const prettify = (value) => value.trim().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function fromOsm(el, lat, lng) {
  const t = el.tags || {};
  const placeLat = el.lat != null ? el.lat : el.center && el.center.lat;
  const placeLng = el.lon != null ? el.lon : el.center && el.center.lon;
  if (placeLat == null || !t.name) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const website = t.website || t['contact:website'] || null;
  return {
    id: `osm:${el.type}/${el.id}`,
    name: t.name,
    address: [street, t['addr:city']].filter(Boolean).join(', ') || null,
    kind: t.cuisine ? t.cuisine.split(';').slice(0, 3).map(prettify).join(', ') : null,
    distanceKm: distanceKm(lat, lng, placeLat, placeLng),
    rating: null,
    ratingCount: null,
    price: null,
    openNow: null,
    hours: t.opening_hours || null,
    // Only ever link out over http(s), whatever the map data says.
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    phone: t.phone || t['contact:phone'] || null,
    photos: [],
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${placeLat},${placeLng}`,
  };
}

module.exports = { provider, findPlaces, prepare, googlePhotoUrl, nameKeywords, scorer, fromGoogle };
