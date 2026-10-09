import type { Business } from "@/lib/types"
import { NICHE_PRESETS } from "@/lib/niche-presets"
import type { Niche } from "@/lib/vapi/niche-profiles"
import { getGuestNiche } from "@/lib/guest/session"

// The public voice demo has no account and no tenant. The only thing it needs
// from "the database" is the business the visitor is talking to: a generic
// business of the chosen type, built here in the browser. Nothing is stored
// or sent anywhere.

// The demo shows every time in the visitor's own time zone, so opening hours
// and "tomorrow morning" agree with the clock on their screen.
function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } catch { return "UTC" }
}

export function guestBusiness(niche: Niche): Business {
  const preset = NICHE_PRESETS.find(p => p.id === niche) ?? NICHE_PRESETS[0]
  const india = preset.settings.demo_region === "in"
  const now = new Date().toISOString()
  return {
    id: `guest-${niche}`,
    name: preset.businessName,
    slug: `guest-${niche}`,
    phone_display: india ? "+91 80 4000 1000" : "+1 (555) 010-0100",
    vapi_phone_id: "guest",
    vapi_assistant_id: null,
    timezone: browserTimezone(),
    // "simulated" so a visitor's bookings never depend on a real calendar.
    settings: { ...preset.settings, scheduling_mode: "simulated" },
    status: "active",
    seconds_remaining: 300 * 60,
    allow_overage: true,
    owner_phone: null,
    created_at: now,
    updated_at: now,
  }
}

export const guestApi = {
  getBusiness: (): Business => {
    const niche = getGuestNiche()
    if (!niche) throw new Error("No demo business chosen")
    return guestBusiness(niche)
  },
}
