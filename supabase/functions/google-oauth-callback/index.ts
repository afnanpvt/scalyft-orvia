import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Google redirects the browser here directly after consent — no auth header,
// no CORS. State carries a one-time token (verified against google_oauth_states,
// deleted on use) plus the dashboard origin to redirect back to.

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return atob(padded);
}

function errorRedirect(origin: string | null, message: string): Response {
  const fallback = origin ?? "";
  const location = `${fallback}/settings?google_calendar=error&reason=${encodeURIComponent(message)}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  let origin: string | null = null;
  let token: string | null = null;
  try {
    const decoded = JSON.parse(base64UrlDecode(stateRaw ?? ""));
    origin = decoded.origin ?? null;
    token = decoded.token ?? null;
  } catch {
    // handled below
  }

  if (googleError) return errorRedirect(origin, googleError);
  if (!code || !token) return errorRedirect(origin, "invalid_request");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !googleClientId || !googleClientSecret) {
    return errorRedirect(origin, "server_misconfigured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: stateRow } = await supabase
    .from("google_oauth_states")
    .select("business_id")
    .eq("state", token)
    .maybeSingle();

  if (!stateRow) return errorRedirect(origin, "expired_or_invalid_state");

  // One-time use, regardless of what happens next.
  await supabase.from("google_oauth_states").delete().eq("state", token);

  const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenResp.ok) {
    console.error("google-oauth-callback: token exchange failed", await tokenResp.text());
    return errorRedirect(origin, "token_exchange_failed");
  }

  const tokenData = await tokenResp.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  let googleEmail: string | null = null;
  try {
    const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoResp.ok) {
      const info = await userinfoResp.json() as { email?: string };
      googleEmail = info.email ?? null;
    }
  } catch {
    // non-fatal — email is cosmetic
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // access_type=offline + prompt=consent always returns a refresh_token, but
  // guard anyway: never overwrite a good refresh_token with a missing one.
  const { data: existing } = await supabase
    .from("google_calendar_connections")
    .select("refresh_token")
    .eq("business_id", stateRow.business_id)
    .maybeSingle();

  const { error: upsertError } = await supabase
    .from("google_calendar_connections")
    .upsert({
      business_id: stateRow.business_id,
      google_email: googleEmail,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? existing?.refresh_token ?? "",
      token_expires_at: expiresAt,
      calendar_id: "primary",
    }, { onConflict: "business_id" });

  if (upsertError) {
    console.error("google-oauth-callback: upsert failed", upsertError.message);
    return errorRedirect(origin, "save_failed");
  }

  const location = `${origin ?? ""}/settings?google_calendar=connected`;
  return new Response(null, { status: 302, headers: { Location: location } });
});
