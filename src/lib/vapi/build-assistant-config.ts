import type { Business, BusinessService, BusinessFAQ } from "@/lib/types";

export function buildAssistantConfig(
  business: Business,
  supabaseUrl: string,
) {
  return {
    model: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(business),
      temperature: 0.3,
    },
    voice: {
      provider: "vapi" as const,
      voiceId: "Savannah",
    },
    firstMessage: buildGreeting(business),
    tools: buildTools(business, supabaseUrl),
    endCallPhrases: [
      "talk to you later",
      "have a good day",
      "have a great day",
      "goodbye",
      "bye",
    ],
    serverUrl: `${supabaseUrl}/functions/v1/vapi-events`,
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 600,
    backgroundSound: "off" as const,
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
      : langPref === "bilingual"
        ? "Detect the caller's language on their first turn and respond in that language — English or Spanish — for the rest of the call."
        : "Respond in English. If the caller speaks Spanish, briefly apologize and offer to transfer or take a callback.";

  const sections: string[] = [];

  sections.push(`# Who You Are
You are ${agentName}, the AI receptionist for ${business.name}.
${settings.business_owner ? `The business is owned by ${settings.business_owner}.` : ""}
${settings.tagline ? `Their motto: "${settings.tagline}"` : ""}
Language: ${languageLine}
You sound like a real person who works at the front desk — warm, calm, efficient. Never robotic. Never a call center agent.`);

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
    sections.push(`# Services\n${buildServiceSection(settings.service_details)}`);
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

  return sections.join("\n\n");
}

function buildServiceSection(services: BusinessService[]): string {
  return services
    .map((s) => {
      const price = s.price_range ? ` Price range: ${s.price_range}.` : "";
      const booking = s.can_book_directly
        ? "Can book directly."
        : `Needs a tech to assess first — book a free estimate. ${s.note ?? ""}`.trim();
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

function buildTools(business: Business, supabaseUrl: string) {
  const { settings } = business;
  const base = `${supabaseUrl}/functions/v1`;

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
      server: { url: `${base}/capture-lead?business_id=${business.id}` },
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
      server: { url: `${base}/check-availability?business_id=${business.id}` },
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
      server: { url: `${base}/book-appointment?business_id=${business.id}` },
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
