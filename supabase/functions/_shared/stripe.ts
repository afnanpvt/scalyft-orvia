// Minimal Stripe helpers over fetch (no SDK) - works in Deno edge functions.

import { hmacHex, timingSafeEqual } from "./auth.ts";

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSecs = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  ) as Record<string, string>;
  const t = parts["t"];
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSecs) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  // header can carry several v1 signatures; check all
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => timingSafeEqual(p.slice(3), expected));
}

export async function stripeApi<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" ? new URLSearchParams(params).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${JSON.stringify(j.error ?? j)}`);
  return j as T;
}

export const PRICE_ENV: Record<string, string> = {
  solo: "STRIPE_PRICE_SOLO",
  pro: "STRIPE_PRICE_PRO",
  scale: "STRIPE_PRICE_SCALE",
};
