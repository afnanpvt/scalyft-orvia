// Tunable settings for the Gemini Live spike. Chosen on the spike page and
// applied when a call starts; remembered in localStorage between visits.

export type ThinkingLevel = "minimal" | "low" | "medium" | "high"
export type EndSensitivity = "default" | "high" | "low"

export interface GeminiOptions {
  model: string
  voice: string
  // Only honoured by gemini-3.1-flash-live-preview; 3.8 doesn't accept it.
  thinkingLevel: ThinkingLevel
  // High ends the caller's turn sooner (snappier, but may cut people off).
  endSensitivity: EndSensitivity
  // Silence needed to end a turn. 0 = Gemini's default.
  silenceMs: number
  // false = mic is muted while the assistant talks. Stops it hearing itself
  // through laptop speakers, at the cost of the caller not being able to cut in.
  bargeIn: boolean
}

export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-live-preview", label: "Gemini 3.1 Flash Live (preview)", supportsThinkingLevel: true },
  { id: "gemini-3.8-live", label: "Gemini 3.8 Live", supportsThinkingLevel: false },
  { id: "gemini-3.8-live-extended-thinking", label: "Gemini 3.8 Live, extended thinking", supportsThinkingLevel: false },
  { id: "gemini-2.5-flash-native-audio-latest", label: "Gemini 2.5 Flash Native Audio", supportsThinkingLevel: false },
] as const

export const GEMINI_VOICES: Array<[string, string]> = [
  ["Zephyr", "Bright"], ["Puck", "Upbeat"], ["Charon", "Informative"], ["Kore", "Firm"],
  ["Fenrir", "Excitable"], ["Leda", "Youthful"], ["Orus", "Firm"], ["Aoede", "Breezy"],
  ["Callirrhoe", "Easy-going"], ["Autonoe", "Bright"], ["Enceladus", "Breathy"], ["Iapetus", "Clear"],
  ["Umbriel", "Easy-going"], ["Algieba", "Smooth"], ["Despina", "Smooth"], ["Erinome", "Clear"],
  ["Algenib", "Gravelly"], ["Rasalgethi", "Informative"], ["Laomedeia", "Upbeat"], ["Achernar", "Soft"],
  ["Alnilam", "Firm"], ["Schedar", "Even"], ["Gacrux", "Mature"], ["Pulcherrima", "Forward"],
  ["Achird", "Friendly"], ["Zubenelgenubi", "Casual"], ["Vindemiatrix", "Gentle"], ["Sadachbia", "Lively"],
  ["Sadaltager", "Knowledgeable"], ["Sulafat", "Warm"],
]

export const DEFAULT_GEMINI_OPTIONS: GeminiOptions = {
  model: "gemini-3.1-flash-live-preview",
  voice: "Kore",
  thinkingLevel: "minimal",
  endSensitivity: "default",
  silenceMs: 0,
  bargeIn: true,
}

const STORAGE_KEY = "orvia.geminiSpike.options"

export function loadGeminiOptions(): GeminiOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_GEMINI_OPTIONS, ...(JSON.parse(raw) as Partial<GeminiOptions>) }
  } catch { /* storage unavailable or corrupt: fall back to defaults */ }
  return DEFAULT_GEMINI_OPTIONS
}

export function saveGeminiOptions(opts: GeminiOptions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)) } catch { /* ignore */ }
}
