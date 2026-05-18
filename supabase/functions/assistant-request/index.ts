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
  emergency_protocol?: { during_hours: string; after_hours: string };
  transfer_number?: string;
  notification_phone?: string;
  calendar_id?: string;
  calendar_provider?: "google";
  slot_duration_default?: number;
  buffer_between_appointments?: number;
  max_appointments_per_day?: number;
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
  const name = clinic.settings.receptionist_name || "Orvia";
  return `Thank you for calling ${clinic.name}. This is ${name}, how can I help you today?`;
}

function buildServiceSection(services: ClinicService[]): string {
  return services
    .map((s) => {
      let line = `- **${s.name}**: ${s.description}. Duration: ~${s.duration_minutes} min. Price range: ${s.price_range}.`;
      if (!s.can_book_directly) {
        line += ` ${s.note || "Requires consultation first - book a consultation appointment."}`;
      }
      if (s.priority === "high") {
        line += ` Priority: try to book same-day or next available.`;
      }
      return line;
    })
    .join("\n");
}

function buildFAQSection(faqs: ClinicFAQ[]): string {
  return faqs.map((f) => `Q: "${f.question}"\nA: ${f.answer}`).join("\n\n");
}

function buildHoursSection(clinic: Clinic): string {
  const { settings } = clinic;
  if (settings.operating_hours) {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
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

function buildSystemPrompt(clinic: Clinic): string {
  const { settings } = clinic;
  const name = settings.receptionist_name || "Orvia";
  const sections: string[] = [];

  sections.push(`# Who You Are
You are ${name}, the AI receptionist for ${clinic.name}.
${settings.doctor_name ? `The clinic is run by ${settings.doctor_name}.` : ""}
${settings.tagline ? `The clinic's motto: "${settings.tagline}"` : ""}
You are warm, professional, and reassuring. You sound like a real person who works at this clinic - not a robot, not a call center agent.`);

  sections.push(`# How You Speak
- Speak naturally in English. Use simple, clear sentences.
- Be conversational - use "sure", "absolutely", "of course", "no problem" naturally.
- Be empathetic - if someone mentions pain or discomfort, acknowledge it before moving to booking.
- Never sound scripted. Vary your phrasing.
- Keep responses SHORT - 1-2 sentences max per turn. Real receptionists don't give speeches.
- Ask ONE question at a time. Never stack multiple questions.
- Use the caller's name once you have it - "Sure Rahul, let me check that for you."
- If you don't understand something, say "Sorry, could you repeat that?" - not "I didn't comprehend your input."
- Mention this call may be recorded at the start.`);

  if (settings.special_instructions?.length) {
    sections.push(`# Special Instructions from the Clinic Owner\n${settings.special_instructions.map((i) => `- ${i}`).join("\n")}`);
  }

  if (settings.service_details?.length) {
    sections.push(`# Services Offered\n${buildServiceSection(settings.service_details)}`);
  } else if (settings.services?.length) {
    sections.push(`# Services Offered\nThe clinic offers: ${settings.services.join(", ")}.`);
  }

  if (settings.faq?.length) {
    sections.push(`# Common Questions\n${buildFAQSection(settings.faq)}`);
  }

  sections.push(`# Clinic Hours\n${buildHoursSection(clinic)}`);

  if (settings.address) {
    sections.push(`# Location\nThe clinic is located at: ${settings.address}${settings.landmark ? ` (${settings.landmark})` : ""}.`);
  }

  sections.push(`# How to Handle Calls

## Patient wants an appointment
1. Ask what service they need (if not already mentioned)
2. Ask their preferred date and time
3. Use the check_availability tool to find open slots
4. Offer available slots to the caller
5. Once they pick a slot, ask for their name and phone number
6. Use the book_appointment tool to confirm
7. Repeat the appointment details: "You're all set - [service] on [date] at [time] with ${settings.doctor_name || "the doctor"}."

## Patient asking about services or pricing
- Share the price RANGE, never an exact price. Say "typically ranges from" or "starts from".
- For complex treatments (braces, implants, root canal), always suggest a consultation first.

## Emergency or pain
${settings.emergency_protocol?.during_hours
  ? `During clinic hours: ${settings.emergency_protocol.during_hours}`
  : "During clinic hours: Try to book the next available slot today."}
${settings.emergency_protocol?.after_hours
  ? `After hours: ${settings.emergency_protocol.after_hours}`
  : "After hours: Take their details, assure them the clinic will call back first thing in the morning."}
${settings.emergency_number ? `For true emergencies, transfer to: ${settings.emergency_number}` : ""}

## Patient wants to talk to the doctor directly
Say the doctor is currently with a patient. Offer to book a callback or an appointment.

## Non-patient calls (vendors, sales, etc.)
Politely take a message. Do not book an appointment for non-patients.

## You can't complete a booking (system error, no slots)
Capture their lead information using capture_lead, and assure them someone will call back within 30 minutes.`);

  sections.push(`# What You Must NOT Do
- Never give medical advice. You are not a doctor.
- Never diagnose conditions based on symptoms.
- Never guarantee exact prices - always give ranges.
- Never share other patients' information.
- Never argue with a caller. If they're upset, empathize and offer to have the clinic owner call them.
- Never make promises the clinic can't keep (same-day for non-emergency, specific doctor availability).`);

  return sections.join("\n\n");
}

function buildTools(clinic: Clinic, n8nBaseUrl: string, webhookSecret: string) {
  const { settings } = clinic;

  const tools: unknown[] = [
    {
      type: "function",
      function: {
        name: "capture_lead",
        description: "Save the patient's contact information when you cannot complete a booking or they just want a callback",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Patient's full name" },
            phone: { type: "string", description: "Patient's phone number (only if different from caller ID)" },
            service_needed: { type: "string", description: "What dental service they need" },
            urgency: {
              type: "string",
              enum: ["emergency", "urgent", "routine", "inquiry"],
              description: "How urgent is the request",
            },
            notes: { type: "string", description: "Any other relevant details mentioned by the patient" },
          },
          required: ["name", "service_needed", "urgency"],
        },
      },
      server: { url: `${n8nBaseUrl}/webhook/capture-lead`, secret: webhookSecret },
    },
    {
      type: "function",
      function: {
        name: "check_availability",
        description: "Check available appointment slots for a specific date. Call this before offering slots to the patient.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
            service_type: { type: "string", description: "Type of service (affects slot duration)" },
          },
          required: ["date"],
        },
      },
      server: { url: `${n8nBaseUrl}/webhook/check-availability`, secret: webhookSecret },
    },
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Book a confirmed appointment after the patient has selected a slot",
        parameters: {
          type: "object",
          properties: {
            patient_name: { type: "string", description: "Patient's full name" },
            patient_phone: { type: "string", description: "Patient's phone number" },
            service_type: { type: "string", description: "Type of dental service" },
            slot: { type: "string", description: "ISO 8601 datetime of the appointment (e.g., 2026-03-21T14:30:00+05:30)" },
            notes: { type: "string", description: "Any notes about the appointment" },
          },
          required: ["patient_name", "patient_phone", "service_type", "slot"],
        },
      },
      server: { url: `${n8nBaseUrl}/webhook/book-appointment`, secret: webhookSecret },
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
          message: "One moment, let me connect you to the clinic directly.",
        },
      ],
    });
  }

  return tools;
}

function buildAssistantConfig(clinic: Clinic, n8nBaseUrl: string, webhookSecret: string) {
  return {
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: buildSystemPrompt(clinic),
      temperature: 0.3,
    },
    voice: {
      provider: "11labs",
      voiceId: "rachel",
    },
    firstMessage: buildGreeting(clinic),
    tools: buildTools(clinic, n8nBaseUrl, webhookSecret),
    endCallPhrases: ["goodbye", "bye", "thank you", "thanks", "that's all", "no more questions"],
    serverUrl: `${n8nBaseUrl}/webhook/vapi-events`,
    silenceTimeoutSeconds: 15,
    maxDurationSeconds: 300,
    backgroundSound: "off",
  };
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const n8nBaseUrl = Deno.env.get("N8N_BASE_URL") ?? "";
  const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET") ?? "";

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

  // Vapi sends phoneNumberId in the assistant-request payload
  const phoneNumberId =
    (body.phoneNumberId as string) ??
    ((body.call as Record<string, unknown>)?.phoneNumberId as string);

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

  const assistantConfig = buildAssistantConfig(clinic as Clinic, n8nBaseUrl, webhookSecret);

  return new Response(
    JSON.stringify({ assistant: assistantConfig }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
