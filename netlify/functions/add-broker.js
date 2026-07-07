// Admin endpoint to manage the hand-added brokers that appear in the referral
// forms' "Submitted By" dropdown (on top of the roster synced from NEO).
//
//   GET                         -> { manual: [...], brokers: [...], authRequired }
//   POST { name }               -> add a broker            (action defaults to "add")
//   POST { name, action:"remove" } -> remove a hand-added broker
//
// Access: OPEN by default (matches the dashboard, which has no login). If an
// ADMIN_TOKEN env var is set on Netlify, writes AND reads require it via the
// "X-Admin-Token" header — the dashboard prompts for it once and remembers it.
// This keeps zero-config the easy path while allowing a lock-down later.

const { connectLambda } = require("@netlify/blobs");
const {
  getBrokers,
  listManualBrokers,
  addManualBroker,
  removeManualBroker,
} = require("./lib/brokers");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  const required = (process.env.ADMIN_TOKEN || "").trim();
  if (required) {
    const provided = ((event.headers &&
      (event.headers["x-admin-token"] || event.headers["X-Admin-Token"])) || "").trim();
    if (provided !== required) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized. Enter the admin token." }),
      };
    }
  }

  try {
    connectLambda(event);

    if (event.httpMethod === "GET") {
      const [manual, brokers] = await Promise.all([
        listManualBrokers(),
        getBrokers(),
      ]);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ manual, brokers, authRequired: !!required }),
      };
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request." }) };
      }
      const action = String(body.action || "add").toLowerCase();
      const manual =
        action === "remove"
          ? await removeManualBroker(body.name)
          : await addManualBroker(body.name);
      const brokers = await getBrokers();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, action, manual, brokers }),
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed." }) };
  } catch (err) {
    console.error("[add-broker] Error:", err);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: err.message || "Something went wrong." }),
    };
  }
};
