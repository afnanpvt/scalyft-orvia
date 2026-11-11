// Conditional call-forwarding instructions for the customer's existing number.
// Conditional = only forward when unanswered / busy / unreachable (the shop still gets first ring).
// Carrier codes are the common GSM/CDMA MMI codes; always have the customer test with a second phone.

export function digits(num: string): string {
  const d = num.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export interface ForwardingInstructions {
  carrier: string;
  steps: string[];
  cancel: string;
}

export function forwardingInstructions(orviaNumber: string, ringSeconds = 20): ForwardingInstructions[] {
  const n = digits(orviaNumber);
  const rs = Math.min(30, Math.max(5, Math.round(ringSeconds / 5) * 5)); // GSM allows 5-30 in 5s steps
  return [
    {
      carrier: "AT&T / T-Mobile / most GSM carriers",
      steps: [
        `No answer: dial **61*1${n}**${rs}# then press Call`,
        `Busy: dial **67*1${n}# then press Call`,
        `Phone off / no signal: dial **62*1${n}# then press Call`,
      ],
      cancel: "Dial ##002# then press Call",
    },
    {
      carrier: "Verizon",
      steps: [
        `No answer + busy: dial *71${n} then press Call (wait for the confirmation tone)`,
      ],
      cancel: "Dial *73 then press Call",
    },
    {
      carrier: "Landline, VoIP, RingCentral, Google Voice, office phone system",
      steps: [
        `In the phone system's admin / "call forwarding" settings, set "forward when unanswered / busy" to (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}.`,
        "If it only offers 'forward all calls', set a ring-timeout of ~20 seconds with the AI line as the voicemail/overflow destination.",
      ],
      cancel: "Remove the forwarding rule in the same settings page.",
    },
  ];
}

export function forwardingText(orviaNumber: string, ringSeconds = 20): string {
  return forwardingInstructions(orviaNumber, ringSeconds)
    .map((c) => `${c.carrier}\n${c.steps.map((s) => `  - ${s}`).join("\n")}\n  To turn off: ${c.cancel}`)
    .join("\n\n") + "\n\nTest: call your own number from another phone, let it ring, and confirm Orvia answers.";
}
