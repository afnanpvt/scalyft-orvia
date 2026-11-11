// Trade templates for US home services. Used by the prompt builder (emergency
// definitions + intake questions) and by onboarding (default services/FAQ).

export type Trade = "hvac" | "plumbing" | "electrical" | "other";

export interface TradeTemplate {
  label: string;
  emergencies: string[];       // what counts as an emergency for this trade
  safetyLines: string[];       // safety instruction spoken to the caller on an emergency
  intake: string[];            // trade-specific questions to ask after the basics
  services: {
    name: string; duration_minutes: number; price_range: string;
    description: string; can_book_directly: boolean; priority?: "high" | "normal"; note?: string;
  }[];
  faq: { question: string; answer: string }[];
}

export const TRADES: Record<Trade, TradeTemplate> = {
  hvac: {
    label: "HVAC",
    emergencies: [
      "no cooling when it is over 90F or no heat when it is under 40F, especially with kids, elderly or pets in the home",
      "smell of gas or burning, carbon monoxide alarm going off",
      "water leaking from the unit or ceiling, sparking or smoke from the unit",
    ],
    safetyLines: [
      "If you smell gas or a CO alarm is going off, leave the house now and call 911 from outside. Do not touch switches.",
    ],
    intake: [
      "Is it the heating or the cooling that's out?",
      "Do you know roughly how old the system is, and the brand?",
      "Is the unit running at all, or completely dead? Any strange noises or smells?",
      "Is it a house, condo, or commercial space?",
    ],
    services: [
      { name: "AC repair", duration_minutes: 90, price_range: "100-150 diagnostic, repairs 150-600", description: "Diagnose and repair cooling problems", can_book_directly: true, priority: "high" },
      { name: "Heating repair", duration_minutes: 90, price_range: "100-150 diagnostic, repairs 150-600", description: "Furnace and heat pump repair", can_book_directly: true, priority: "high" },
      { name: "Tune-up / maintenance", duration_minutes: 60, price_range: "89-149", description: "Seasonal system inspection and cleaning", can_book_directly: true },
      { name: "System replacement estimate", duration_minutes: 60, price_range: "free estimate", description: "On-site quote for a new system", can_book_directly: false, note: "Free in-home estimate." },
    ],
    faq: [
      { question: "Do you charge a diagnostic fee?", answer: "There is a diagnostic fee that is applied toward the repair if you go ahead. The tech will confirm it on arrival." },
    ],
  },
  plumbing: {
    label: "Plumbing",
    emergencies: [
      "burst or leaking pipe, active flooding, water coming through a ceiling",
      "sewage backup or no water at all to the house",
      "gas smell near a water heater or gas line",
      "no hot water for elderly or infants, water heater leaking",
    ],
    safetyLines: [
      "If you can, shut the main water valve now, usually near the street or where the water line enters the house. If you smell gas, leave and call 911 from outside.",
    ],
    intake: [
      "Where in the house is the problem - kitchen, bathroom, basement, outside?",
      "Is water actively leaking right now, and can you shut off the water to that fixture or the main?",
      "How long has it been going on?",
      "Do you rent or own? (for access / landlord approval)",
    ],
    services: [
      { name: "Drain cleaning", duration_minutes: 90, price_range: "95-300", description: "Clear clogged sinks, tubs, and main lines", can_book_directly: true },
      { name: "Leak repair", duration_minutes: 90, price_range: "150-500", description: "Find and fix leaking pipes and fixtures", can_book_directly: true, priority: "high" },
      { name: "Water heater repair / replace", duration_minutes: 120, price_range: "200-400 repair, 1000-1800 replace", description: "Tank and tankless water heaters", can_book_directly: true, priority: "high" },
      { name: "Fixture install", duration_minutes: 60, price_range: "120-350", description: "Faucets, toilets, disposals", can_book_directly: true },
    ],
    faq: [
      { question: "Do you do same-day service?", answer: "We try to. Leaks and no-water calls get priority and we'll get a tech to you as soon as one is free." },
    ],
  },
  electrical: {
    label: "Electrical",
    emergencies: [
      "sparks, burning smell, smoke, or a hot or melted outlet or panel",
      "partial or total power loss with a buzzing panel, or a downed or arcing service line",
      "water in the panel or on electrical equipment",
    ],
    safetyLines: [
      "If you see smoke or fire, get everyone out and call 911. Don't touch the panel or anything wet near electrical.",
    ],
    intake: [
      "Is it one outlet or circuit, or the whole house or panel?",
      "Any burning smell, sparks, buzzing, or a breaker that keeps tripping?",
      "Roughly how old is the home or the panel?",
      "Is this for a repair or a new install - EV charger, panel upgrade, lighting?",
    ],
    services: [
      { name: "Electrical troubleshooting", duration_minutes: 90, price_range: "100-150 diagnostic, repairs 150-600", description: "Dead outlets, tripping breakers, flickering lights", can_book_directly: true, priority: "high" },
      { name: "Outlet / switch / fixture install", duration_minutes: 60, price_range: "120-350", description: "Replacements and new installs", can_book_directly: true },
      { name: "EV charger install", duration_minutes: 180, price_range: "free estimate", description: "Level 2 home charger installation", can_book_directly: false, note: "Free on-site estimate." },
      { name: "Panel upgrade estimate", duration_minutes: 60, price_range: "free estimate", description: "Panel replacement or capacity upgrade", can_book_directly: false, note: "Free on-site estimate." },
    ],
    faq: [
      { question: "Are you licensed and insured?", answer: "Yes, fully licensed and insured." },
    ],
  },
  other: {
    label: "Home services",
    emergencies: ["any situation that is unsafe or is actively damaging the home"],
    safetyLines: ["If anyone is in danger, call 911 first."],
    intake: ["Can you describe the problem and where in the home it is?", "How long has it been happening?"],
    services: [],
    faq: [],
  },
};

export function tradeOf(t: string | null | undefined): Trade {
  return t === "hvac" || t === "plumbing" || t === "electrical" ? t : "other";
}

/** Rough US two-party (all-party) recording-consent states. We disclose on EVERY call regardless;
 *  this list is only used to word the disclosure more strongly and for onboarding warnings. */
export const ALL_PARTY_CONSENT_STATES = new Set([
  "CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA",
]);
