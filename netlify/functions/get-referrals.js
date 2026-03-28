const { getStore, connectLambda } = require("@netlify/blobs");

// The same broker list from the dashboard
const BROKERS = [
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

    // Build broker stats
    const stats = {};
    BROKERS.forEach((name) => {
      stats[name] = { broker: name, broker_refs: 0, mortgage_refs: 0, life_refs: 0, last: "—" };
    });

    for (const blob of blobs) {
      const record = await store.get(blob.key, { type: "json" });
      if (!record) continue;

      const brokerName = record.broker;
      if (!stats[brokerName]) {
        stats[brokerName] = { broker: brokerName, broker_refs: 0, mortgage_refs: 0, life_refs: 0, last: "—" };
      }

      if (record.category === "broker") stats[brokerName].broker_refs++;
      else if (record.category === "mortgage") stats[brokerName].mortgage_refs++;
      else if (record.category === "life") stats[brokerName].life_refs++;

      // Track latest submission date
      const date = record.timestamp ? record.timestamp.split("T")[0] : "—";
      if (stats[brokerName].last === "—" || date > stats[brokerName].last) {
        stats[brokerName].last = date;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(Object.values(stats)),
    };
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to load referrals" }),
    };
  }
};
