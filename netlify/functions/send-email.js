const { Resend } = require("resend");
const { getStore, connectLambda } = require("@netlify/blobs");

const resend = new Resend(process.env.RESEND_API_KEY);

const TO_EMAIL = "george.a@nourassurance.ca";
const FROM_EMAIL = "Nour Referrals <referrals@nourassurance.ca>";

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildRow(label, value) {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:10px 14px;font-size:13px;color:#4a5568;font-weight:600;border-bottom:1px solid #f0ebe0;width:180px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px;font-size:13px;color:#0d1b2e;border-bottom:1px solid #f0ebe0;">${escapeHtml(value)}</td>
    </tr>`;
}

function buildBrokerEmail(data) {
  const rows = [
    buildRow("Submitted By", data["Submitted By"]),
    buildRow("First Name", data["First Name"]),
    buildRow("Last Name", data["Last Name"]),
    buildRow("Phone", data["Phone"]),
    buildRow("Email", data["Email"]),
    buildRow("Experience", data["Experience"]),
    buildRow("Current Company", data["Current Company"]),
    buildRow("Date", data["Date"]),
  ].join("");

  return {
    subject: `[Referral] New Broker — ${data["First Name"]} ${data["Last Name"]}`,
    html: wrapTemplate("New Broker Referral", "Broker Hiring", rows),
  };
}

function buildMortgageEmail(data) {
  const rows = [
    buildRow("Submitted By", data["Submitted By"]),
    buildRow("First Name", data["First Name"]),
    buildRow("Last Name", data["Last Name"]),
    buildRow("Phone", data["Phone"]),
    buildRow("Email", data["Email"]),
    buildRow("Employment", data["Employment"]),
    buildRow("Property Type", data["Property Type"]),
    buildRow("Property Price", data["Property Price"]),
    buildRow("Down Payment", data["Down Payment"]),
    buildRow("Mortgage Amount", data["Mortgage Amount"]),
    buildRow("Date", data["Date"]),
  ].join("");

  return {
    subject: `[Referral] New Mortgage — ${data["First Name"]} ${data["Last Name"]}`,
    html: wrapTemplate("New Mortgage Referral", data["Referral Type"], rows),
  };
}

function buildLifeEmail(data) {
  const rows = [
    buildRow("Submitted By", data["Submitted By"]),
    buildRow("First Name", data["First Name"]),
    buildRow("Last Name", data["Last Name"]),
    buildRow("Phone", data["Phone"]),
    buildRow("Email", data["Email"]),
    buildRow("Date of Birth", data["Date of Birth"]),
    buildRow("Smoker", data["Smoker"]),
    buildRow("Products", data["Products"]),
    buildRow("Date", data["Date"]),
  ].join("");

  return {
    subject: `[Referral] New Life Insurance — ${data["First Name"]} ${data["Last Name"]}`,
    html: wrapTemplate("New Life Insurance Referral", "Life Insurance", rows),
  };
}

function wrapTemplate(title, type, rows) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

        <!-- Gold accent bar -->
        <tr><td style="height:5px;background:linear-gradient(90deg,#c9a84c,#e8c97a);"></td></tr>

        <!-- Header -->
        <tr><td style="background:#0d1b2e;padding:28px 32px;">
          <h1 style="margin:0;font-size:20px;color:#ffffff;font-weight:700;">${escapeHtml(title)}</h1>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">Type: ${escapeHtml(type)}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0ebe0;border-radius:8px;overflow:hidden;">
            ${rows}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #f0ebe0;">
          <p style="margin:0;font-size:12px;color:#4a5568;">This referral was submitted via the Nour Assurance Referral Portal.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function saveReferral(data) {
  const store = getStore("referrals");
  const referralType = data["Referral Type"] || "";
  const broker = data["Submitted By"] || "Unknown";
  const timestamp = new Date().toISOString();
  const key = `${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

  let category = "broker";
  if (referralType.startsWith("Mortgage")) category = "mortgage";
  else if (referralType === "Life Insurance") category = "life";

  const record = {
    broker,
    category,
    referralType,
    firstName: data["First Name"] || "",
    lastName: data["Last Name"] || "",
    timestamp,
    data,
  };

  await store.setJSON(key, record);
  console.log("[Referral] Saved to blob store:", key);
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    connectLambda(event);
    const data = JSON.parse(event.body);
    const referralType = data["Referral Type"] || "";

    let email;
    if (referralType === "Broker Hiring") {
      email = buildBrokerEmail(data);
    } else if (referralType.startsWith("Mortgage")) {
      email = buildMortgageEmail(data);
    } else if (referralType === "Life Insurance") {
      email = buildLifeEmail(data);
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown referral type" }) };
    }

    // Save to Netlify Blobs and send email in parallel
    await Promise.all([
      saveReferral(data),
      resend.emails.send({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        replyTo: data["Email"] || TO_EMAIL,
        subject: email.subject,
        html: email.html,
      }),
    ]);

    console.log("[Referral]", referralType, data["First Name"], data["Last Name"], "→ saved & emailed");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("[Referral] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to process referral" }),
    };
  }
};
