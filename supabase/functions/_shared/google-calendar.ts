// Google Calendar helpers shared by check-availability (free/busy lookup) and
// book-appointment (event creation). Everything here is best-effort: callers
// treat a null return as "calendar unavailable" and carry on.

interface GoogleTokenRow {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  calendar_id: string;
}

export async function getValidGoogleAccessToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  businessId: string,
): Promise<GoogleTokenRow | null> {
  const { data: conn } = await supabase
    .from("google_calendar_connections")
    .select("access_token, refresh_token, token_expires_at, calendar_id")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!conn) return null;

  if (new Date(conn.token_expires_at).getTime() - Date.now() > 60_000) {
    return conn as GoogleTokenRow;
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!resp.ok) {
    console.error("google token refresh failed:", await resp.text());
    return null;
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  await supabase
    .from("google_calendar_connections")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("business_id", businessId);

  return { ...conn, access_token: data.access_token } as GoogleTokenRow;
}

// Busy intervals on the connected calendar between timeMin and timeMax.
export async function getGoogleBusyRanges(
  token: GoogleTokenRow,
  timeMin: Date,
  timeMax: Date,
): Promise<Array<{ start: Date; end: Date }> | null> {
  try {
    const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: token.calendar_id }],
      }),
    });
    if (!resp.ok) {
      console.error("google freeBusy failed:", await resp.text());
      return null;
    }
    const data = await resp.json() as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> };
    const busy = data.calendars?.[token.calendar_id]?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch (e) {
    console.error("google freeBusy threw:", e);
    return null;
  }
}

export async function createGoogleCalendarEvent(
  token: GoogleTokenRow,
  opts: { summary: string; description: string; start: Date; end: Date; timezone: string },
): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(token.calendar_id)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: opts.summary,
          description: opts.description,
          start: { dateTime: opts.start.toISOString(), timeZone: opts.timezone },
          end: { dateTime: opts.end.toISOString(), timeZone: opts.timezone },
        }),
      },
    );
    if (!resp.ok) {
      console.error("google calendar event create failed:", await resp.text());
      return null;
    }
    const event = await resp.json() as { id: string };
    return event.id;
  } catch (e) {
    console.error("google calendar event create threw:", e);
    return null;
  }
}
