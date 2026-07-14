// Per-broker, per-month LIFE-insurance referral counts.
//
// The referral records live in the Netlify Blobs "referrals" store (written by
// send-email.js, category === "life" when Referral Type === "Life Insurance").
// get-referrals.js returns lifetime totals; this returns the monthly breakdown
// NEO's Weekly Sales Performance scorecard needs. Counts only — no lead PII.
const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    connectLambda(event);
    const store = getStore("referrals");
    const { blobs } = await store.list();

    // broker name -> { "YYYY-MM": count }
    const byBroker = {};
    for (const blob of blobs) {
      const record = await store.get(blob.key, { type: "json" });
      if (!record || record.category !== "life") continue;

      const broker = record.broker || "Unknown";
      const ts = record.timestamp || "";
      const month = /^\d{4}-\d{2}/.test(ts) ? ts.slice(0, 7) : "unknown";

      if (!byBroker[broker]) byBroker[broker] = {};
      byBroker[broker][month] = (byBroker[broker][month] || 0) + 1;
    }

    const brokers = Object.keys(byBroker)
      .map((broker) => {
        const months = byBroker[broker];
        const total = Object.values(months).reduce((a, b) => a + b, 0);
        return { broker, total, months };
      })
      .sort((a, b) => b.total - a.total);

    return {
      statusCode: 200,
      headers: { ...headers, "Cache-Control": "public, max-age=300" },
      body: JSON.stringify({ generated_at: new Date().toISOString(), brokers }),
    };
  } catch (err) {
    console.error("[LifeMonthly] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to load life referrals" }),
    };
  }
};
