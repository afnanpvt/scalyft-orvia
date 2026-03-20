import type { Clinic } from "@/lib/types";

export function buildAssistantConfig(
  clinic: Clinic,
  n8nBaseUrl: string,
  webhookSecret: string
) {
  const { settings } = clinic;

  return {
    model: {
      provider: "openai" as const,
      model: "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(clinic),
      temperature: 0.3,
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "rachel", // TODO: Replace with Hindi-capable voice ID after testing
    },
    firstMessage: `Namaste! ${clinic.name} mein aapka swagat hai. Main Orvia hoon, aapki kaise madad kar sakti hoon? Welcome to ${clinic.name}. I'm Orvia, how can I help you today?`,
    tools: [
      {
        type: "function" as const,
        function: {
          name: "capture_lead",
          description:
            "Capture the patient's contact information and service need",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Patient's full name",
              },
              phone: {
                type: "string",
                description:
                  "Patient's phone number (only if different from caller)",
              },
              service_needed: {
                type: "string",
                description: "What dental service they need",
              },
              urgency: {
                type: "string",
                enum: ["emergency", "urgent", "routine", "inquiry"],
                description: "How urgent is the request",
              },
              notes: {
                type: "string",
                description: "Any other relevant details",
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
            "Check available appointment slots for a given date",
          parameters: {
            type: "object",
            properties: {
              date: {
                type: "string",
                description: "Date to check in YYYY-MM-DD format",
              },
              service_type: {
                type: "string",
                description: "Type of dental service",
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
          description: "Book a confirmed appointment for the patient",
          parameters: {
            type: "object",
            properties: {
              patient_name: { type: "string" },
              patient_phone: { type: "string" },
              service_type: { type: "string" },
              slot: {
                type: "string",
                description: "ISO 8601 datetime of the appointment",
              },
            },
            required: [
              "patient_name",
              "patient_phone",
              "service_type",
              "slot",
            ],
          },
        },
        server: {
          url: `${n8nBaseUrl}/webhook/book-appointment`,
          secret: webhookSecret,
        },
      },
      {
        type: "transferCall" as const,
        destinations: [
          {
            type: "number" as const,
            number:
              settings.transfer_number ||
              settings.emergency_number ||
              "",
            message:
              "Ek minute, main aapko clinic se connect kar rahi hoon.",
          },
        ],
      },
    ],
    endCallPhrases: [
      "goodbye",
      "bye",
      "dhanyavaad",
      "shukriya",
      "bas itna hi",
      "thank you",
    ],
    serverUrl: `${n8nBaseUrl}/webhook/vapi-events`,
  };
}

function buildSystemPrompt(clinic: Clinic): string {
  const { settings } = clinic;
  const services =
    settings.services?.join(", ") || "general dental services";

  return [
    `You are Orvia, the AI receptionist for ${clinic.name}.`,
    `You speak Hindi and English fluently -- match the caller's language.`,
    `Your job: (1) Greet warmly, (2) Understand what the patient needs, (3) Book an appointment or capture their details using the provided tools, (4) For emergencies (severe pain, swelling, trauma), transfer immediately using transferCall.`,
    `Always mention this call may be recorded.`,
    `Clinic hours: ${settings.hours || "10am-7pm Mon-Sat"}.`,
    `Services offered: ${services}.`,
    `If you cannot complete a booking or the system is unavailable, reassure the caller that the clinic will call them back within 30 minutes.`,
    `Be warm, professional, and concise. Do not provide medical advice.`,
  ].join(" ");
}
