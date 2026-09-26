// Shared request authentication for everything Vapi calls on our backend
// (tool endpoints + the vapi-events webhook).
//
// Accepted, in order:
//   1. `x-vapi-secret` header — what Vapi actually sends when `server.secret`
//      is set on the assistant/tool (phone calls via assistant-request).
//   2. `x-vapi-signature` HMAC-SHA256 of the body — legacy scheme, kept so
//      nothing that relied on it breaks.
//   3. `x-orvia-demo-token` — a short-lived token minted by the
//      demo-call-token function for browser test calls. Browser configs can't
//      carry the real secret (it would ship to every visitor), so the browser
//      gets a token scoped to one business that expires in 30 minutes.
//
// If VAPI_WEBHOOK_SECRET isn't set at all, everything is accepted (local dev).

const encoder = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const DEMO_TOKEN_TTL_SECS = 30 * 60;

export async function mintDemoToken(secret: string, businessId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DEMO_TOKEN_TTL_SECS;
  const payload = `${businessId}.${exp}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

async function verifyDemoToken(secret: string, token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [businessId, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!businessId || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  const expected = await hmacHex(secret, `${businessId}.${expStr}`);
  return safeEqual(sig, expected) ? businessId : null;
}

export interface VapiAuthResult {
  ok: boolean;
  // Set when the request was authorized by a demo token — the business it's
  // scoped to. Lets vapi-events attribute browser calls that have no phone
  // number to resolve a business from.
  demoBusinessId?: string;
}

// `businessId` is the business the endpoint is about to act on (from the
// ?business_id query param). A demo token for a different business is rejected.
export async function authorizeVapiRequest(
  req: Request,
  rawBody: string,
  businessId: string | null,
): Promise<VapiAuthResult> {
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  if (!secret) return { ok: true };

  const plain = req.headers.get("x-vapi-secret");
  if (plain && safeEqual(plain, secret)) return { ok: true };

  const signature = req.headers.get("x-vapi-signature") ?? req.headers.get("vapi-signature");
  if (signature) {
    const expected = await hmacHex(secret, rawBody);
    if (safeEqual(signature, expected) || safeEqual(signature, `sha256=${expected}`)) return { ok: true };
  }

  const demoToken = req.headers.get("x-orvia-demo-token");
  if (demoToken) {
    const tokenBusinessId = await verifyDemoToken(secret, demoToken);
    if (tokenBusinessId && (!businessId || tokenBusinessId === businessId)) {
      return { ok: true, demoBusinessId: tokenBusinessId };
    }
  }

  return { ok: false };
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
