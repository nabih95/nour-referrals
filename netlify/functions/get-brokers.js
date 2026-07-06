// Returns the current broker roster, sourced live from Microsoft 365.
// Consumed by the referral forms to populate the "Your Name" dropdown.
//
// GET /.netlify/functions/get-brokers          -> cached (up to 1h)
// GET /.netlify/functions/get-brokers?refresh=1 -> force a fresh Graph query

const { connectLambda } = require("@netlify/blobs");
const { getBrokers, FALLBACK_BROKERS } = require("./lib/brokers");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=300",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    connectLambda(event);
    const force = !!(event.queryStringParameters && event.queryStringParameters.refresh);
    const brokers = await getBrokers({ force });
    return { statusCode: 200, headers, body: JSON.stringify({ brokers }) };
  } catch (err) {
    console.error("[get-brokers] Error:", err);
    // Never break the forms: hand back the fallback roster.
    return { statusCode: 200, headers, body: JSON.stringify({ brokers: FALLBACK_BROKERS }) };
  }
};
