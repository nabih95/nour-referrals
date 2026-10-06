// The broker-hiring referrals, in full, for NEO's Recruiting Engine (owner 2026-10-06:
// « about the broker referrals please get the info from this page »).
//
// The records live in the Netlify Blobs "referrals" store (written by send-email.js;
// category === "broker" when Referral Type === "Broker Hiring"). Unlike
// get-referrals.js (counts only, open), this returns the referred person's name and
// contact details, so it is SERVER-TO-SERVER ONLY:
//
//   GET with header "X-Roster-Token: <ROSTER_TOKEN>"  ->  { generated_at, referrals: [...] }
//
// ROSTER_TOKEN is the secret NEO and this site already share for the roster sync
// (lib/brokers.js). No token configured, or a wrong one: 403. No CORS: a browser
// page cannot read it.
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  const want = (process.env.ROSTER_TOKEN || "").trim();
  const got = ((event.headers && (event.headers["x-roster-token"] || event.headers["X-Roster-Token"])) || "").trim();
  if (!want || !sameSecret(got, want)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
  }

  try {
    connectLambda(event);
    const store = getStore("referrals");
    const { blobs } = await store.list();
    const referrals = [];
    for (const blob of blobs) {
      const record = await store.get(blob.key, { type: "json" });
      if (!record || record.category !== "broker") continue;
      const d = record.data || {};
      referrals.push({
        key: blob.key,
        timestamp: record.timestamp || "",
        submitted_by: record.broker || d["Submitted By"] || "",
        first_name: record.firstName || d["First Name"] || "",
        last_name: record.lastName || d["Last Name"] || "",
        phone: d["Phone"] || "",
        email: d["Email"] || "",
        experience: d["Experience"] || "",
        current_company: d["Current Company"] || "",
        address: d["Address"] || "",
        date: d["Date"] || "",
      });
    }
    referrals.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ generated_at: new Date().toISOString(), referrals }),
    };
  } catch (err) {
    console.error("[BrokerReferrals] Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to load broker referrals" }) };
  }
};
