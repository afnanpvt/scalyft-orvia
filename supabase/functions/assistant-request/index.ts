import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types (inlined - no @/ path aliases in edge functions) ─────────────────

interface ClinicService {
  name: string;
  duration_minutes: number;
  price_range: string;
  description: string;
  can_book_directly: boolean;
  priority?: "high" | "normal";
  note?: string;
}

interface ClinicFAQ {
  question: string;
  answer: string;
}

interface ClinicSettings {
  greeting?: string;
  doctor_name?: string;
  business_owner?: string;
  tagline?: string;
  address?: string;
  landmark?: string;
  city?: string;
  hours?: string;
  operating_hours?: Record<
    string,
    { open: string; close: string; lunch_break?: string | null; closed?: boolean }
  >;
  services?: string[];
  service_details?: ClinicService[];
  faq?: ClinicFAQ[];
  receptionist_name?: string;
  tone?: string;
  language_preference?: "english" | "hindi" | "bilingual";
  special_instructions?: string[];
  emergency_number?: string;
  emergency_protocol?: {
    during_hours?: string;
    after_hours?: string;
    emergency_contact?: string;
  };
  transfer_number?: string;
  notification_phone?: string;
  calendar_id?: string;
  calendar_provider?: "google";
  slot_duration_default?: number;
  buffer_between_appointments?: number;
  max_appointments_per_day?: number;
  service_area_zips?: string[];
}

interface Clinic {
  id: string;
  name: string;
  slug: string;
  phone_display: string | null;
  vapi_phone_id: string | null;
  vapi_assistant_id: string | null;
  timezone: string;
  settings: ClinicSettings;
  status: "active" | "inactive" | "onboarding";
  created_at: string;
  updated_at: string;
}

// ── Assistant config builder (ported from src/lib/vapi/build-assistant-config.ts) ─

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildGreeting(clinic: Clinic): string {
  return `Thanks for calling ${clinic.name}, how can I help you today?`;
}

function buildServicesNarrative(services: ClinicService[]): string {
  return services
    .map((s) => {
      const price = s.price_range ? `Prices typically range from ${s.price_range} dollars.` : "";
      const directBook = s.can_book_directly
        ? "You can book this directly."
        : `This one needs a tech to take a look first, so book a free estimate. ${s.note ?? ""}`.trim();
      const priority = s.priority === "high" ? "This is high priority, try to get them in same day or next available." : "";
      return [`${s.name}: ${s.description}`, `Takes about ${s.duration_minutes} minutes.`, price, directBook, priority]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n\n");
}

function buildFAQNarrative(faqs: ClinicFAQ[]): string {
  return faqs.map((f) => `If they ask "${f.question}" - answer with: ${f.answer}`).join("\n");
}

function buildHoursNarrative(clinic: Clinic): string {
  const { settings } = clinic;
  if (!settings.operating_hours) {
    return settings.hours ?? "We're open Monday through Saturday, seven a.m. to seven p.m. Closed Sundays.";
  }
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const open: string[] = [];
  const closed: string[] = [];
  for (const day of days) {
    const h = settings.operating_hours[day];
    const label = capitalize(day);
    if (!h || h.closed) {
      closed.push(label);
    } else {
      open.push(`${label}: ${h.open} to ${h.close}${h.lunch_break ? `, with a lunch break ${h.lunch_break}` : ""}`);
    }
  }
  const closedLine = closed.length > 0 ? ` Closed on ${closed.join(", ")}.` : "";
  return `${open.join(". ")}.${closedLine}`;
}

function buildSystemPrompt(clinic: Clinic): string {
  const { settings } = clinic;
  const agentName = settings.receptionist_name || "Orvia";
  const businessName = clinic.name;
  const timezone = clinic.timezone ?? "America/Chicago";
  const sections: string[] = [];

  // ─── 0. Right now (so the model resolves "tomorrow" / "next Monday" correctly) ─
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  sections.push(`## 0. Right Now
Today is ${todayLabel}. The current local time is ${timeLabel} (${timezone}). Today's date in YYYY-MM-DD format is ${today}.
When the caller says "tomorrow", "next Monday", "this Friday", or any other relative date, compute the absolute date from this. ALWAYS pass dates to tools in YYYY-MM-DD format using the CURRENT year (${today.slice(0, 4)}). Never use a past year.`);

  // ─── 1. Identity & Personality ─────────────────────────────────────────
  const identityLines = [
    `You are ${agentName}, the front-desk receptionist for ${businessName}.`,
    settings.business_owner ? `The business is owned by ${settings.business_owner}.` : "",
    settings.tagline ? `Their motto is "${settings.tagline}".` : "",
    `You sound like a real person who works at the front desk - warm, calm, efficient. Never robotic. Never a call center agent. You are local, you know the business, and you genuinely want to help.`,
    settings.tone ? `Tone: ${settings.tone}.` : "",
  ].filter(Boolean);
  sections.push(`## 1. Identity\n${identityLines.join(" ")}`);

  // ─── 2. Response Guidelines (voice-formatted) ──────────────────────────
  sections.push(`## 2. Response Style
Keep every reply to one or two short sentences. Real receptionists don't make speeches.
Ask ONE question at a time. Never stack questions.
Use contractions naturally - "I'll", "you're", "we've", "don't".
Use the caller's first name once you have it. "Sure John, let me check that."
If you mishear, say "Sorry, could you repeat that?" - never "I didn't understand your input."
Numbers, prices, and phone numbers should sound natural when spoken. Never read out symbols like dollar signs or hashtags.
If a caller is upset or in pain, acknowledge it first before moving to logistics. "That sounds frustrating. Let's get someone out there."
Mention near the start that the call may be recorded.

## 2a. Sounding Human (CRITICAL)
- Never say "wait a sec", "one moment", "give me a moment", "let me check", or "just a sec" more than ONCE per call. Real receptionists are quick. If you've already said it, do NOT say it again - just give the answer.
- Do NOT pad replies with filler. If you have the info, say it. "Yep, ten AM works" - not "Let me check... give me a moment... yes, ten AM works."
- Vary phrasing. Use natural openers like "Yep", "Sure thing", "Got it", "Okay", "Alright" - not the same word every time.
- Use small acknowledgments while listening: "mm-hm", "okay", "got it" - but only ONCE per turn, never stacked.
- Sound like a tired but friendly small-business front-desk worker, not a chipper call-center bot.

## 2b. Memory and State
- REMEMBER what the caller has already told you. Never re-ask for info already given.
- If you have their ZIP, don't ask again. If they said the service is "AC repair", don't ask "what service do you need?" later.
- If you've already confirmed a date, don't ask "what day?" again - just confirm the time or move forward.
- Keep a mental checklist: ZIP -> service -> date/time -> name -> phone. Once a slot is filled, move to the NEXT empty slot.

## 2c. Date Handling (CRITICAL)
- When the caller says a partial date like "the 25th" or "Thursday" or "tomorrow", figure it out yourself using the current date in section 0. Do NOT ask them to clarify the year or month unless genuinely ambiguous.
- "the 25th" = the upcoming 25th of the current or next month. If today is past the 25th of this month, assume next month.
- "tomorrow" = current date + 1.
- "Monday" = the next Monday from today.
- Confirm by repeating it back as a full date: "Got it, Monday May 25 - what time works?"
- Then call check_availability with the resolved YYYY-MM-DD.

## 2d. Booking Discipline (CRITICAL)
- When the caller asks for a specific time, ALWAYS call check_availability FIRST. Don't agree to a time you haven't checked.
- If they ask for a late time and earlier slots are also available, offer the earlier ones first: "We actually have slots open earlier - ten AM or eleven thirty - would either work? Otherwise we can do two PM."
- Don't just accept whatever the caller proposes - act like a real receptionist trying to fit them in efficiently.
- After offering slots, wait for them to pick. Don't push.
- Once they pick, get NAME and PHONE in that order, then call book_appointment immediately. Don't add unnecessary confirmation rounds.

## 2e. Tool Use
- When you call a tool, the caller will hear a short natural-sounding filler from VAPI ("let me check"). Do NOT say "just a sec" or "one moment" yourself BEFORE calling a tool - the system already handles that.
- After a tool returns, jump straight to the answer. "Yep, ten AM works - let me grab your name."
- If a tool errors, smoothly offer alternatives. Never say "the system failed" or "having trouble".`);

  // ─── 3. Guardrails ─────────────────────────────────────────────────────
  sections.push(`## 3. Guardrails - what you must NOT do
Never quote exact prices. Always give a range, or say a technician will provide a free on-site estimate.
Never share another customer's information.
Never argue. If a caller is upset and you can't resolve it, offer to have the owner call them back.
Never promise something the business may not deliver (specific arrival times, free work, guaranteed fixes).
Never book or capture a lead for someone outside the service area.
Never invent services, prices, or hours that aren't listed below.
Never tell the caller something "failed" - if a tool doesn't work, smoothly offer a callback.`);

  // ─── 4. Context (business data) ────────────────────────────────────────
  const contextParts: string[] = [];

  if (settings.service_details?.length) {
    contextParts.push(`### Services\n${buildServicesNarrative(settings.service_details)}`);
  } else if (settings.services?.length) {
    contextParts.push(`### Services\nWe offer: ${settings.services.join(", ")}.`);
  }

  contextParts.push(`### Hours\n${buildHoursNarrative(clinic)}`);

  if (settings.address) {
    const landmark = settings.landmark ? ` It's ${settings.landmark}.` : "";
    contextParts.push(`### Location\nWe're at ${settings.address}.${landmark}`);
  }

  if (settings.service_area_zips?.length) {
    const city = settings.city ?? "our service area";
    const zips = settings.service_area_zips.join(", ");
    contextParts.push(`### Service area
We only serve these ZIP codes in ${city}: ${zips}.
Always ask for the caller's ZIP code early. If their ZIP is not in that list, politely say: "I'm sorry, we don't currently serve that area - we're focused on ${city}. I hope you find someone quickly." Then end the call. Do NOT book and do NOT capture a lead for out-of-area callers.`);
  }

  if (settings.faq?.length) {
    contextParts.push(`### Common questions\n${buildFAQNarrative(settings.faq)}`);
  }

  if (settings.special_instructions?.length) {
    contextParts.push(`### Owner's standing instructions\n${settings.special_instructions.map((i) => `- ${i}`).join("\n")}`);
  }

  sections.push(`## 4. Business Context\n${contextParts.join("\n\n")}`);

  // ─── 5. Workflows ──────────────────────────────────────────────────────
  const emergencyDuring = settings.emergency_protocol?.during_hours ?? "Dispatch a technician same day. Prioritize over routine calls.";
  const emergencyAfter = settings.emergency_protocol?.after_hours ?? "Take their name, phone, address, and the nature of the emergency. Tell them the on-call tech will call back within 30 minutes.";
  const emergencyContact = settings.emergency_protocol?.emergency_contact ?? settings.emergency_number;

  sections.push(`## 5. Workflows

### Booking a service
Step 1. Ask their ZIP code first. Confirm we serve their area before doing anything else.
Step 2. Ask what service they need.
Step 3. Ask their preferred date and time window.
Step 4. Call the check_availability tool to find open slots.
Step 5. Offer two or three available times in plain English. "I have ten in the morning, or two in the afternoon - which works?"
Step 6. Once they pick a slot, get their full name and a callback phone number.
Step 7. Call the book_appointment tool to confirm.
Step 8. Read it back: "You're all set - drain cleaning, Tuesday at two p.m. We'll see you then."

### Questions about services or pricing
Give a price range, never a fixed number. "Drain cleaning typically runs ninety-five to two-fifty, depending on what we find."
For anything that needs an on-site look - panel upgrades, water heater replacement - suggest booking a free estimate.

### Emergencies (burst pipe, gas smell, flooding, no hot water, no heat in winter)
${emergencyDuring}
After hours: ${emergencyAfter}
${emergencyContact ? `Emergency dispatch contact: ${emergencyContact}.` : ""}

### Caller asks to speak to the owner or manager
Say they're currently unavailable, then offer to take a message or schedule a callback.

### Non-customer calls (vendors, sales, telemarketers)
Politely take a message. Never book a job for a non-customer.

### Booking can't complete (no slots, tool error, caller can't commit)
Call capture_lead with whatever info you have. Tell the caller someone will call them back within 30 minutes.`);

  // ─── 6. Few-shot examples ─────────────────────────────────────────────
  sections.push(`## 6. Examples

Caller: "Hi, my kitchen sink is completely blocked."
You: "Oh no - let's get that taken care of. First, what's your ZIP code so I can make sure we serve your area?"

Caller: "Seven eight seven oh four."
You: "Perfect, we're there. So this is the kitchen sink - when would you like a tech to come out?"

Caller: "How much does a water heater cost?"
You: "Repairs typically run two hundred to four hundred. A full replacement can be anywhere from a thousand to eighteen hundred, depending on the unit. Want me to send a tech out for a free estimate?"

Caller: "I smell gas in my house right now."
You: "That's an emergency - please stay safe. I'm flagging this as urgent right now. Can I get your name, address, and a callback number? Someone will be in touch within minutes."`);

  return sections.join("\n\n");
}

function buildTools(clinic: Clinic, supabaseUrl: string) {
  const { settings } = clinic;
  const edgeFnBase = `${supabaseUrl}/functions/v1`;

  const tools: unknown[] = [
    {
      type: "function",
      function: {
        name: "capture_lead",
        description: "Save the caller's contact information when you cannot complete a booking or they just want a callback",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Caller's full name" },
            phone: { type: "string", description: "Caller's phone number (only if different from caller ID)" },
            service_needed: { type: "string", description: "What service they need" },
            urgency: {
              type: "string",
              enum: ["emergency", "urgent", "routine", "inquiry"],
              description: "How urgent is the request",
            },
            notes: { type: "string", description: "Any other relevant details mentioned by the caller" },
          },
          required: ["name", "service_needed", "urgency"],
        },
      },
      server: { url: `${edgeFnBase}/capture-lead?clinic_id=${clinic.id}` },
      messages: [
        { type: "request-start", content: "Got it, writing this down." },
        { type: "request-failed", content: "Couldn't save that on my end - let me just have the owner call you back directly." },
      ],
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Check available slots for a specific date. Call this before offering times to the caller.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
            service_type: { type: "string", description: "Type of service (affects slot duration)" },
          },
          required: ["date"],
        },
      },
      server: { url: `${edgeFnBase}/check-availability?clinic_id=${clinic.id}` },
      messages: [
        // Spoken when the tool is fired. VAPI picks one at random, so vary them.
        { type: "request-start", content: "Let me check that real quick." },
        { type: "request-start", content: "Pulling up the schedule." },
        { type: "request-start", content: "One sec, checking." },
        { type: "request-failed", content: "Hmm, having trouble pulling up the schedule. Can I take your info and call you back?" },
      ],
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book a confirmed appointment after the caller has selected a slot",
        parameters: {
          type: "object",
          properties: {
            patient_name: { type: "string", description: "Caller's full name" },
            patient_phone: { type: "string", description: "Caller's phone number" },
            service_type: { type: "string", description: "Type of service being booked" },
            slot: { type: "string", description: "ISO 8601 datetime of the appointment (e.g., 2026-03-21T14:30:00+05:30)" },
            notes: { type: "string", description: "Any notes about the appointment" },
          },
          required: ["patient_name", "patient_phone", "service_type", "slot"],
        },
      },
      server: { url: `${edgeFnBase}/book-appointment?clinic_id=${clinic.id}` },
      messages: [
        { type: "request-start", content: "Alright, locking that in." },
        { type: "request-start", content: "Booking it now." },
        { type: "request-failed", content: "Looks like that slot just slipped away. Want me to try a different time?" },
      ],
    },
  ];

  const transferNumber = settings.transfer_number || settings.emergency_number;
  if (transferNumber) {
    tools.push({
      type: "transferCall",
      destinations: [
        {
          type: "number",
          number: transferNumber,
          message: "One moment, let me connect you directly.",
        },
      ],
    });
  }

  return tools;
}

function buildAssistantConfig(clinic: Clinic, supabaseUrl: string) {
  const edgeFnBase = `${supabaseUrl}/functions/v1`;
  const businessName = clinic.name;
  return {
    // ─── LLM ──────────────────────────────────────────────────────────────
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: buildSystemPrompt(clinic) }],
      temperature: 0.3,
      maxTokens: 250,
      tools: buildTools(clinic, supabaseUrl),
    },

    // ─── Voice ────────────────────────────────────────────────────────────
    voice: {
      provider: "vapi",
      voiceId: "Savannah",
    },

    // ─── Transcriber ──────────────────────────────────────────────────────
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      smartFormat: true,
      endpointing: 200,
    },

    // ─── First impression ────────────────────────────────────────────────
    firstMessage: buildGreeting(clinic),
    firstMessageInterruptionsEnabled: false,

    // ─── Endings ──────────────────────────────────────────────────────────
    endCallMessage: `Thanks for calling ${businessName}. Have a great day.`,
    endCallPhrases: ["talk to you later", "have a good day", "have a great day"],
    voicemailMessage: `Hi, this is Orvia from ${businessName}. Please call us back when you have a moment so we can help. Thanks.`,

    // ─── Conversation flow tuning ─────────────────────────────────────────
    startSpeakingPlan: {
      waitSeconds: 0.6,
      smartEndpointingPlan: { provider: "livekit" },
    },
    stopSpeakingPlan: {
      numWords: 3,
      voiceSeconds: 0.4,
      backoffSeconds: 1.2,
    },

    // ─── Quality ──────────────────────────────────────────────────────────
    backgroundDenoisingEnabled: true,
    backgroundSound: "off",
    modelOutputInMessagesEnabled: true,

    // ─── Limits ───────────────────────────────────────────────────────────
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 600,

    // ─── Analysis ─────────────────────────────────────────────────────────
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        timeoutSeconds: 30,
        messages: [
          {
            role: "system",
            content:
              "You are a call summarizer. Produce ONE short sentence (max 18 words, no longer) describing what the caller wanted and what happened. " +
              "Format: \"<caller / service> - <outcome>\". " +
              "Examples: " +
              "\"AC repair for Zach - booked Mon May 25, 11:30 AM.\" " +
              "\"Drain cleaning inquiry - out of area, no booking.\" " +
              "\"Burst pipe emergency - lead captured, owner alerted.\" " +
              "\"Water heater pricing question - info given, no booking.\" " +
              "Never write more than one sentence. No preamble, no 'The user called', just the summary. No quotes in output.",
          },
          {
            role: "user",
            content: "Here is the transcript:\n\n{{transcript}}\n\nWrite the one-sentence summary now.",
          },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        timeoutSeconds: 30,
        schema: {
          type: "object",
          properties: {
            caller_name: { type: "string", description: "Caller's name if mentioned" },
            caller_zip: { type: "string", description: "ZIP code if provided" },
            service_requested: { type: "string", description: "Service the caller asked about" },
            urgency: {
              type: "string",
              enum: ["emergency", "urgent", "routine", "inquiry"],
              description: "How urgent the request is",
            },
            booked: { type: "boolean", description: "Whether an appointment was booked" },
            lead_captured: { type: "boolean", description: "Whether a lead was captured" },
            out_of_area: { type: "boolean", description: "Whether the caller was outside service area" },
          },
        },
      },
      successEvaluationPlan: {
        enabled: true,
        timeoutSeconds: 30,
        rubric: "PassFail",
      },
    },

    // ─── Webhooks ─────────────────────────────────────────────────────────
    serverUrl: `${edgeFnBase}/vapi-events`,
    serverMessages: [
      "end-of-call-report",
      "status-update",
      "hang",
      "tool-calls",
    ],
    clientMessages: [],
  };
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase credentials" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Vapi sends: { message: { type: "assistant-request", call: { phoneNumberId, ... } } }
  const msg = body.message as Record<string, unknown> | undefined;
  const callObj = (msg?.call ?? body.call) as Record<string, unknown> | undefined;
  const phoneNumberId =
    (msg?.phoneNumberId as string) ??
    (callObj?.phoneNumberId as string) ??
    (body.phoneNumberId as string);

  if (!phoneNumberId) {
    return new Response(
      JSON.stringify({ error: "Missing phoneNumberId" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: clinic, error } = await supabase
    .from("clinics")
    .select("*")
    .eq("vapi_phone_id", phoneNumberId)
    .eq("status", "active")
    .single();

  if (error || !clinic) {
    console.error("Clinic lookup failed:", error?.message ?? "not found", "phoneNumberId:", phoneNumberId);
    return new Response(
      JSON.stringify({ error: "Clinic not found for this phone number" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const assistantConfig = buildAssistantConfig(clinic as Clinic, supabaseUrl);

  return new Response(
    JSON.stringify({ assistant: assistantConfig }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
