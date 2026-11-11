# Orvia US home-services: launch runbook

Supersedes `docs/architecture/how-orvia-works.md` (dental/India, Next.js + n8n). The app is now a Vite SPA + Supabase edge functions; there is no n8n.

## Call flow
Caller -> (conditional forward from the shop's number) -> Vapi US number -> `assistant-request` (finds the business, enforces the plan cap, builds the assistant) -> live call with tools `check_availability`, `book_appointment`, `capture_lead`, `transfer_call` -> `vapi-events` (end-of-call: transcript, `cost_usd`, outcome, owner digest, usage alerts) -> dashboard.

## Deploy
```bash
supabase db push
supabase functions deploy assistant-request check-availability book-appointment capture-lead vapi-events stripe-webhook create-checkout onboard-business
```
Secrets (`supabase secrets set`):

| Secret | Why |
|---|---|
| `VAPI_WEBHOOK_SECRET` | Vapi sends it as `X-Vapi-Secret`; every Vapi endpoint rejects requests without it (fail-closed) |
| `VAPI_API_KEY` | number provisioning in onboarding |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS (register A2P 10DLC or verify a toll-free number before real traffic) |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | owner email (optional) |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` | base64 of the service-account JSON key |
| `APP_URL` | dashboard URL for transcript links and Stripe redirects |
| `ORVIA_ADMIN_SECRET` | guards `onboard-business` and admin checkout |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE` | billing |

Stripe: create 3 recurring prices and a webhook to `.../functions/v1/stripe-webhook` for `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`.

## Onboard a customer (~15 min)
```bash
curl -X POST "$SUPABASE_URL/functions/v1/onboard-business" -H "x-admin-secret: $ORVIA_ADMIN_SECRET" -H "content-type: application/json" -d '{"name":"Torres Plumbing","trade":"plumbing","owner_name":"Mike Torres","owner_email":"mike@example.com","owner_phone":"+15125550100","state":"TX","service_area_zips":["78704","78745"],"calendar_id":"mike@example.com","area_code":"512"}'
```
The response has the dashboard login (temp password), the new US number, the calendar-share step (share with the service-account email, "Make changes to events"), per-carrier forwarding codes, and warnings. Then call `create-checkout` with `{plan, business_id}` plus the admin header for the 14-day card-up-front link, do a test call together, and have the owner set forwarding.

## Definition-of-done test call
1. Call the US number. The greeting says the call may be recorded.
2. Describe a leak, give ZIP and address, pick an offered slot, give a name.
3. Check: event on Google Calendar, caller SMS, owner SMS (name, address, issue, urgency, transcript link), call in the dashboard with cost.
4. Emergency: say a pipe burst. The warm transfer rings the owner. If they decline, `capture_lead` fires and an EMERGENCY SMS goes out.

## Validate unit economics (after ~20 real calls)
```sql
select business_id, month, calls, minutes, cost_usd, cost_per_minute_usd from business_usage_monthly order by month desc;
select avg(cost_usd) avg_cost_per_call, percentile_cont(0.9) within group (order by cost_usd) p90, avg(duration_secs)/60.0 avg_min
from calls where status='completed' and cost_usd > 0;
```
Plan assumption: about $0.12/min, $0.30/call.

## Known gaps / not verified live
- Nothing was run against live Vapi, Twilio, Google or Stripe (no credentials here). Edge functions are not type-checked locally (no Deno); shared logic is unit-tested in `tests/supabase`.
- The Vapi `transferPlan` fields (warm transfer + `fallbackPlan`) are from memory of the docs. Confirm with one real emergency test call.
- Overage is capped or blocked but not auto-invoiced. Bill it manually from `business_usage_monthly` until a metered Stripe price exists.
- No public self-serve signup. Onboarding is one admin API call.
- The dashboard lists don't show address yet (it is stored and in the SMS).
- Housecall Pro / Jobber: phase 2.
