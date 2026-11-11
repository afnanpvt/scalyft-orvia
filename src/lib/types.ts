export interface Business {
  id: string;
  name: string;
  slug: string;
  phone_display: string | null;
  vapi_phone_id: string | null;
  vapi_assistant_id: string | null;
  timezone: string;
  settings: BusinessSettings;
  status: "active" | "inactive" | "onboarding";
  seconds_remaining: number;
  allow_overage: boolean;
  owner_phone: string | null;
  plan: "trial" | "solo" | "pro" | "scale" | null;
  calls_included: number | null;
  overage_cap_calls: number;
  period_start: string | null;
  period_end: string | null;
  trade: "hvac" | "plumbing" | "electrical" | "other" | null;
  notification_email: string | null;
  billing_status: "trialing" | "active" | "past_due" | "canceled" | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessService {
  name: string;
  duration_minutes: number;
  price_range: string;
  description: string;
  can_book_directly: boolean;
  priority?: "high" | "normal";
  note?: string;
}

export interface BusinessFAQ {
  question: string;
  answer: string;
}

export interface BusinessSettings {
  // Basic info
  greeting?: string;
  business_owner?: string;
  tagline?: string;
  address?: string;
  landmark?: string;
  city?: string;

  // Operating hours per day
  hours?: string;
  operating_hours?: Record<
    string,
    { open: string; close: string; lunch_break?: string | null; closed?: boolean }
  >;

  // Services with full detail
  services?: string[];
  service_details?: BusinessService[];

  // FAQ the AI can answer
  faq?: BusinessFAQ[];

  // Industry playbook the AI follows (see src/lib/vapi/niche-profiles.ts).
  // Set from /admin/niche; unset = the original generic playbook.
  niche?: "dental" | "plumbing" | "hvac" | "real_estate" | "customer_support";
  // Region for generated demo data (names, phone formats). Admin demo only.
  demo_region?: "in" | "us";
  demo_autofill?: boolean;

  // AI personality
  receptionist_name?: string;
  tone?: string;
  language_preference?: "english" | "spanish" | "multilingual";
  trade?: string;
  after_hours_policy?: "transfer_then_capture" | "capture_only" | "book_next_day";
  transfer_during_hours?: boolean;
  emergency_keywords?: string[];
  intake_questions?: string[];
  recording_disclosure?: boolean;
  special_instructions?: string[];

  // Emergency
  emergency_number?: string;
  emergency_protocol?: {
    during_hours?: string;
    after_hours?: string;
    emergency_contact?: string;
  };

  // Notifications
  transfer_number?: string;
  notification_phone?: string;

  // Service area
  service_area_zips?: string[];

  // Calendar
  // "live": the AI checks real availability (hours, existing bookings, the
  // connected Google Calendar) and writes bookings to that calendar.
  // "simulated": demo mode — the AI always finds plausible openings and
  // bookings only land in the dashboard. Defaults to "live".
  scheduling_mode?: "live" | "simulated";
  calendar_id?: string;
  calendar_provider?: "google";
  slot_duration_default?: number;
  buffer_between_appointments?: number;
  max_appointments_per_day?: number;

  // Admin-only override of the exact model/voice/transcriber stack.
  // When present, buildAssistantConfig uses these instead of the
  // language-preference defaults. Set from /admin/model-config.
  model_config?: {
    llmProvider?: string;
    llmModel?: string;
    temperature?: number;
    voiceProvider?: string;
    voiceId?: string;
    voiceModel?: string;
    transcriberProvider?: string;
    transcriberModel?: string;
    transcriberLanguage?: string;
  };
}

export interface User {
  id: string;
  business_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff" | "viewer";
  created_at: string;
}

export interface Call {
  id: string;
  business_id: string;
  vapi_call_id: string | null;
  caller_phone: string | null;
  language_detected: "hi" | "en" | "es";
  status: "in_progress" | "completed" | "missed" | "failed" | "transferred";
  started_at: string | null;
  ended_at: string | null;
  duration_secs: number | null;
  transcript: TranscriptTurn[] | null;
  summary: string | null;
  recording_url: string | null;
  extracted_data: Record<string, unknown>;
  outcome:
    | "appointment_booked"
    | "lead_captured"
    | "info_given"
    | "transferred"
    | "missed"
    | null;
  cost_cents: number;
  cost_usd: number | null;
  owner_notified_at: string | null;
  transfer_attempted: boolean;
  transcript_status: "pending" | "complete" | "failed";
  ai_failure_reason: string | null;
  was_concurrent: boolean;
  webhook_received_at: string | null;
  created_at: string;
  is_repeat_caller?: boolean;
}

export interface OperationalEvent {
  id: string;
  business_id: string;
  call_id: string | null;
  event_type: "ai_failure" | "concurrent_call" | "partial_booking" | "transfer_unknown";
  severity: "critical" | "warning" | "info";
  resolved: boolean;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface CallQueueItem {
  id: string;
  business_id: string;
  call_id: string | null;
  queue_type: "missed_callback" | "partial_booking";
  priority: number;
  caller_phone: string | null;
  caller_name: string | null;
  service_needed: string | null;
  status: "pending" | "handled";
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

export interface TranscriptTurn {
  role: "assistant" | "user";
  content: string;
  timestamp?: number;
}

export interface Lead {
  id: string;
  business_id: string;
  call_id: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  service_needed: string | null;
  address: string | null;
  zip: string | null;
  urgency: "emergency" | "urgent" | "routine" | "inquiry";
  notes: string | null;
  status: "new" | "contacted" | "booked" | "closed" | "lost";
  created_at: string;
  updated_at: string;
}

export interface VapiAccount {
  id: string;
  label: string;
  public_key: string;
  private_key: string | null;
  balance_usd: number | null;
  status: "active" | "exhausted" | "disabled";
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarConnection {
  id: string;
  business_id: string;
  google_email: string | null;
  calendar_id: string;
  connected_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  lead_id: string | null;
  call_id: string | null;
  customer_name: string;
  customer_phone: string;
  service_type: string | null;
  address: string | null;
  zip: string | null;
  urgency: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  notes: string | null;
  status:
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show"
    | "rescheduled";
  google_cal_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageMonth {
  business_id: string;
  month: string;
  calls: number;
  seconds: number;
  minutes: number;
  cost_usd: number;
  cost_per_minute_usd: number | null;
}

export type Role = "owner" | "admin" | "staff" | "viewer";
export interface TeamMember { id: string; email: string; full_name: string | null; role: Role }
export interface PendingInvite { id: string; email: string; role: Exclude<Role, "owner">; expires_at: string }
export interface MyMembership { business_id: string; name: string; role: Role; is_active: boolean }
