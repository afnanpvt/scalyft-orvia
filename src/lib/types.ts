export interface Clinic {
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

export interface ClinicService {
  name: string;
  duration_minutes: number;
  price_range: string;
  description: string;
  can_book_directly: boolean;
  priority?: "high" | "normal";
  note?: string;
}

export interface ClinicFAQ {
  question: string;
  answer: string;
}

export interface ClinicSettings {
  // Basic info
  greeting?: string;
  doctor_name?: string;
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
  service_details?: ClinicService[];

  // FAQ the AI can answer
  faq?: ClinicFAQ[];

  // AI personality
  receptionist_name?: string;
  tone?: string;
  language_preference?: "english" | "hindi" | "bilingual";
  special_instructions?: string[];

  // Emergency
  emergency_number?: string;
  emergency_protocol?: {
    during_hours: string;
    after_hours: string;
  };

  // Notifications
  transfer_number?: string;
  notification_phone?: string;

  // Calendar
  calendar_id?: string;
  calendar_provider?: "google";
  slot_duration_default?: number;
  buffer_between_appointments?: number;
  max_appointments_per_day?: number;
}

export interface User {
  id: string;
  clinic_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff";
  created_at: string;
}

export interface Call {
  id: string;
  clinic_id: string;
  vapi_call_id: string | null;
  caller_phone: string | null;
  language_detected: "hi" | "en";
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
  clinic_id: string;
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
  clinic_id: string;
  lead_id: string | null;
  call_id: string | null;
  patient_name: string;
  patient_phone: string;
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
