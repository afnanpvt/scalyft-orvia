# Orvia Production Audit — March 23, 2026

## Executive Summary

Orvia is functionally complete as an MVP. The dashboard, settings, voice AI pipeline, and workflow automation are built and deployed. This audit identifies what's fixed, what remains, and the exact costs to operate.

---

## What Was Fixed Today

### Pipeline Fixes (n8n workflows)

| Issue | Status | What was done |
|---|---|---|
| Call records never created (clinic_id null in all workflows) | **FIXED** | Call Ended workflow now handles `status-update[in-progress]` events — creates call record when call starts |
| No error handling (Supabase failure = dead silence) | **FIXED** | All HTTP Request nodes set to `neverError: true`, fallback response nodes return graceful messages to patients |
| `outcome` field never populated in calls table | **FIXED** | Added outcome inference: queries appointments/leads tables, maps to appointment_booked/lead_captured/transferred/info_given/missed |
| check-availability ignores per-day operating hours | **FIXED** | Now reads correct day-of-week schedule, respects `closed` flag, parses `lunch_break` string |
| N8N_BASE_URL fallback pointed to wrong URL | **FIXED** | Removed fallback, returns 500 if env var missing. Set correct URL on Vercel. |

### Dashboard UX Fixes

| Issue | Status | What was done |
|---|---|---|
| Overview metrics not responsive on mobile | **FIXED** | `grid-cols-1 sm:grid-cols-3` |
| Calls list layout breaks on mobile | **FIXED** | Stacks vertically on small screens |
| Leads filter tabs overflow on mobile | **FIXED** | Stacks and wraps with smaller gaps |
| Leads cards break on mobile | **FIXED** | Responsive stacking |
| No error states (shows "0 calls" on API failure) | **FIXED** | Added error state with "Try again" on overview, calls, leads |
| No forgot password flow | **FIXED** | Added "Contact support@scalyft.tech" link |
| Sticky save bar covers bottom content | **FIXED** | Added `pb-20` padding |
| Pagination doesn't scroll to top | **FIXED** | Added smooth scroll to top on page change |
| formatDuration shows "--" for 0-second calls | **FIXED** | Changed `!secs` to `secs == null` |

---

## What Still Needs Work

### Before First Real Customer

| Item | Effort | Why it matters |
|---|---|---|
| **One real test call** | 30 min | Verifies the entire pipeline: Vapi → n8n → Supabase → Dashboard. Must happen before any clinic goes live. |
| **Remove seed/mock data** | 10 min | Delete fake calls, leads, appointments from Supabase. |
| **Set up Indian phone number** | 1-2 days | Vapi free numbers are US-only. Need Twilio import, Exotel SIP trunk, or web calling. |
| **Verify Vercel env vars** | 5 min | Confirm N8N_BASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL are set. |

### Nice to Have for v1.0

| Item | Effort | Impact |
|---|---|---|
| Lead status actions (mark contacted/booked from leads page) | 2 hours | Lets doctor manage lead pipeline |
| Search/filter on calls page (by phone, date, outcome) | 3 hours | Essential when call volume > 20/day |
| Hindi/bilingual voice support | 4 hours | Required for India market — currently English-only |
| beforeunload warning on unsaved settings | 30 min | Prevents accidental data loss |
| Clinic-scoped API queries (defense in depth) | 2 hours | Application-level multi-tenant safety |

---

## Exact Production Costs

### Per Clinic (20 calls/day, 3 min average)

| Service | Monthly Cost | Notes |
|---|---|---|
| **Vapi** (voice AI, all-in) | **$208.80** | 1,800 min × $0.116/min (platform + STT + LLM + TTS) |
| WhatsApp notifications | $1.56 | 600 messages × $0.0026 each |
| **Total variable per clinic** | **$210.36** | |

### Fixed Infrastructure (shared across all clinics)

| Service | Monthly Cost | Notes |
|---|---|---|
| Supabase Pro | $25 | Free tier auto-pauses — unusable for production |
| Vercel Pro | $20 | Free tier prohibits commercial use |
| Railway (n8n) | $7-10 | Scales to ~$15-20 at 50 clinics |
| WhatsApp BSP (Interakt) | $10 | Platform fee for API access |
| Google Calendar API | $0 | Free, 1M requests/day limit |
| **Total fixed** | **$62-65** | |

### Scaling Economics

| Clinics | Monthly Cost | Per Clinic | Recommended Price (INR) | Gross Margin |
|---|---|---|---|---|
| 1 | $272 | $272 | 24,999 (~$301) | 10% |
| 5 | $1,114 | $223 | 24,999 | 26% |
| 10 | $2,166 | $217 | 24,999 | 28% |
| 50 | $10,580 | $212 | 24,999 | 30% |

### Critical Cost Insight

**Vapi is 97% of variable costs.** The single most impactful optimization:
- Reduce average call duration from 3 min to 2 min → saves $70/clinic/month
- Switch from ElevenLabs TTS to Vapi's built-in TTS → saves $25/clinic/month
- Long-term: build own voice pipeline, drop Vapi entirely → saves $90/clinic/month

---

## Architecture Health

### What's Working

- Assistant-request webhook returns correct format within Vapi's 7.5s timeout
- All 5 n8n workflows are active and responding
- Google Calendar FreeBusy is wired into check-availability
- Multi-tenant routing works (phone number → clinic lookup → dynamic config)
- Settings → Supabase → AI assistant pipeline is instant (no sync needed)
- Dashboard loads fast (Vite SPA, <1s initial load)
- Auth with Supabase works correctly

### What's Risky

- **Single point of failure: n8n on Railway.** If Railway goes down, all call workflows fail. Mitigation: UptimeRobot monitoring + the new error handling returns graceful messages.
- **No webhook authentication.** Anyone who knows the n8n webhook URLs can call them. Mitigation: add Vapi server secret validation.
- **Supabase service role key in n8n is hardcoded.** Should be moved to n8n credentials. Current key should be rotated after migration.

---

## Steps to First Paying Customer

1. **Test call** — Use Vapi's outbound call feature to call the US number and verify the full pipeline
2. **Clean seed data** — Delete mock rows from Supabase
3. **Phone number** — Decide on Indian telephony (Twilio import, Exotel, or web calling)
4. **Find a clinic** — Walk in, demo on phone, offer 14-day free pilot
5. **Onboard** — Configure their settings, share their Google Calendar with service account
6. **Monitor** — Watch n8n execution logs, dashboard data, and call recordings for first week
7. **Convert** — Show pilot results, convert to INR 24,999/month

---

## Decision: Pricing

At $210/clinic variable cost, pricing at INR 24,999/month ($301) gives ~30% margin at scale. This is healthy for early stage.

**Alternative: Lower call duration to improve margins.** The system prompt can be optimized to:
- Ask fewer questions before booking
- Give shorter price ranges
- Limit small talk
- Target 2-minute average calls → $140/clinic cost → 53% margin at INR 24,999

This is the highest-leverage optimization available.
