import type { BusinessSettings } from "@/lib/types";
import type { Niche } from "@/lib/vapi/niche-profiles";

// Complete demo businesses, one per niche. Applying a preset from
// /admin/niche swaps the demo account's identity and business facts in one
// go; operational settings (model config, scheduling mode, calendar,
// autofill, notification numbers) are preserved — see OPERATIONAL_KEYS.

export interface NichePreset {
  id: Niche;
  label: string;
  pitch: string;
  businessName: string;
  settings: BusinessSettings;
}

const weekdays = (open: string, close: string, sat: [string, string] | null, sunday: [string, string] | null = null) => ({
  monday: { open, close }, tuesday: { open, close }, wednesday: { open, close },
  thursday: { open, close }, friday: { open, close },
  saturday: sat ? { open: sat[0], close: sat[1] } : { open: "09:00", close: "17:00", closed: true },
  sunday: sunday ? { open: sunday[0], close: sunday[1] } : { open: "09:00", close: "17:00", closed: true },
});

export const NICHE_PRESETS: NichePreset[] = [
  {
    id: "dental",
    label: "Dental clinic",
    pitch: "Books check-ups and cleanings, routes RCT and implants to a consult, handles pain emergencies.",
    businessName: "Smile Dental Clinic",
    settings: {
      niche: "dental",
      demo_region: "in",
      receptionist_name: "Priya",
      business_owner: "Dr. Rajesh Kumar",
      tagline: "Your trusted dental care in Bangalore - Affordable, Painless, Professional",
      tone: "warm, professional, reassuring, patient-focused",
      language_preference: "multilingual",
      address: "123 MG Road, Whitefield, Bangalore 560066",
      landmark: "Next to Axis Bank, above Cafe Coffee Day",
      city: "Bangalore, Karnataka",
      operating_hours: weekdays("09:00", "19:30", ["09:00", "14:00"]),
      service_details: [
        { name: "Consultation & Check-up", description: "Initial exam and diagnosis", price_range: "₹300-₹500", duration_minutes: 20, can_book_directly: true },
        { name: "Cleaning & Scaling", description: "Professional cleaning and plaque removal", price_range: "₹800-₹1200", duration_minutes: 30, can_book_directly: true },
        { name: "Root Canal Treatment", description: "Single or multi-sitting RCT", price_range: "₹5000-₹8000", duration_minutes: 60, can_book_directly: false, note: "Needs an X-ray and consult first" },
        { name: "Teeth Whitening", description: "In-clinic whitening treatment", price_range: "₹3000-₹6000", duration_minutes: 45, can_book_directly: true },
        { name: "Dental Implant", description: "Surgical implant placement", price_range: "₹25000-₹40000", duration_minutes: 90, can_book_directly: false, priority: "high", note: "Needs a consult and imaging first" },
      ],
      faq: [
        { question: "Do you accept insurance?", answer: "Yes, most major providers. Bring your card and we'll confirm coverage at the front desk." },
        { question: "Is there parking?", answer: "Yes, there's parking right outside the building." },
      ],
      emergency_protocol: {
        during_hours: "See emergency patients same day between scheduled appointments.",
        after_hours: "Take name, phone, and issue. Dr. Kumar calls back within an hour for urgent pain/trauma.",
        emergency_contact: "+91 9876543210",
      },
    },
  },
  {
    id: "plumbing",
    label: "Plumbing",
    pitch: "Qualifies by ZIP, triages burst pipes and leaks, books technician visits and free estimates.",
    businessName: "Lone Star Plumbing Co.",
    settings: {
      niche: "plumbing",
      demo_region: "us",
      receptionist_name: "Sarah",
      business_owner: "Jake Morrison",
      tagline: "Honest plumbing, on time, every time",
      tone: "friendly, calm and no-nonsense, like a local who's seen every leak there is",
      language_preference: "english",
      address: "4201 S Congress Ave, Austin, TX 78745",
      city: "Austin, TX",
      service_area_zips: ["78701", "78702", "78703", "78704", "78705", "78745", "78746", "78751"],
      operating_hours: weekdays("07:00", "19:00", ["08:00", "14:00"]),
      service_details: [
        { name: "Drain Cleaning", description: "Clogged sinks, tubs, showers and main lines", price_range: "$150-$350", duration_minutes: 60, can_book_directly: true },
        { name: "Water Heater Repair", description: "No hot water, leaks, pilot and element issues", price_range: "$200-$600", duration_minutes: 90, can_book_directly: true },
        { name: "Water Heater Replacement", description: "Tank and tankless installs", price_range: "$1,200-$2,800", duration_minutes: 180, can_book_directly: false, note: "Free on-site estimate first" },
        { name: "Leak Detection", description: "Hidden leaks, high water bills, slab leaks", price_range: "$150-$400", duration_minutes: 60, can_book_directly: true },
        { name: "Emergency Pipe Repair", description: "Burst or frozen pipes, active flooding", price_range: "$250-$800", duration_minutes: 90, can_book_directly: true, priority: "high" },
      ],
      faq: [
        { question: "Do you charge a trip fee?", answer: "There's a $79 service call fee, which is waived if you go ahead with the repair." },
        { question: "Are you licensed and insured?", answer: "Yes, fully licensed in Texas and insured, with a 1-year warranty on our work." },
      ],
      emergency_protocol: {
        during_hours: "Dispatch the next available technician today and move them to the front of the queue.",
        after_hours: "Take name, address and number. The on-call technician calls back within 15 minutes.",
        emergency_contact: "+1 (512) 555-0147",
      },
    },
  },
  {
    id: "hvac",
    label: "HVAC",
    pitch: "Heating vs cooling triage, safety-first on CO alarms, books repairs and free install estimates.",
    businessName: "Arctic Air Heating & Cooling",
    settings: {
      niche: "hvac",
      demo_region: "us",
      receptionist_name: "Megan",
      business_owner: "Carlos Rivera",
      tagline: "Comfort you can count on, all year round",
      tone: "upbeat, reassuring and efficient, especially when it's 110° outside",
      language_preference: "english",
      address: "2150 E Camelback Rd, Phoenix, AZ 85016",
      city: "Phoenix, AZ",
      service_area_zips: ["85004", "85006", "85008", "85012", "85014", "85016", "85018", "85251"],
      operating_hours: weekdays("07:00", "20:00", ["08:00", "16:00"]),
      service_details: [
        { name: "AC Tune-Up", description: "Seasonal inspection, cleaning and refrigerant check", price_range: "$89-$149", duration_minutes: 60, can_book_directly: true },
        { name: "AC Repair", description: "Not cooling, warm air, noises, leaks", price_range: "$150-$650", duration_minutes: 90, can_book_directly: true, priority: "high" },
        { name: "Furnace Repair", description: "No heat, short cycling, pilot issues", price_range: "$150-$550", duration_minutes: 90, can_book_directly: true },
        { name: "New System Installation", description: "Full AC or heat pump replacement", price_range: "$5,500-$12,000", duration_minutes: 480, can_book_directly: false, note: "Free in-home estimate first" },
        { name: "Duct Cleaning", description: "Whole-home duct cleaning and sanitising", price_range: "$300-$500", duration_minutes: 120, can_book_directly: true },
      ],
      faq: [
        { question: "Do you offer financing?", answer: "Yes, 0% financing for 18 months on new systems for qualified buyers." },
        { question: "Do you have a maintenance plan?", answer: "Our Comfort Club is $15 a month: two tune-ups a year and priority scheduling." },
      ],
      emergency_protocol: {
        during_hours: "Same-day priority visit for no cooling above 100°F or no heat below freezing.",
        after_hours: "Take details; the on-call technician calls back within 15 minutes.",
        emergency_contact: "+1 (602) 555-0182",
      },
    },
  },
  {
    id: "real_estate",
    label: "Real estate",
    pitch: "Qualifies buyers, renters and sellers, books viewings and free valuations, routes offers to agents.",
    businessName: "Summit Realty Group",
    settings: {
      niche: "real_estate",
      demo_region: "us",
      receptionist_name: "Emma",
      business_owner: "Rachel Nguyen",
      tagline: "Finding Dallas homes for Dallas people",
      tone: "polished, warm and genuinely excited about helping people find a home",
      language_preference: "english",
      address: "3500 Maple Ave, Suite 400, Dallas, TX 75219",
      city: "Dallas, TX",
      operating_hours: weekdays("09:00", "18:00", ["10:00", "16:00"], ["12:00", "16:00"]),
      service_details: [
        { name: "Property Viewing", description: "Tour a listed home with an agent", price_range: "Free", duration_minutes: 30, can_book_directly: true },
        { name: "Buyer Consultation", description: "Plan your search, budget and pre-approval", price_range: "Free", duration_minutes: 45, can_book_directly: true },
        { name: "Home Valuation", description: "Free market valuation of your property", price_range: "Free", duration_minutes: 60, can_book_directly: true },
        { name: "Listing Consultation", description: "Selling strategy and listing plan", price_range: "Free", duration_minutes: 60, can_book_directly: false, note: "A listing agent calls to prepare first" },
        { name: "Rental Inquiry", description: "Questions about rental listings", price_range: "Free", duration_minutes: 20, can_book_directly: true },
      ],
      faq: [
        { question: "What's your commission?", answer: "It depends on the property and services. Your agent will walk you through it in the consultation." },
        { question: "Do you help with mortgages?", answer: "We work with trusted local lenders and can introduce you during your buyer consultation." },
      ],
    },
  },
  {
    id: "customer_support",
    label: "Customer support",
    pitch: "Tier-1 support: troubleshoots basics, books technician visits, escalates billing and outages.",
    businessName: "Nimbus Fiber Internet",
    settings: {
      niche: "customer_support",
      demo_region: "us",
      receptionist_name: "Alex",
      business_owner: "Nimbus Customer Care",
      tagline: "Fast internet, faster help",
      tone: "patient, clear and solution-focused, never scripted",
      language_preference: "english",
      address: "800 Congress Ave, Austin, TX 78701",
      city: "Austin, TX",
      operating_hours: weekdays("07:00", "22:00", ["08:00", "20:00"], ["08:00", "20:00"]),
      service_details: [
        { name: "Technician Visit", description: "In-home fix for wiring, router or signal issues", price_range: "$0-$99", duration_minutes: 60, can_book_directly: true },
        { name: "Router Setup Help", description: "Guided setup or replacement router install", price_range: "Free", duration_minutes: 30, can_book_directly: true },
        { name: "Plan Upgrade Consultation", description: "Faster speeds and bundle options", price_range: "Free", duration_minutes: 20, can_book_directly: true },
        { name: "Billing Review", description: "Charges, refunds and payment plans", price_range: "Free", duration_minutes: 20, can_book_directly: false, note: "The billing team calls back within 2 hours" },
        { name: "Outage Report", description: "Service down in your area", price_range: "Free", duration_minutes: 15, can_book_directly: false, priority: "high", note: "Logged for the network team" },
      ],
      faq: [
        { question: "Is there an outage in my area?", answer: "I can log it and check with the network team. Can I get your address?" },
        { question: "How do I reset my Wi-Fi password?", answer: "Log into the Nimbus app, go to Wi-Fi settings and tap Change password." },
      ],
    },
  },
];

// Settings that belong to how the account is operated, not which business it
// pretends to be — carried over untouched when a preset is applied.
export const OPERATIONAL_KEYS: (keyof BusinessSettings)[] = [
  "model_config",
  "scheduling_mode",
  "demo_autofill",
  "notification_phone",
  "transfer_number",
  "calendar_id",
  "calendar_provider",
  "slot_duration_default",
  "buffer_between_appointments",
  "max_appointments_per_day",
];

export function applyPresetSettings(current: BusinessSettings, preset: NichePreset): BusinessSettings {
  const kept: Partial<BusinessSettings> = {};
  for (const key of OPERATIONAL_KEYS) {
    if (current[key] !== undefined) (kept as Record<string, unknown>)[key] = current[key];
  }
  return { ...preset.settings, ...kept };
}
