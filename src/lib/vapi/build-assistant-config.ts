import type { Business, BusinessService, BusinessFAQ } from "@/lib/types";
import { NICHE_PROFILES, nicheOf } from "@/lib/vapi/niche-profiles";

// Hindi: ElevenLabs multilingual v2. Kannada, Telugu and Tamil: Eleven v3 covers
// them, and only Deepgram nova-3 transcribes them (nova-2 is Hindi-only).
// Requires an ElevenLabs key configured on the Vapi account. Quality unverified;
// poc/sarvam-bridge has a Sarvam alternative to compare against.
function voiceAndTranscriberFor(language: string | undefined) {
  switch (language) {
    case "hindi":
      return {
        voice: { provider: "11labs" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2" as const },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "hi" as const, smartFormat: true, endpointing: 200 },
      };
    case "kannada":
      return {
        voice: { provider: "11labs" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_v3" as const },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "kn" as const, smartFormat: true, endpointing: 200 },
      };
    case "telugu":
      return {
        voice: { provider: "11labs" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_v3" as const },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "te" as const, smartFormat: true, endpointing: 200 },
      };
    case "tamil":
      return {
        voice: { provider: "11labs" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_v3" as const },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "ta" as const, smartFormat: true, endpointing: 200 },
      };
    case "multilingual":
      return {
        voice: { provider: "11labs" as const, voiceId: "pFZP5JQG7iQjIQuC4Bku", model: "eleven_multilingual_v2" as const },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "multi" as const, smartFormat: true, endpointing: 200 },
      };
    case "spanish":
      return {
        voice: { provider: "vapi" as const, voiceId: "Lily" },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "es" as const, smartFormat: true, endpointing: 200 },
      };
    default:
      return {
        voice: { provider: "vapi" as const, voiceId: "Lily" },
        transcriber: { provider: "deepgram" as const, model: "nova-3", language: "en" as const, smartFormat: true, endpointing: 200 },
      };
  }
}

function buildVoice(override: Business["settings"]["model_config"], defaults: ReturnType<typeof voiceAndTranscriberFor>["voice"]): Record<string, unknown> {
  if (!override?.voiceProvider) return defaults;
  const voiceId = override.voiceId || ("voiceId" in defaults ? defaults.voiceId : "") || "Lily";
  return {
    provider: override.voiceProvider,
    voiceId,
    ...(override.voiceModel ? { model: override.voiceModel } : {}),
  };
}

function buildTranscriber(override: Business["settings"]["model_config"], defaults: ReturnType<typeof voiceAndTranscriberFor>["transcriber"]): Record<string, unknown> {
  if (!override?.transcriberProvider && !override?.transcriberModel && !override?.transcriberLanguage) return defaults;
  return {
    provider: override?.transcriberProvider || defaults.provider,
    model: override?.transcriberModel || defaults.model,
    language: override?.transcriberLanguage || defaults.language,
    smartFormat: true,
    endpointing: 200,
  };
}

// `demoToken` (from the demo-call-token function) is attached as a header on
// every request Vapi makes back to our functions — browser calls can't carry
// the real webhook secret, so this is how the tool endpoints trust them.
export function buildAssistantConfig(
  business: Business,
  supabaseUrl: string,
  opts: { demoToken?: string | null } = {},
) {
  const serverHeaders = opts.demoToken ? { "x-orvia-demo-token": opts.demoToken } : undefined;
  const defaults = voiceAndTranscriberFor(business.settings.language_preference);
  const override = business.settings.model_config;

  const voice = buildVoice(override, defaults.voice);
  const transcriber = buildTranscriber(override, defaults.transcriber);

  return {
    model: {
      provider: override?.llmProvider || "openai",
      model: override?.llmModel || "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(business),
      temperature: override?.temperature ?? 0.3,
      tools: buildTools(business, supabaseUrl, serverHeaders),
    },
    voice,
    transcriber,
    firstMessage: buildGreeting(business),
    endCallPhrases: [
      "talk to you later",
      "have a good day",
      "have a great day",
      "goodbye",
      "bye",
    ],
    server: {
      url: `${supabaseUrl}/functions/v1/vapi-events`,
      ...(serverHeaders ? { headers: serverHeaders } : {}),
    },
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 600,
    backgroundSound: "off" as const,
    // One tight sentence for the dashboard, instead of Vapi's default
    // paragraph ("The call began with..."). Mirrors the phone assistant.
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarise the call in ONE short sentence (max 14 words): who called, what they wanted, and the outcome. " +
              "Examples: \"Cleaning for Priya, booked Fri 10:30 AM.\" \"Asked about implant pricing, callback requested.\" " +
              "\"Hung up after the greeting.\" No preamble, no quotes, no dashes.",
          },
          { role: "user", content: "Transcript:\n\n{{transcript}}" },
        ],
      },
    },
  };
}

function buildGreeting(business: Business): string {
  return `Thanks for calling ${business.name}, how can I help you today?`;
}

function buildSystemPrompt(business: Business): string {
  const { settings } = business;
  const agentName = settings.receptionist_name || "Orvia";
  const langPref = settings.language_preference ?? "english";
  const languageLine =
    langPref === "spanish"
      ? "Respond in Spanish by default. If the caller speaks English, mirror them in English."
      : langPref === "hindi"
        ? "Respond in Hindi by default. If the caller speaks English, mirror them in English."
        : langPref === "kannada"
          ? "Respond in Kannada by default. If the caller speaks English or Hindi, mirror them."
          : langPref === "telugu"
            ? "Respond in Telugu by default. If the caller speaks English or Hindi, mirror them."
          : langPref === "tamil"
            ? "Respond in Tamil by default. If the caller speaks English or Hindi, mirror them."
          : langPref === "multilingual"
            ? "Detect the caller's language on their first turn and respond in that language — Hindi, Kannada, or English — for the rest of the call. Mirror code-switching naturally."
            : "Respond in English. If the caller speaks another language, briefly apologize and offer to transfer or take a callback.";

  const sections: string[] = [];

  const timezone = business.timezone || "America/Chicago";
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  sections.push(`# Right Now
Today is ${todayLabel}, ${timeLabel} (${timezone}). Today's date is ${todayIso}.
Resolve relative dates ("tomorrow", "Monday", "the 25th") from this yourself — don't ask the caller for the year. Always pass dates to tools as YYYY-MM-DD in the current year, never a past date.`);

  const niche = nicheOf(settings);
  const profile = niche ? NICHE_PROFILES[niche] : null;

  sections.push(`# Who You Are
You are ${agentName}, ${profile ? profile.role : "the AI receptionist"} for ${business.name}.
${settings.business_owner ? `The business is owned by ${settings.business_owner}.` : ""}
${settings.tagline ? `Their motto: "${settings.tagline}"` : ""}
Language: ${languageLine}
You sound like a real person who works at the front desk — warm, calm, efficient. Never robotic. Never a call center agent.
${settings.tone ? `Tone: ${settings.tone}.` : ""}`);

  sections.push(`# How You Speak
- Keep every reply to one or two short sentences. Real receptionists don't make speeches.
- Ask ONE question at a time. Never stack questions.
- Use contractions naturally — "I'll", "you're", "we've", "don't".
- Use the caller's first name once you have it.
- If you mishear, say "Sorry, could you repeat that?"
- If a caller is upset or in pain, acknowledge it first before moving to logistics.
- Mention near the start that the call may be recorded.`);

  if (settings.special_instructions?.length) {
    sections.push(`# Owner's Standing Instructions\n${settings.special_instructions.map((i) => `- ${i}`).join("\n")}`);
  }

  if (settings.service_details?.length) {
    sections.push(`# Services\n${buildServiceSection(settings.service_details, profile?.notBookableHint)}`);
  } else if (settings.services?.length) {
    sections.push(`# Services\nWe offer: ${settings.services.join(", ")}.`);
  }

  if (settings.faq?.length) {
    sections.push(`# Common Questions\n${buildFAQSection(settings.faq)}`);
  }

  sections.push(`# Hours\n${buildHoursSection(business)}`);

  if (settings.address) {
    sections.push(`# Location\nWe're at ${settings.address}${settings.landmark ? ` (${settings.landmark})` : ""}.`);
  }

  if (settings.service_area_zips?.length) {
    const city = settings.city ?? "our service area";
    sections.push(`# Service Area\nWe only serve: ${settings.service_area_zips.join(", ")} in ${city}. Always ask for ZIP code first.`);
  }

  if (profile) {
    sections.push(`# Workflows\n\n${profile.workflows(settings)}`);
    sections.push(`# Guardrails
- Never share another customer's information.
- Never argue. If a caller is upset and you can't resolve it, offer a callback from the owner or a manager.
${profile.guardrails.map((g) => `- ${g}`).join("\n")}`);
  } else {
    const emergencyDuring = settings.emergency_protocol?.during_hours ?? "Dispatch a technician same day.";
    const emergencyAfter = settings.emergency_protocol?.after_hours ?? "Take name, phone, and address. Tell them the on-call tech will call back within 30 minutes.";

    sections.push(`# Workflows

  ## Booking
  1. Ask ZIP code first — confirm we serve their area.
  2. Ask what service they need.
  3. Ask preferred date and time.
  4. Call check_availability to find open slots.
  5. Offer 2-3 slots in plain English.
  6. Get their full name and callback phone.
  7. Call book_appointment to confirm.
  8. Read it back: "You're all set — [service], [day] at [time]."

  ## Emergencies
  During hours: ${emergencyDuring}
  After hours: ${emergencyAfter}
  ${settings.emergency_protocol?.emergency_contact ? `Emergency contact: ${settings.emergency_protocol.emergency_contact}` : ""}

  ## Can't complete booking
  Call capture_lead. Tell the caller someone will call back within 30 minutes.`);

    sections.push(`# Guardrails
  - Never quote exact prices — always give a range.
  - Never share another customer's information.
  - Never argue. If a caller is upset, offer to have the owner call back.
  - Never book or capture a lead for someone outside the service area.`);
  }

  return sections.join("\n\n");
}

function buildServiceSection(services: BusinessService[], notBookableHint?: string): string {
  return services
    .map((s) => {
      const price = s.price_range ? ` Price range: ${s.price_range}.` : "";
      const booking = s.can_book_directly
        ? "Can book directly."
        : `${notBookableHint ?? "Needs a tech to assess first — book a free estimate."} ${s.note ?? ""}`.trim();
      const priority = s.priority === "high" ? " HIGH PRIORITY — try same day or next available." : "";
      return `- ${s.name}: ${s.description}. ~${s.duration_minutes} min.${price} ${booking}${priority}`;
    })
    .join("\n");
}

function buildFAQSection(faqs: BusinessFAQ[]): string {
  return faqs.map((f) => `Q: "${f.question}"\nA: ${f.answer}`).join("\n\n");
}

function buildHoursSection(business: Business): string {
  const { settings } = business;
  if (!settings.operating_hours) {
    return settings.hours ?? "Open Monday through Saturday, 7am to 7pm. Closed Sundays.";
  }
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return days.map((day) => {
    const h = settings.operating_hours?.[day];
    if (!h || h.closed) return `${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`;
    return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${h.open}–${h.close}`;
  }).join(", ");
}

function buildTools(business: Business, supabaseUrl: string, headers?: Record<string, string>) {
  const { settings } = business;
  const base = `${supabaseUrl}/functions/v1`;
  const server = (path: string) => ({ url: `${base}/${path}?business_id=${business.id}`, ...(headers ? { headers } : {}) });

  const tools: unknown[] = [
    {
      type: "function",
      function: {
        name: "capture_lead",
        description: "Save the caller's contact info when you can't complete a booking or they want a callback",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Caller's full name" },
            phone: { type: "string", description: "Caller's phone number (only if different from caller ID)" },
            service_needed: { type: "string", description: "What service they need" },
            urgency: {
              type: "string",
              enum: ["emergency", "urgent", "routine", "inquiry"],
              description: "How urgent the request is",
            },
            notes: { type: "string", description: "Any other relevant details" },
          },
          required: ["name", "service_needed", "urgency"],
        },
      },
      server: server("capture-lead"),
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Check available slots for a specific date. Call this before offering times.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date in YYYY-MM-DD format" },
            service_type: { type: "string", description: "Type of service (affects slot duration)" },
          },
          required: ["date"],
        },
      },
      server: server("check-availability"),
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book a confirmed appointment after the caller selects a slot",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Caller's full name" },
            customer_phone: { type: "string", description: "Caller's phone number" },
            service_type: { type: "string", description: "Type of service being booked" },
            slot: { type: "string", description: "ISO 8601 datetime of the appointment" },
            notes: { type: "string", description: "Any notes about the appointment" },
          },
          required: ["customer_name", "customer_phone", "service_type", "slot"],
        },
      },
      server: server("book-appointment"),
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
