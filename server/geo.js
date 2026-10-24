// Turns a typed city/ZIP into coordinates, and coordinates into a short place
// name, using OpenStreetMap's free Nominatim service.
const { HttpError, fetchJson, memo } = require('./lib');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const cached = memo(24 * 60 * 60 * 1000);

function shortName(address = {}, fallback = '') {
  return address.city || address.town || address.village || address.suburb || address.hamlet || address.county || fallback;
}

function geocode(query) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) throw new HttpError(400, 'Type a city or ZIP code.');
  return cached('search:' + q.toLowerCase(), async () => {
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '1', addressdetails: '1' });
    const [hit] = await fetchJson(`${NOMINATIM}/search?${params}`);
    if (!hit) throw new HttpError(404, `Couldn't find "${q}". Try a city name or ZIP code.`);
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: shortName(hit.address, hit.display_name.split(',')[0]) };
  });
}

function reverse(lat, lng) {
  // Round to ~1 km so nearby lookups share a cache entry.
  return cached(`reverse:${lat.toFixed(2)},${lng.toFixed(2)}`, async () => {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '12' });
    const hit = await fetchJson(`${NOMINATIM}/reverse?${params}`);
    return { label: shortName(hit.address, 'you') };
  });
}

module.exports = { geocode, reverse };
