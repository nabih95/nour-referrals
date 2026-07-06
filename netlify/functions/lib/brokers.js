// Shared broker-list source.
//
// The roster is COPIED FROM NEO once a day. NEO is already the Microsoft-synced
// source of truth for the agency's brokers, so instead of this system wiring up
// its own Microsoft/Graph credentials, it just reads NEO's roster endpoint:
//
//   GET  {NEO_ROSTER_URL}?key={ROSTER_TOKEN}   ->  { names: [...], count, updated_at }
//
// A scheduled function (sync-brokers) refreshes the cache from NEO every day on
// its own; get-brokers reads that cache (and lazily re-syncs if it's very stale).
//
// Requires these environment variables on Netlify:
//   NEO_ROSTER_URL   - e.g. https://epic-mirror-production.up.railway.app/api/roster
//   ROSTER_TOKEN     - the shared secret (must match NEO's ROSTER_TOKEN)
//
// If NEO is unreachable we fall back to the last cached list, and finally to the
// hardcoded roster below, so the forms never break.

const { getStore } = require("@netlify/blobs");

// Static fallback roster (last resort only - kept close to the real list).
const FALLBACK_BROKERS = [
  'Abed Achji', 'Amir Honarpour', 'Chuanjing Wang', 'Chunyuan Zheng',
  'Fadi Aljundi', 'Fanny Crevier', 'Feng Ma', 'Frederick Longchamp',
  'George Pegor Sanjian', 'Georges Abou Eyoun Eiso', 'Hugues-Dominic Pelletier',
  'Jack Alghazi', 'Jessy Tarzikhan', 'Jinping Zhao', 'Jose Emond',
  'Kalil Diaby', 'Karl Claude', 'Karl Perusse-Pigeon', 'Kyrillos Ibrahim',
  'Lin Li', 'Mirna Toukatli', 'Na Li', 'Nabih Abou Eyoun Elsouc',
  'Nadine Khalil', 'Nasri Nasra', 'Nicolas Zenie', 'Pascal Henault',
  'Rafik Metry', 'Todd Collard', 'Vasile Radu', 'Vikas Garg',
  'Xiaomei He', 'Zakia Slimani',
];

const CACHE_STORE = "broker-cache";
const CACHE_KEY = "broker-list";
// 25h so the once-a-day scheduled sync is what keeps it fresh; get-brokers only
// re-fetches on its own if a whole day passed with no successful sync.
const CACHE_TTL_MS = 25 * 60 * 60 * 1000;

// Pull the roster straight from NEO. Returns a sorted, de-duped name array, or
// null if the endpoint is not configured or fails.
async function fetchFromNeo() {
  const base = process.env.NEO_ROSTER_URL;
  const token = process.env.ROSTER_TOKEN;
  if (!base || !token) {
    console.warn("[brokers] NEO_ROSTER_URL / ROSTER_TOKEN not set - using fallback roster");
    return null;
  }

  const url = base + (base.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(token);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    console.error("[brokers] NEO roster request threw:", e);
    return null;
  }
  if (!res.ok) {
    console.error("[brokers] NEO roster failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  const raw = Array.isArray(json.names) ? json.names : null;
  if (!raw || !raw.length) return null;

  const unique = Array.from(new Set(raw.map((n) => String(n).trim()).filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

function openCache() {
  try {
    return getStore(CACHE_STORE);
  } catch (e) {
    return null;
  }
}

async function readCache(store, { allowStale = false } = {}) {
  if (!store) return null;
  try {
    const cached = await store.get(CACHE_KEY, { type: "json" });
    if (!cached || !Array.isArray(cached.names) || !cached.names.length) return null;
    if (allowStale) return cached.names;
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL_MS) return cached.names;
    return null;
  } catch (e) {
    return null;
  }
}

// Fetch NEO and write the cache. Returns the fresh names, or null on failure.
// This is what the daily scheduled function calls.
async function syncFromNeo() {
  const live = await fetchFromNeo();
  if (live && live.length) {
    const store = openCache();
    if (store) {
      try {
        await store.setJSON(CACHE_KEY, { names: live, ts: Date.now() });
      } catch (e) {
        /* caching is best-effort */
      }
    }
    return live;
  }
  return null;
}

// The roster the forms show. Fresh cache -> return it; otherwise sync from NEO;
// otherwise last-known (stale) cache; otherwise the hardcoded fallback.
// Set { force: true } to bypass the fresh-cache check and re-query NEO now.
async function getBrokers({ force = false } = {}) {
  const store = openCache();

  if (!force) {
    const fresh = await readCache(store, { allowStale: false });
    if (fresh) return fresh;
  }

  const live = await syncFromNeo();
  if (live && live.length) return live;

  const stale = await readCache(store, { allowStale: true });
  return stale || FALLBACK_BROKERS;
}

module.exports = { getBrokers, syncFromNeo, FALLBACK_BROKERS };
