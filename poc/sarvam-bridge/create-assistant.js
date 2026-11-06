// Optional: saves the assistant in Vapi (needs the PRIVATE key). The /test page
// does not need this, it starts a transient assistant with the public key.
//
//   node create-assistant.js te        # auto | kn | te | ta | hi | en
require("dotenv").config();
const { buildAssistant } = require("./assistant");

const { VAPI_API_KEY, PUBLIC_URL, BRIDGE_TOKEN } = process.env;
if (!VAPI_API_KEY || !PUBLIC_URL || !BRIDGE_TOKEN) {
  console.error("Set VAPI_API_KEY, PUBLIC_URL and BRIDGE_TOKEN in .env");
  process.exit(1);
}

const body = buildAssistant({
  lang: process.argv[2] || "auto",
  publicUrl: PUBLIC_URL,
  token: BRIDGE_TOKEN,
  clinic: process.env.CLINIC_NAME,
});

(async () => {
  const res = await fetch("https://api.vapi.ai/assistant", {
    method: "POST",
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("Vapi error", res.status, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`Created assistant ${json.id} (${body.name})`);
})();
