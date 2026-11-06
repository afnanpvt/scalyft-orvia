// Builds the Vapi assistant config that routes speech through this bridge.
// The LLM is OpenAI gpt-4o (default, reliable with tools) or Sarvam 105B through the bridge.

const COLLOQUIAL = {
  ta: "Speak everyday Chennai Tamil (பேச்சு வழக்கு) like a friendly local receptionist: நீங்க, வாங்க, சொல்லுங்க, இருக்கு, வேணும், சரி, ஓகே. English words people actually use (appointment, doctor, time, root canal, cleaning) stay English but written in Tamil script: அப்பாயின்மென்ட், டாக்டர், டைம்.",
  kn: "Speak everyday Bengaluru Kannada (ಆಡುಮಾತು) like a friendly local receptionist: ಹೇಳಿ, ಬನ್ನಿ, ಆಯ್ತು, ಬೇಕು, ಸರಿ, ಓಕೆ. English words people actually use (appointment, doctor, time, cleaning) stay English but written in Kannada script: ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್, ಡಾಕ್ಟರ್, ಟೈಮ್.",
  te: "Speak everyday Hyderabad Telugu (వ్యావహారిక భాష) like a friendly local receptionist: చెప్పండి, రండి, సరే, కావాలి, ఓకే. English words people actually use (appointment, doctor, time, cleaning) stay English but written in Telugu script: అపాయింట్‌మెంట్, డాక్టర్, టైమ్.",
  hi: "Speak casual Hinglish like a friendly receptionist in Delhi or Mumbai: बताइए, ठीक है, हाँ जी, चलिए. English words people actually use (appointment, doctor, time, cleaning) stay English but written in Devanagari: अपॉइंटमेंट, डॉक्टर, टाइम. Never shuddh Hindi.",
  en: "Speak natural, warm Indian English.",
};
const NAMES = { auto: "Auto-detect", kn: "Kannada", te: "Telugu", ta: "Tamil", hi: "Hindi", en: "English" };

function greeting(lang, clinic) {
  return {
    kn: `ನಮಸ್ಕಾರ, ${clinic}. ಹೇಳಿ, ಏನ್ ಸಹಾಯ ಬೇಕು?`,
    te: `నమస్కారం, ${clinic}. చెప్పండి, ఏం కావాలి?`,
    ta: `வணக்கம், ${clinic}. சொல்லுங்க, என்ன ஹெல்ப் வேணும்?`,
    hi: `नमस्ते, ${clinic}. बताइए, मैं आपकी क्या मदद कर सकती हूँ?`,
    en: `Hi, ${clinic}. How can I help you?`,
    auto: `Hi, ${clinic}. How can I help you?`,
  }[lang];
}

const WAIT_LINE = {
  ta: "ஒரு நிமிஷம், பார்க்கிறேன்.",
  kn: "ಒಂದು ನಿಮಿಷ, ನೋಡ್ತೀನಿ.",
  te: "ఒక్క నిమిషం, చూస్తాను.",
  hi: "एक मिनट, देखती हूँ.",
  en: "One moment, let me check.",
  auto: "One moment, let me check.",
};

// IST calendar, so "tomorrow" and weekdays match what a caller in India means.
function istCalendar(now = new Date()) {
  const fmt = (opts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ...opts });
  const day = (offset) => new Date(now.getTime() + offset * 86400000);
  const iso = (d) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const wd = (d) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  return { today: `${wd(day(0))} ${iso(day(0))}`, tomorrow: `${wd(day(1))} ${iso(day(1))}`, time };
}

function buildTools(publicUrl, token, lang) {
  const server = { url: `${publicUrl}/api/tools/${token}` };
  const wait = [{ type: "request-start", content: WAIT_LINE[lang] || WAIT_LINE.auto }];
  return [
    {
      type: "function",
      async: false,
      function: {
        name: "check_availability",
        description: "Check open appointment slots for a date. ALWAYS call this before you offer or promise any time.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date in YYYY-MM-DD format, worked out by you from today's date" },
            service_type: { type: "string", description: "Type of service" },
          },
          required: ["date"],
        },
      },
      messages: wait,
      server,
    },
    {
      type: "function",
      async: false,
      function: {
        name: "book_appointment",
        description: "Book the appointment once the caller has chosen one of the slots you got from check_availability and you have their name, phone number and the service.",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Caller's name" },
            customer_phone: { type: "string", description: "Caller's phone number, digits only" },
            service_type: { type: "string", description: "Service being booked, in English" },
            slot: { type: "string", description: "Exactly one value from slots returned by check_availability" },
            notes: { type: "string", description: "Anything else worth telling the dentist" },
          },
          required: ["customer_name", "customer_phone", "service_type", "slot"],
        },
      },
      messages: wait,
      server,
    },
  ];
}

function languageRules(lang) {
  const all = Object.entries(COLLOQUIAL)
    .map(([code, rule]) => `- ${NAMES[code]}: ${rule}`)
    .join("\n");
  if (lang === "auto") {
    return `You greeted in English. Reply in the language the caller speaks (Kannada, Telugu, Tamil, Hindi or English) and switch only if they clearly switch. If a message is too short to tell (a single word, a name, "yeah"), reply in English.
How to sound in each language:
${all}`;
  }
  return `Speak ${NAMES[lang]} for the whole call. Only switch if the caller clearly speaks a full sentence in another language.
${COLLOQUIAL[lang]}`;
}

function buildAssistant({ lang, publicUrl, token, llm = "openai", clinic = "Smile Dental Clinic" }) {
  if (!NAMES[lang]) throw new Error(`Unknown language "${lang}". Use auto, kn, te, ta, hi or en.`);

  const cal = istCalendar();
  const systemPrompt = `You are Priya, the receptionist at ${clinic}, a dental clinic in India. You are on a phone call.

# Language
${languageRules(lang)}
Write in the native script of the language you are speaking, never romanized. Write numbers, times and prices as words, not digits. Your text is read aloud by a speech engine.

# How to talk
- One short reply per turn: one sentence, at most two. Then stop and let the caller talk.
- Answer what they just said and move the conversation forward. Never restate what they told you.
- Never repeat something you already said in this call: no repeated sympathy, apologies or questions. Acknowledge pain once, briefly, then help.
- You already greeted them. Never greet again (no hello, vanakkam, namaskara, namaste).
- Only call the caller by name if they clearly said "my name is ...". Never guess a name from a word that sounds like one.
- If what they said is unclear or cut off, ask them to repeat it, in a few words.
- If they won't give a detail, accept it and offer another option. Don't ask for the same thing twice.
- Sound like a real person: vary your words, use small natural fillers sometimes (சரி, ಆಯ್ತು, సరే, अच्छा, okay).

# Ending the call
When the caller says bye, thanks-that's-all, or clearly wants to hang up, say one short warm goodbye sentence in their language, then the exact words "Bye bye." in English letters. Example: "சரிங்க, நாளைக்கு பார்க்கலாம். Bye bye." Only say "Bye bye." when the call is really ending.

# Clinic facts
- Open Monday to Saturday, 10 AM to 7 PM. Closed Sunday.
- Services: check-up, cleaning, fillings, root canal, braces, whitening, tooth pain consultation.
- Consultation fee about five hundred rupees.
- No medicine advice over the phone. For pain, offer the earliest slot today or tomorrow.

# Today
It is ${cal.time} IST. Today is ${cal.today}. Tomorrow is ${cal.tomorrow}. Work out dates from this yourself. Never ask the caller for a date in numbers.

# Booking (use the tools)
1. Find out what they need and which day suits them.
2. Call check_availability for that day. Never offer or promise a time without it.
3. Offer at most two of the returned times, spoken as normal times in the caller's language.
4. When they pick one, get their name, then their phone number (ask them to say the digits).
5. Call book_appointment with the exact slot value you got from check_availability.
6. After it succeeds, confirm day, time and name in one sentence and say an SMS will follow. If it fails, say sorry briefly and offer another slot.
If check_availability returns no slots or the clinic is closed, say so and suggest another day.`;

  const messages = [{ role: "system", content: systemPrompt }];
  const tools = buildTools(publicUrl, token, lang);
  return {
    name: `Sarvam PoC (${NAMES[lang]})`,
    firstMessage: greeting(lang, clinic),
    model:
      llm === "openai"
        ? { provider: "openai", model: "gpt-4o", temperature: 0.5, maxTokens: 200, messages, tools }
        : {
            provider: "custom-llm",
            url: `${publicUrl}/llm/${token}`,
            model: llm === "sarvam" ? "sarvam-105b" : "sarvam-105b-conversations",
            temperature: 0.5,
            maxTokens: 200,
            messages,
            tools,
          },
    transcriber: {
      provider: "custom-transcriber",
      server: { url: `${publicUrl.replace(/^http/, "ws")}/api/custom-transcriber?token=${token}&lang=${lang}&llm=${llm}` },
    },
    voice: {
      provider: "custom-voice",
      server: { url: `${publicUrl}/api/synthesize?token=${token}`, timeoutSeconds: 30 },
      // Send whole sentences to TTS, never comma fragments: each fragment resets the
      // intonation, which is a big part of what sounded robotic.
      chunkPlan: { enabled: true, minCharacters: 30, punctuationBoundaries: [".", "!", "?", "।"] },
    },
    // The assistant's "Bye bye." hangs up. The bridge already waits for the caller to
    // finish (VAD + merge), so Vapi's extra pre-speech wait can be short.
    endCallPhrases: ["bye bye"],
    startSpeakingPlan: { waitSeconds: 0.2 },
    // Vapi posts its own cost breakdown here after the call, for the cost panel.
    server: { url: `${publicUrl}/api/vapi-events/${token}` },
    serverMessages: ["end-of-call-report"],
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 300,
    backgroundSound: "off",
  };
}

module.exports = { buildAssistant, NAMES };
