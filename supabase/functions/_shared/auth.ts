// Webhook authentication. FAIL-CLOSED: if no secret is configured the request
// is rejected (set ALLOW_INSECURE_WEBHOOKS=true for local dev only).
//
// Vapi sends the `secret` we put on each `server` block as the `X-Vapi-Secret`
// header. We also accept `Authorization: Bearer <secret>` and an HMAC-SHA256
// body signature (`x-vapi-signature`) for accounts that use signed webhooks.

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyVapiRequest(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET");
  if (!secret) return Deno.env.get("ALLOW_INSECURE_WEBHOOKS") === "true";

  const header = req.headers.get("x-vapi-secret");
  if (header && timingSafeEqual(header, secret)) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && timingSafeEqual(bearer, secret)) return true;

  const sig = req.headers.get("x-vapi-signature") ?? req.headers.get("vapi-signature");
  if (sig) {
    const expected = await hmacHex(secret, rawBody);
    if (timingSafeEqual(sig, expected) || timingSafeEqual(sig, `sha256=${expected}`)) return true;
  }
  return false;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/** Internal/admin endpoints (onboarding): `x-admin-secret` header. Fail-closed. */
export function verifyAdmin(req: Request): boolean {
  const secret = Deno.env.get("ORVIA_ADMIN_SECRET");
  if (!secret) return false;
  const h = req.headers.get("x-admin-secret");
  return !!h && timingSafeEqual(h, secret);
}
