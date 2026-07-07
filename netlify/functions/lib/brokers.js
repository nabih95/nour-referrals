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
// Brokers added by hand from the dashboard live under their OWN key in the same
// store, so the daily NEO sync (which only rewrites CACHE_KEY) never wipes them.
// getBrokers() unions them on top of the synced roster.
const MANUAL_KEY = "manual-brokers";
const MAX_NAME_LEN = 80;
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

// Case-insensitive union of any number of name lists, trimmed and sorted.
function mergeNames(...lists) {
  const seen = new Map(); // lowercased key -> first-seen display form
  for (const list of lists) {
    for (const raw of list || []) {
      const name = String(raw).trim().replace(/\s+/g, " ");
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

// The brokers an admin added by hand (raw, unsorted-safe).
async function readManual(store) {
  if (!store) return [];
  try {
    const rec = await store.get(MANUAL_KEY, { type: "json" });
    if (!rec || !Array.isArray(rec.names)) return [];
    return rec.names.map((n) => String(n).trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function listManualBrokers() {
  return mergeNames(await readManual(openCache()));
}

// Add a hand-entered broker. Returns the updated (sorted) manual list.
async function addManualBroker(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("A name is required.");
  if (clean.length > MAX_NAME_LEN) throw new Error("That name is too long.");
  const store = openCache();
  const current = await readManual(store);
  const updated = mergeNames(current, [clean]);
  if (store) {
    try {
      await store.setJSON(MANUAL_KEY, { names: updated, ts: Date.now() });
    } catch (e) {
      throw new Error("Could not save the broker. Try again.");
    }
  }
  return updated;
}

// Remove a hand-entered broker (only affects the manual list, never the synced
// roster). Returns the updated (sorted) manual list.
async function removeManualBroker(name) {
  const target = String(name || "").trim().toLowerCase();
  const store = openCache();
  const current = await readManual(store);
  const updated = mergeNames(current.filter((n) => n.toLowerCase() !== target));
  if (store) {
    try {
      await store.setJSON(MANUAL_KEY, { names: updated, ts: Date.now() });
    } catch (e) {
      throw new Error("Could not update the list. Try again.");
    }
  }
  return updated;
}

// The roster the forms show: the synced roster (fresh cache -> NEO sync -> stale
// cache -> hardcoded fallback) UNION the hand-added brokers, so a manual entry
// shows up immediately and survives the daily sync.
// Set { force: true } to bypass the fresh-cache check and re-query NEO now.
async function getBrokers({ force = false } = {}) {
  const store = openCache();
  const manual = await readManual(store);

  let base = null;
  if (!force) base = await readCache(store, { allowStale: false });
  if (!base) {
    const live = await syncFromNeo();
    if (live && live.length) base = live;
  }
  if (!base) base = await readCache(store, { allowStale: true });
  if (!base) base = FALLBACK_BROKERS;

  return mergeNames(base, manual);
}

module.exports = {
  getBrokers,
  syncFromNeo,
  listManualBrokers,
  addManualBroker,
  removeManualBroker,
  FALLBACK_BROKERS,
};
