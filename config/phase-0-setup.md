# Phase 0: External Service Configuration

Fill in each section as you complete the setup. This file tracks all external dependencies that must be ready before code is written.

---

## 1. Vapi (Voice AI)

- [ ] Account created at vapi.ai
- [ ] Indian phone numbers available? YES / NO / FALLBACK (clinic forwards to intl number)
- Phone Number ID: `___________________________`
- API Key: `___________________________`
- Webhook Secret: `___________________________`
- Notes: ___________________________

## 2. Supabase (Database + Auth)

- [ ] Project created (free tier)
- Project URL: `___________________________`
- Anon Key: `___________________________`
- Service Role Key: `___________________________`
- Notes: ___________________________

## 3. Vercel (Hosting)

- [ ] Account created
- [ ] Connected to GitHub repo
- Domain: `___________________________` (e.g., app.scalyft.tech)
- Notes: ___________________________

## 4. OpenAI (LLM for voice)

- [ ] Account created
- API Key: `___________________________`
- Model: GPT-4o-mini (for voice latency)
- Notes: ___________________________

## 5. Google Calendar (Service Account)

- [ ] Google Cloud project created ("Orvia")
- [ ] Google Calendar API enabled
- [ ] Service account created
- Service Account Email: `___________________________@___.iam.gserviceaccount.com`
- [ ] JSON key downloaded
- [ ] Base64 encoded: `cat service-account.json | base64`
- Base64 Key (for env var): `___________________________`
- Notes: ___________________________

### How to set up:
1. Go to console.cloud.google.com -> Create project "Orvia"
2. APIs & Services -> Enable "Google Calendar API"
3. IAM & Admin -> Service Accounts -> Create
4. Download JSON key
5. Base64 encode it for the GOOGLE_CALENDAR_SERVICE_ACCOUNT env var

## 6. WhatsApp Business API

- [ ] Meta Business Manager account created (business.facebook.com)
- [ ] Business verification submitted
- [ ] Business verification approved (takes 1-7 days)
- BSP chosen: META DIRECT / GUPSHUP / TWILIO
- [ ] Message templates submitted for approval
- API Token: `___________________________`
- Phone ID: `___________________________`
- Business ID: `___________________________`
- Notes: ___________________________

### Fallback (if not approved in time):
- [ ] whatsapp-web.js set up as temporary bridge
- Dedicated WhatsApp number for notifications: `___________________________`

### Required message templates:
1. `new_lead`: "New patient: {{1}} needs {{2}}. Phone: {{3}}. Urgency: {{4}}."
2. `appointment_booked`: "Appointment booked: {{1}}, {{2}}, {{3}} at {{4}}."
3. `call_summary`: "Orvia handled {{1}} calls today. {{2}} leads captured, {{3}} appointments booked."

## 7. ElevenLabs (Hindi TTS)

- [ ] Account created
- [ ] Hindi voice tested with dental terms
- Voice ID: `___________________________`
- API Key: `___________________________`
- Notes on voice quality: ___________________________

## 8. Railway.app (n8n hosting)

- [ ] Account created
- [ ] n8n deployed
- n8n URL: `___________________________`
- Basic Auth User: `___________________________`
- Basic Auth Password: `___________________________`
- [ ] PostgreSQL addon attached (not SQLite)
- Notes: ___________________________

## 9. UptimeRobot (Monitoring)

- [ ] Account created (free)
- [ ] Monitor added for n8n webhook URL
- [ ] Alert email configured
- Notes: ___________________________

---

## Final .env.local Values

Once all services are set up, copy these into your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

VAPI_API_KEY=
VAPI_WEBHOOK_SECRET=

N8N_BASE_URL=
N8N_WEBHOOK_SECRET=

GOOGLE_CALENDAR_SERVICE_ACCOUNT=

WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ID=
```

---

## Status

- [ ] All critical services configured
- [ ] .env.local populated
- [ ] Ready for Phase 1
