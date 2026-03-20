import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Direct Supabase client (not the SSR cookie-based one).
// This endpoint is called by Vapi, not by a browser — no cookies needed.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract phone number ID from Vapi's assistant-request payload
    const phoneNumberId = body?.message?.call?.phoneNumberId;
    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "Missing phoneNumberId" },
        { status: 400 }
      );
    }

    // Lookup clinic by Vapi phone ID
    const supabase = getServiceClient();
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("vapi_phone_id", phoneNumberId)
      .eq("status", "active")
      .single();

    if (error || !clinic) {
      console.error(
        "Clinic not found for phoneNumberId:",
        phoneNumberId,
        error
      );
      return NextResponse.json(
        { error: "Clinic not found" },
        { status: 404 }
      );
    }

    // Build and return assistant config
    const n8nBaseUrl =
      process.env.N8N_BASE_URL || "https://n8n.railway.app";
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "";

    const assistantConfig = buildAssistantConfig(
      clinic,
      n8nBaseUrl,
      webhookSecret
    );

    return NextResponse.json(assistantConfig);
  } catch (err) {
    console.error("assistant-request error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
