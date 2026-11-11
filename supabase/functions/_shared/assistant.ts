// Builds the Vapi transient-assistant config for a US home-services business.
// Pure (no Deno APIs) so it can be unit tested with vitest.

import { TRADES, tradeOf } from "./trades.ts";

export interface BusinessService {
  name: string; duration_minutes: number; price_range: string; description: string;
  can_book_directly: boolean; priority?: "high" | "normal"; note?: string;
}

export interface BusinessSettings {
  business_owner?: string;
  tagline?: string;
  address?: string;
  city?: string;
  receptionist_name?: string;
  tone?: string;
  language_preference?: "english" | "spanish" | "multilingual";
  trade?: string;
  operating_hours?: Record<string, { open: string; close: string; lunch_break?: string | null; closed?: boolean }>;
  service_details?: BusinessService[];
  services?: string[];
  faq?: { question: string; answer: string }[];
  special_instructions?: string[];
  service_area_zips?: string[];
  emergency_keywords?: string[];
  intake_questions?: string[];
  /** What to do with emergencies outside business hours. */
  after_hours_policy?: "transfer_then_capture" | "capture_only" | "book_next_day";
  /** Emergencies during open hours transfer to owner when true (default true if a transfer number exists). */
  transfer_during_hours?: boolean;
  transfer_number?: string;
  emergency_number?: string;
  notification_phone?: string;
  calendar_id?: string;
  recording_disclosure?: boolean; // default true - keep it on
  [k: string]: unknown;
}

export interface BusinessRow {
  id: string;
  name: string;
  timezone: string;
  settings: BusinessSettings;
  trade?: string | null;
}

export interface BuildOptions {
  supabaseUrl: string;
  webhookSecret?: string;
  now?: Date;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function parseHM(s: string): number {
  const t = s.trim().toLowerCase();
  const ap = t.match(/^(\d+)(?::(\d+))?\s*(am|pm)$/);
  if (ap) {
    let h = +ap[1];
    if (ap[3] === "pm" && h !== 12) h += 12;
    if (ap[3] === "am" && h === 12) h = 0;
    return h * 60 + +(ap[2] ?? 0);
  }
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : 0;
}

/** Is the business open at `now`? Used to tell the model which branch of the rules applies. */
export function isOpenNow(settings: BusinessSettings, timezone: string, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const day = parts.weekday.toLowerCase();
  const h = settings.operating_hours?.[day];
  if (!h || h.closed) return false;
  const mins = (+parts.hour === 24 ? 0 : +parts.hour) * 60 + +parts.minute;
  return mins >= parseHM(h.open) && mins < parseHM(h.close);
}

function hoursNarrative(settings: BusinessSettings): string {
  if (!settings.operating_hours) return "Hours were not provided. Do not state specific hours.";
  const open: string[] = [];
  const closed: string[] = [];
  for (const d of DAYS) {
    const h = settings.operating_hours[d];
    const label = d[0].toUpperCase() + d.slice(1);
    if (!h || h.closed) closed.push(label);
    else open.push(`${label} ${h.open} to ${h.close}`);
  }
  return `${open.join("; ")}.${closed.length ? ` Closed ${closed.join(", ")}.` : ""}`;
}

export function buildGreeting(business: BusinessRow): string {
  const s = business.settings;
  const disclose = s.recording_disclosure !== false;
  return disclose
    ? `Thanks for calling ${business.name}. This call may be recorded for quality and scheduling. How can I help you today?`
    : `Thanks for calling ${business.name}, how can I help you today?`;
}

export function buildSystemPrompt(business: BusinessRow, now: Date = new Date()): string {
  const s = business.settings ?? {};
  const tz = business.timezone || "America/Chicago";
  const trade = TRADES[tradeOf(business.trade ?? s.trade)];
  const agent = s.receptionist_name || "Orvia";
  const open = isOpenNow(s, tz, now);
  const hasTransfer = !!(s.transfer_number || s.emergency_number);
  const policy = s.after_hours_policy ?? (hasTransfer ? "transfer_then_capture" : "capture_only");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(now);

  const emergencies = [...trade.emergencies, ...(s.emergency_keywords ?? [])];
  const intake = [...trade.intake, ...(s.intake_questions ?? [])];

  const lang = s.language_preference === "spanish"
    ? "Speak Spanish by default; switch to English if the caller does."
    : s.language_preference === "multilingual"
      ? "Answer in English. If the caller speaks Spanish, continue in Spanish."
      : "Speak English. If the caller speaks another language, apologize and take a callback.";

  const services = s.service_details?.length
    ? s.service_details.map((sv) =>
        `- ${sv.name}: ${sv.description}. About ${sv.duration_minutes} min. Typical price: ${sv.price_range}. ` +
        (sv.can_book_directly ? "Bookable directly." : `Needs an on-site look: offer a free estimate. ${sv.note ?? ""}`) +
        (sv.priority === "high" ? " High priority, offer the earliest slot." : "")).join("\n")
    : s.services?.length ? `We offer: ${s.services.join(", ")}.` : "Services were not provided; do not invent any.";

  const area = s.service_area_zips?.length
    ? `We serve ONLY these ZIP codes: ${s.service_area_zips.join(", ")}. Ask for the ZIP early. If it is not on the list, apologize, say we do not cover that area, and end politely. Do not book or capture a lead for out-of-area callers, EXCEPT a genuine emergency: still take a lead so the owner can decide.`
    : "No service-area restriction is configured.";

  const emergencyAfter =
    policy === "book_next_day"
      ? "After hours, emergencies: take the details with capture_lead (urgency emergency) and tell them the on-call tech will call back as soon as possible."
      : policy === "capture_only"
        ? "After hours, emergencies: take the details with capture_lead (urgency emergency). The owner is alerted by text immediately. Tell them someone will call back shortly."
        : "After hours, emergencies: first call transfer_call to reach the owner. If the transfer fails or nobody answers, immediately call capture_lead with urgency emergency (the owner is alerted by text) and tell the caller someone will call them back shortly.";
  const emergencyDuring = hasTransfer && s.transfer_during_hours !== false
    ? "During hours, emergencies: call transfer_call to reach the owner. If it fails, call capture_lead with urgency emergency."
    : "During hours, emergencies: call capture_lead with urgency emergency and get the earliest same-day slot if one exists.";

  return `## Right now
Today is ${todayLabel}, ${timeLabel} (${tz}). Today's date is ${today}. The business is currently ${open ? "OPEN" : "CLOSED (after hours)"}.
Resolve "tomorrow", "Friday", "the 25th" yourself from today's date. ALWAYS pass dates to tools as YYYY-MM-DD using the current year.

## Who you are
You are ${agent}, the phone receptionist for ${business.name}, a ${trade.label.toLowerCase()} company${s.city ? ` in ${s.city}` : ""}.${s.business_owner ? ` Owner: ${s.business_owner}.` : ""}${s.tagline ? ` Motto: "${s.tagline}".` : ""}
Warm, calm, efficient, like a good front-desk person. ${s.tone ? `Tone: ${s.tone}.` : ""} ${lang}
If asked, say you are an automated assistant for ${business.name}; never claim to be human.

## How to talk
One or two short sentences per turn. ONE question at a time. Contractions. Use the caller's first name once you have it.
Say phone numbers and addresses digit by digit and read them back to confirm. Never read symbols.
If they are stressed or something is flooding or broken, acknowledge it first ("That sounds stressful, let's get someone on it").
Remember everything the caller already said and never re-ask. Do not repeat filler like "one moment".

## Hard rules
- Never quote an exact price; give the range from the list below or say the tech gives a free estimate.
- Never promise an arrival time or a fix. Offer appointment windows only from check_availability.
- Never invent services, prices, hours or policies. If unsure: "I'll have the owner confirm that" and capture a lead.
- Never give DIY repair instructions, other than the safety line for an emergency.
- Never share another customer's information. Never argue.
- Telemarketers/vendors: take a message briefly and end the call. Do not book.

## Emergencies
Treat as an EMERGENCY: ${emergencies.join("; ")}.
Safety first: ${trade.safetyLines.join(" ")}
${emergencyDuring}
${emergencyAfter}
Do NOT use transfer_call for anything that is not an emergency or a request to speak to the owner during open hours.

## Business info
Hours: ${hoursNarrative(s)}
${s.address ? `Office: ${s.address}.` : ""}
${area}

Services:
${services}
${s.faq?.length ? `\nCommon questions:\n${s.faq.map((f) => `- "${f.question}" -> ${f.answer}`).join("\n")}` : ""}
${s.special_instructions?.length ? `\nOwner's standing instructions:\n${s.special_instructions.map((i) => `- ${i}`).join("\n")}` : ""}

## Intake (collect in this order, skipping what you already know)
1. What is going on (the issue) and how urgent is it.
2. Service address (street and ZIP) - confirm ZIP is in our area.
3. Trade-specific questions, one at a time:
${intake.map((q) => `   - ${q}`).join("\n")}
4. Name and callback number (confirm the number you are talking to is the best one).

## Booking a visit (non-emergency, or emergency with an open slot)
1. check_availability for the date they want (YYYY-MM-DD). If they have no preference, check today then tomorrow.
2. Offer two or three of the returned times. Wait for them to choose.
3. book_appointment with: customer_name, customer_phone, service_type, slot (use the exact ISO value from slots_iso), address, zip, urgency, notes (the issue and intake answers).
4. If it returns an error that the slot was taken, check_availability again and offer new times.
5. Confirm: service, day, time, address. Tell them a text confirmation is on its way.
If no slot works or they cannot decide: capture_lead and say the owner will call back.

## Closing
Before ending, ask "Anything else I can help with?". If they say no, thank them and end the call.

## Example
Caller: "My basement is flooding."
You: "I'm sorry, that sounds awful. Is water still coming in, and can you shut off the main valve?"
Caller: "Yes it's coming in, I'll find it."
You: "Good. What's the address and ZIP so we can send someone?"`;
}

function tools(business: BusinessRow, opts: BuildOptions) {
  const base = `${opts.supabaseUrl}/functions/v1`;
  const server = (fn: string) => ({
    url: `${base}/${fn}?business_id=${business.id}`,
    ...(opts.webhookSecret ? { secret: opts.webhookSecret } : {}),
  });
  const s = business.settings ?? {};
  const transferTo = s.transfer_number || s.emergency_number;

  const list: unknown[] = [
    {
      type: "function",
      function: {
        name: "capture_lead",
        description: "Save the caller's details and alert the owner. Use for emergencies, callback requests, or whenever booking can't be completed.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Caller's full name" },
            phone: { type: "string", description: "Callback number if different from caller ID" },
            address: { type: "string", description: "Street address of the job" },
            zip: { type: "string", description: "ZIP code of the job" },
            service_needed: { type: "string", description: "The issue / service needed, in a short phrase" },
            urgency: { type: "string", enum: ["emergency", "urgent", "routine", "inquiry"] },
            notes: { type: "string", description: "Other details: intake answers, access info, equipment age/brand" },
          },
          required: ["name", "service_needed", "urgency"],
        },
      },
      server: server("capture-lead"),
      messages: [{ type: "request-failed", content: "I couldn't save that on my end, but I'll make sure the owner calls you back." }],
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Get real open appointment times for a date. Always call before offering times.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            service_type: { type: "string" },
          },
          required: ["date"],
        },
      },
      server: server("check-availability"),
      messages: [
        { type: "request-start", content: "Let me check the schedule." },
        { type: "request-failed", content: "I'm having trouble with the schedule. Let me take your details and have the owner call you back." },
      ],
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book the visit after the caller picks a slot returned by check_availability.",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string" },
            customer_phone: { type: "string" },
            service_type: { type: "string" },
            slot: { type: "string", description: "Exact ISO 8601 value from slots_iso" },
            address: { type: "string" },
            zip: { type: "string" },
            urgency: { type: "string", enum: ["emergency", "urgent", "routine"] },
            notes: { type: "string", description: "Issue details and intake answers" },
          },
          required: ["customer_name", "customer_phone", "service_type", "slot", "address"],
        },
      },
      server: server("book-appointment"),
      messages: [{ type: "request-failed", content: "That slot didn't go through. Let me find another time." }],
    },
  ];

  if (transferTo) {
    list.push({
      type: "transferCall",
      function: { name: "transfer_call", description: "Connect the caller to the owner. Emergencies, or the caller asks for the owner during open hours." },
      destinations: [{
        type: "number",
        number: transferTo,
        message: "Hold on, I'm connecting you with the owner now.",
        description: "Owner / on-call tech",
        transferPlan: {
          mode: "warm-transfer-say-message",
          message: "Emergency call from a customer. Please stay on the line to take it.",
          fallbackPlan: {
            message: "I couldn't reach the owner just now, but I've flagged this as urgent and they'll call you right back. Let me get your details.",
            endCallEnabled: false,
          },
        },
      }],
    });
  }
  return list;
}

export function voiceAndTranscriber(lang: string | undefined) {
  const es = lang === "spanish" || lang === "multilingual";
  return {
    voice: { provider: "vapi", voiceId: "Lily" },
    transcriber: es
      ? { provider: "deepgram", model: "nova-3", language: lang === "spanish" ? "es" : "multi", smartFormat: true, endpointing: 200 }
      : { provider: "deepgram", model: "nova-3", language: "en", smartFormat: true, endpointing: 200 },
  };
}

export function buildAssistantConfig(business: BusinessRow, opts: BuildOptions) {
  const now = opts.now ?? new Date();
  const { voice, transcriber } = voiceAndTranscriber(business.settings?.language_preference);
  return {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: buildSystemPrompt(business, now) }],
      temperature: 0.3,
      maxTokens: 250,
      tools: tools(business, opts),
    },
    voice,
    transcriber,
    firstMessage: buildGreeting(business),
    firstMessageInterruptionsEnabled: false,
    endCallMessage: `Thanks for calling ${business.name}. Take care.`,
    endCallPhrases: ["have a great day", "goodbye"],
    voicemailMessage: `Hi, this is ${business.name}. Please call us back or leave a message and we'll get right back to you.`,
    startSpeakingPlan: { waitSeconds: 0.6, smartEndpointingPlan: { provider: "livekit" } },
    stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.4, backoffSeconds: 1.2 },
    backgroundDenoisingEnabled: true,
    backgroundSound: "off",
    recordingEnabled: true,
    modelOutputInMessagesEnabled: true,
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 600,
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        timeoutSeconds: 30,
        messages: [
          { role: "system", content: "Summarize this call in ONE sentence, max 22 words: caller, issue, address area if given, and outcome (booked/lead/info/transferred). No preamble." },
          { role: "user", content: "Transcript:\n\n{{transcript}}" },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        timeoutSeconds: 30,
        schema: {
          type: "object",
          properties: {
            caller_name: { type: "string" },
            address: { type: "string", description: "Service address if given" },
            zip: { type: "string" },
            issue: { type: "string", description: "The problem or service requested" },
            urgency: { type: "string", enum: ["emergency", "urgent", "routine", "inquiry"] },
            booked: { type: "boolean" },
            lead_captured: { type: "boolean" },
            transferred: { type: "boolean" },
            out_of_area: { type: "boolean" },
          },
        },
      },
    },
    server: {
      url: `${opts.supabaseUrl}/functions/v1/vapi-events`,
      ...(opts.webhookSecret ? { secret: opts.webhookSecret } : {}),
    },
    serverMessages: ["end-of-call-report", "status-update", "hang", "tool-calls", "transfer-update"],
    clientMessages: [],
  };
}
