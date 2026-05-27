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

  // AI personality
  receptionist_name?: string;
  tone?: string;
  language_preference?: "english" | "spanish" | "bilingual";
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
  calendar_id?: string;
  calendar_provider?: "google";
  slot_duration_default?: number;
  buffer_between_appointments?: number;
  max_appointments_per_day?: number;
}

export interface User {
  id: string;
  business_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff";
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
  created_at: string;
  is_repeat_caller?: boolean;
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
  urgency: "emergency" | "urgent" | "routine" | "inquiry";
  notes: string | null;
  status: "new" | "contacted" | "booked" | "closed" | "lost";
  created_at: string;
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
