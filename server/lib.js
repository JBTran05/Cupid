// Small helpers shared by the server modules.

// Public map services ask apps to identify themselves.
const USER_AGENT = 'Cupid/0.1 (personal food-finder app)';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url, { timeout = 15000, headers = {}, ...options } = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null; handled below
  }
  if (!res.ok || json === null) {
    const detail = (json && json.error && (json.error.message || json.error)) || `HTTP ${res.status}`;
    throw new HttpError(502, `${new URL(url).host}: ${detail}`);
  }
  return json;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Remembers results for a while so repeat lookups don't hit the network.
function memo(ttlMs, maxEntries = 200) {
  const store = new Map();
  return (key, compute) => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = compute();
    store.set(key, { at: Date.now(), value });
    if (value && typeof value.catch === 'function') value.catch(() => store.delete(key));
    if (store.size > maxEntries) store.delete(store.keys().next().value);
    return value;
  };
}

module.exports = { USER_AGENT, HttpError, fetchJson, distanceKm, memo };
