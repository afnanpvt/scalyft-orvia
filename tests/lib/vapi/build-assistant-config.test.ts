import { describe, it, expect } from "vitest";
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config";
import type { Clinic } from "@/lib/types";

const mockClinic: Clinic = {
  id: "clinic-123",
  name: "Dr. Sharma's Dental Clinic",
  slug: "dr-sharma-dental",
  phone_display: "+919876543210",
  vapi_phone_id: "pn_xyz789",
  vapi_assistant_id: null,
  timezone: "Asia/Kolkata",
  settings: {
    greeting:
      "Namaste! Dr. Sharma's Dental Clinic mein aapka swagat hai.",
    hours: "Mon-Sat 10am-7pm",
    services: [
      "cleaning",
      "filling",
      "root canal",
      "extraction",
      "braces",
    ],
    languages: ["hi", "en"],
    emergency_number: "+919876543211",
    calendar_id: "abc123@group.calendar.google.com",
    transfer_number: "+919876543211",
  },
  status: "active",
  created_at: "2026-03-20T00:00:00Z",
  updated_at: "2026-03-20T00:00:00Z",
};

describe("buildAssistantConfig", () => {
  it("returns valid Vapi assistant config from clinic data", () => {
    const config = buildAssistantConfig(
      mockClinic,
      "https://n8n.example.com",
      "test-secret"
    );

    expect(config.model.provider).toBe("openai");
    expect(config.model.model).toBe("gpt-4o-mini");
    expect(config.model.temperature).toBe(0.3);
    expect(config.model.systemPrompt).toContain(
      "Dr. Sharma's Dental Clinic"
    );
    expect(config.model.systemPrompt).toContain("Mon-Sat 10am-7pm");
    expect(config.firstMessage).toContain(
      "Dr. Sharma's Dental Clinic"
    );
    expect(config.voice.provider).toBe("11labs");
  });

  it("includes all 3 function tools + transferCall", () => {
    const config = buildAssistantConfig(
      mockClinic,
      "https://n8n.example.com",
      "test-secret"
    );

    const functionTools = config.tools.filter(
      (t: any) => t.type === "function"
    );
    const transferTools = config.tools.filter(
      (t: any) => t.type === "transferCall"
    );

    expect(functionTools).toHaveLength(3);
    expect(transferTools).toHaveLength(1);

    const toolNames = functionTools.map(
      (t: any) => t.function.name
    );
    expect(toolNames).toContain("capture_lead");
    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
  });

  it("sets webhook URLs pointing to n8n with secret", () => {
    const config = buildAssistantConfig(
      mockClinic,
      "https://n8n.example.com",
      "test-secret"
    );

    const captureLead = config.tools.find(
      (t: any) =>
        t.type === "function" && t.function.name === "capture_lead"
    );
    expect(captureLead.server.url).toBe(
      "https://n8n.example.com/webhook/capture-lead"
    );
    expect(captureLead.server.secret).toBe("test-secret");
  });

  it("sets transfer number from clinic settings", () => {
    const config = buildAssistantConfig(
      mockClinic,
      "https://n8n.example.com",
      "test-secret"
    );

    const transfer = config.tools.find(
      (t: any) => t.type === "transferCall"
    );
    expect(transfer.destinations[0].number).toBe("+919876543211");
  });

  it("handles clinic with minimal settings", () => {
    const minimalClinic: Clinic = {
      ...mockClinic,
      settings: {},
    };

    const config = buildAssistantConfig(
      minimalClinic,
      "https://n8n.example.com",
      "secret"
    );

    expect(config.model.systemPrompt).toContain(
      "Dr. Sharma's Dental Clinic"
    );
    expect(config.model.systemPrompt).toContain(
      "10am-7pm Mon-Sat"
    );
    expect(config.firstMessage).toContain(
      "Dr. Sharma's Dental Clinic"
    );
  });
});
