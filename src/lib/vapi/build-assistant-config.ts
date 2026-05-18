import type { Clinic, ClinicService, ClinicFAQ } from "@/lib/types";

export function buildAssistantConfig(
  clinic: Clinic,
  n8nBaseUrl: string,
  webhookSecret: string
) {
  const { settings } = clinic;
  const lang = settings.language_preference || "english";

  return {
    model: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(clinic),
      temperature: 0.3,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "rachel", // English-focused voice — revisit after voice testing
    },
    firstMessage: buildGreeting(clinic),
    tools: buildTools(clinic, n8nBaseUrl, webhookSecret),
    endCallPhrases: [
      "goodbye",
      "bye",
      "thank you",
      "thanks",
      "that's all",
      "no more questions",
    ],
    serverUrl: `${n8nBaseUrl}/webhook/vapi-events`,
    silenceTimeoutSeconds: 15,
    maxDurationSeconds: 300, // 5 min max per call
    backgroundSound: "off" as const,
  };
}

function buildGreeting(clinic: Clinic): string {
  const { settings } = clinic;
  const name = settings.receptionist_name || "Orvia";

  return `Thank you for calling ${clinic.name}. This is ${name}, how can I help you today?`;
}

function buildSystemPrompt(clinic: Clinic): string {
  const { settings } = clinic;
  const name = settings.receptionist_name || "Orvia";

  const sections: string[] = [];

  // ── Identity ──────────────────────────────────────────
  sections.push(`# Who You Are
You are ${name}, the AI receptionist for ${clinic.name}.
${settings.doctor_name ? `The clinic is run by ${settings.doctor_name}.` : ""}
${settings.tagline ? `The clinic's motto: "${settings.tagline}"` : ""}
You are warm, professional, and reassuring. You sound like a real person who works at this clinic — not a robot, not a call center agent.`);

  // ── Communication Style ───────────────────────────────
  sections.push(`# How You Speak
- Speak naturally in English. Use simple, clear sentences.
- Be conversational — use "sure", "absolutely", "of course", "no problem" naturally.
- Be empathetic — if someone mentions pain or discomfort, acknowledge it before moving to booking.
- Never sound scripted. Vary your phrasing.
- Keep responses SHORT — 1-2 sentences max per turn. Real receptionists don't give speeches.
- Ask ONE question at a time. Never stack multiple questions.
- Use the caller's name once you have it — "Sure Rahul, let me check that for you."
- If you don't understand something, say "Sorry, could you repeat that?" — not "I didn't comprehend your input."
- Mention this call may be recorded at the start.`);

  // ── Special instructions from clinic owner ────────────
  if (settings.special_instructions?.length) {
    sections.push(`# Special Instructions from the Clinic Owner
${settings.special_instructions.map((i) => `- ${i}`).join("\n")}`);
  }

  // ── Services ──────────────────────────────────────────
  if (settings.service_details?.length) {
    sections.push(
      `# Services Offered\n${buildServiceSection(settings.service_details)}`
    );
  } else if (settings.services?.length) {
    sections.push(
      `# Services Offered\nThe clinic offers: ${settings.services.join(", ")}.`
    );
  }

  // ── FAQ ────────────────────────────────────────────────
  if (settings.faq?.length) {
    sections.push(`# Common Questions\n${buildFAQSection(settings.faq)}`);
  }

  // ── Operating Hours ───────────────────────────────────
  sections.push(
    `# Clinic Hours\n${buildHoursSection(clinic)}`
  );

  // ── Location ──────────────────────────────────────────
  if (settings.address) {
    sections.push(
      `# Location\nThe clinic is located at: ${settings.address}${settings.landmark ? ` (${settings.landmark})` : ""}.`
    );
  }

  // ── Booking Rules ─────────────────────────────────────
  sections.push(`# How to Handle Calls

## Caller wants an appointment
1. Ask what service they need (if not already mentioned)
2. Ask for their zip code to confirm service area (if applicable)
3. Ask their preferred date and time
4. Use the check_availability tool to find open slots
5. Offer available slots to the caller
6. Once they pick a slot, ask for their name and phone number
7. Use the book_appointment tool to confirm
8. Repeat the booking details: "You're all set — [service] on [date] at [time]."

## Caller asking about services or pricing
- Share the price RANGE, never an exact price. Say "typically ranges from" or "starts from".
- For complex jobs requiring an on-site assessment, suggest booking a free estimate first.

## Emergency or pain
${settings.emergency_protocol?.during_hours
    ? `During clinic hours: ${settings.emergency_protocol.during_hours}`
    : "During clinic hours: Try to book the next available slot today."}
${settings.emergency_protocol?.after_hours
    ? `After hours: ${settings.emergency_protocol.after_hours}`
    : "After hours: Take their details, assure them the clinic will call back first thing in the morning."}
${settings.emergency_number ? `For true emergencies, transfer to: ${settings.emergency_number}` : ""}

## Caller wants to speak to the owner or manager directly
Say they are currently unavailable. Offer to book a callback or take a message.

## Non-customer calls (vendors, sales, etc.)
Politely take a message. Do not book a job for non-customers.

## You can't complete a booking (system error, no slots)
Capture their lead information using capture_lead, and assure them someone will call back within 30 minutes.`);

  // ── Boundaries ────────────────────────────────────────
  sections.push(`# What You Must NOT Do
- Never guarantee exact prices — always give ranges or say the technician will provide a free on-site estimate.
- Never share other customers' information.
- Never argue with a caller. If they're upset, empathize and offer to have the owner call them back.
- Never make promises the business can't keep (same-day for non-emergency, specific technician availability).
- Never confirm a booking outside the service area.`);

  return sections.join("\n\n");
}

function buildServiceSection(services: ClinicService[]): string {
  return services
    .map((s) => {
      let line = `- **${s.name}**: ${s.description}. Duration: ~${s.duration_minutes} min. Price range: ${s.price_range}.`;
      if (!s.can_book_directly) {
        line += ` ⚠️ ${s.note || "Requires consultation first — book a consultation appointment."}`;
      }
      if (s.priority === "high") {
        line += ` 🔴 Priority: try to book same-day or next available.`;
      }
      return line;
    })
    .join("\n");
}

function buildFAQSection(faqs: ClinicFAQ[]): string {
  return faqs
    .map((f) => `Q: "${f.question}"\nA: ${f.answer}`)
    .join("\n\n");
}

function buildHoursSection(clinic: Clinic): string {
  const { settings } = clinic;

  if (settings.operating_hours) {
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const lines = days.map((day) => {
      const h = settings.operating_hours?.[day];
      if (!h || h.closed) return `- ${capitalize(day)}: Closed`;
      let line = `- ${capitalize(day)}: ${h.open} - ${h.close}`;
      if (h.lunch_break) line += ` (lunch break: ${h.lunch_break})`;
      return line;
    });
    return lines.join("\n");
  }

  return `Clinic hours: ${settings.hours || "10am-7pm Mon-Sat, closed Sunday"}.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildTools(
  clinic: Clinic,
  n8nBaseUrl: string,
  webhookSecret: string
) {
  const { settings } = clinic;

  const tools: unknown[] = [
    {
      type: "function" as const,
      function: {
        name: "capture_lead",
        description:
          "Save the caller's contact information when you cannot complete a booking or they just want a callback",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Caller's full name",
            },
            phone: {
              type: "string",
              description:
                "Caller's phone number (only if different from caller ID)",
            },
            service_needed: {
              type: "string",
              description: "What service they need",
            },
            urgency: {
              type: "string",
              enum: ["emergency", "urgent", "routine", "inquiry"],
              description: "How urgent is the request",
            },
            notes: {
              type: "string",
              description: "Any other relevant details mentioned by the patient",
            },
          },
          required: ["name", "service_needed", "urgency"],
        },
      },
      server: {
        url: `${n8nBaseUrl}/webhook/capture-lead`,
        secret: webhookSecret,
      },
    },
    {
      type: "function" as const,
      function: {
        name: "check_availability",
        description:
          "Check available appointment slots for a specific date. Call this before offering slots to the patient.",
        parameters: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "Date to check in YYYY-MM-DD format",
            },
            service_type: {
              type: "string",
              description: "Type of service (affects slot duration)",
            },
          },
          required: ["date"],
        },
      },
      server: {
        url: `${n8nBaseUrl}/webhook/check-availability`,
        secret: webhookSecret,
      },
    },
    {
      type: "function" as const,
      function: {
        name: "book_appointment",
        description:
          "Book a confirmed appointment after the patient has selected a slot",
        parameters: {
          type: "object",
          properties: {
            patient_name: {
              type: "string",
              description: "Patient's full name",
            },
            patient_phone: {
              type: "string",
              description: "Patient's phone number",
            },
            service_type: {
              type: "string",
              description: "Type of dental service",
            },
            slot: {
              type: "string",
              description:
                "ISO 8601 datetime of the appointment (e.g., 2026-03-21T14:30:00+05:30)",
            },
            notes: {
              type: "string",
              description: "Any notes about the appointment",
            },
          },
          required: ["patient_name", "patient_phone", "service_type", "slot"],
        },
      },
      server: {
        url: `${n8nBaseUrl}/webhook/book-appointment`,
        secret: webhookSecret,
      },
    },
  ];

  // Add transfer call only if a transfer number is configured
  const transferNumber =
    settings.transfer_number || settings.emergency_number;
  if (transferNumber) {
    tools.push({
      type: "transferCall" as const,
      destinations: [
        {
          type: "number" as const,
          number: transferNumber,
          message:
            "One moment, let me connect you to the clinic directly.",
        },
      ],
    });
  }

  return tools;
}
