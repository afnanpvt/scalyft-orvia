import { GEMINI_MODELS, GEMINI_VOICES, DEFAULT_GEMINI_OPTIONS, type GeminiOptions, type ThinkingLevel, type EndSensitivity } from "@/lib/gemini/options"

// Spike-only controls for the Gemini Live engine. Locked while a call is live
// because the settings are applied once, when the session opens.

const fieldStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px", borderRadius: 10, fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)",
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, display: "block" }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.35 }}>{hint}</p>}
    </div>
  )
}

export function GeminiSettings({ value, onChange, locked, activeModel }: {
  value: GeminiOptions
  onChange: (v: GeminiOptions) => void
  locked: boolean
  // Model serving the current call, which differs from the chosen one after a fallback.
  activeModel?: string | null
}) {
  const set = <K extends keyof GeminiOptions>(k: K, v: GeminiOptions[K]) => onChange({ ...value, [k]: v })
  const model = GEMINI_MODELS.find(m => m.id === value.model)
  const live = activeModel ? GEMINI_MODELS.find(m => m.id === activeModel)?.label ?? activeModel : null
  const switched = !!activeModel && activeModel !== value.model

  return (
    <div className="ios-card" style={{ padding: "16px 18px", marginBottom: 16, opacity: locked ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Gemini settings{locked ? " · locked during call" : ""}
        </p>
        <button type="button" disabled={locked} onClick={() => onChange(DEFAULT_GEMINI_OPTIONS)}
          style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted-foreground)", background: "none", border: "none", cursor: locked ? "not-allowed" : "pointer" }}>
          Reset
        </button>
      </div>
      <fieldset disabled={locked} style={{ border: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <Field label="Model">
          <select style={fieldStyle} value={value.model} onChange={e => set("model", e.target.value)}>
            {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Voice">
          <select style={fieldStyle} value={value.voice} onChange={e => set("voice", e.target.value)}>
            {GEMINI_VOICES.map(([name, tone]) => <option key={name} value={name}>{name} · {tone}</option>)}
          </select>
        </Field>
        <Field label="Thinking" hint={model?.supportsThinkingLevel ? "Minimal is fastest." : "Not available on this model."}>
          <select style={fieldStyle} value={value.thinkingLevel} disabled={!model?.supportsThinkingLevel}
            onChange={e => set("thinkingLevel", e.target.value as ThinkingLevel)}>
            <option value="minimal">Minimal</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="End of turn" hint="High replies sooner but may cut callers off.">
          <select style={fieldStyle} value={value.endSensitivity} onChange={e => set("endSensitivity", e.target.value as EndSensitivity)}>
            <option value="default">Default</option>
            <option value="high">High (snappy)</option>
            <option value="low">Low (patient)</option>
          </select>
        </Field>
        <Field label="Silence before reply" hint="Short values split pauses like “ah… Monday” into two turns.">

          <select style={fieldStyle} value={value.silenceMs} onChange={e => set("silenceMs", Number(e.target.value))}>
            <option value={0}>Default</option>
            <option value={300}>300 ms</option>
            <option value={500}>500 ms</option>
            <option value={800}>800 ms</option>
            <option value={1200}>1200 ms</option>
          </select>
        </Field>
        <Field label="Tools" hint={value.toolMode === "simulated" ? "Instant. Bookings go to the spike calendar below." : "Supabase and Google Calendar. Slower."}>
          <select style={fieldStyle} value={value.toolMode} onChange={e => set("toolMode", e.target.value as GeminiOptions["toolMode"])}>
            <option value="simulated">Simulated</option>
            <option value="live">Real</option>
          </select>
        </Field>
        <Field label="Live caller transcript" hint="Word by word as the caller speaks.">
          <select style={fieldStyle} value={value.liveTranscript ? "on" : "off"} onChange={e => set("liveTranscript", e.target.value === "on")}>
            <option value="on">On</option>
            <option value="off">Off, per sentence</option>
          </select>
        </Field>
        <Field label="Caller can interrupt" hint="Turn off if the assistant cuts itself off on speakers.">
          <select style={fieldStyle} value={value.bargeIn ? "yes" : "no"} onChange={e => set("bargeIn", e.target.value === "yes")}>
            <option value="yes">Yes</option>
            <option value="no">No, mute mic while it talks</option>
          </select>
        </Field>
      </fieldset>
      {live && (
        <p style={{ fontSize: 11.5, marginTop: 12, color: switched ? "#B45309" : "var(--muted-foreground)" }}>
          {switched ? `Live on ${live}. Switched after ${model?.label ?? value.model} dropped the call.` : `Live on ${live}.`}
        </p>
      )}
    </div>
  )
}
