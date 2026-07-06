// Daily autonomous roster sync.
//
// Runs once a day on Netlify's schedule (see netlify.toml), copies the broker
// list from NEO, and writes it to the shared cache the forms read. No trigger,
// no human: the referral roster stays in step with NEO on its own.
//
// Falls back safely — if NEO is unreachable this leaves the last good cache in
// place, and get-brokers still serves that (or the hardcoded roster).

const { connectLambda } = require("@netlify/blobs");
const { syncFromNeo } = require("./lib/brokers");

exports.handler = async (event) => {
  // Give Netlify Blobs its lambda context (best-effort; newer runtimes auto-wire it).
  try {
    connectLambda(event);
  } catch (e) {
    /* blobs may already be configured from the environment */
  }

  try {
    const names = await syncFromNeo();
    const count = names ? names.length : 0;
    if (count) {
      console.log(`[sync-brokers] refreshed ${count} brokers from NEO`);
    } else {
      console.warn("[sync-brokers] NEO returned nothing - kept previous roster");
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, count }) };
  } catch (err) {
    console.error("[sync-brokers] failed:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
