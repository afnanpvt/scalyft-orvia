import { useState, useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getBusinessSettings, updateBusinessSettings } from "@/lib/api"
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config"
import { useAuth } from "@/lib/auth"
import { TestCallButton } from "@/components/dashboard/test-call-button"
import type { BusinessSettings } from "@/lib/types"
import { ShieldAlert, ChevronDown, ChevronRight } from "lucide-react"

// Curated, not exhaustive — Vapi supports 35+ models across 16 providers.
// These are the ones worth offering here; "Custom" lets you type anything
// Vapi accepts even if it's not in the dropdown.
const LLM_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-5-mini", "gpt-5"],
  anthropic: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022", "claude-sonnet-4-20250514"],
  google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
}
const LLM_PROVIDERS = Object.keys(LLM_MODELS_BY_PROVIDER)

const VOICE_MODELS_BY_PROVIDER: Record<string, string[]> = {
  "11labs": ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5"],
  vapi: [],
  cartesia: ["sonic-2", "sonic-english"],
  playht: ["PlayHT2.0-turbo"],
  azure: [],
  "rime-ai": [],
}
const VOICE_PROVIDERS = Object.keys(VOICE_MODELS_BY_PROVIDER)

const TRANSCRIBER_MODELS_BY_PROVIDER: Record<string, string[]> = {
  deepgram: ["nova-2", "nova-3"],
  "assembly-ai": ["best", "nano"],
  azure: [],
}
const TRANSCRIBER_PROVIDERS = Object.keys(TRANSCRIBER_MODELS_BY_PROVIDER)
const TRANSCRIBER_LANGUAGES = ["en", "en-US", "es", "hi", "kn", "multi"]

type ModelConfig = NonNullable<BusinessSettings["model_config"]>

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5 }}>
      <span style={{ fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>{label}</span>
      {children}
    </label>
  )
}

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--foreground)", fontSize: 13, fontFamily: "inherit",
}
const inputStyle: React.CSSProperties = { ...selectStyle }

function Collapsible({ title, subtitle, children, defaultOpen }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <button
        type="button" onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
          padding: "12px 14px", background: "var(--card)", border: "none", cursor: "pointer",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        {subtitle && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{subtitle}</span>}
      </button>
      {open && <div style={{ borderTop: "1px solid var(--border)" }}>{children}</div>}
    </div>
  )
}

export default function AdminModelConfigPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: business } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettings })

  const [cfg, setCfg] = useState<ModelConfig>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (business?.settings.model_config) setCfg(business.settings.model_config)
  }, [business])

  const previewConfig = useMemo(() => {
    if (!business) return null
    const withOverride = { ...business, settings: { ...business.settings, model_config: cfg } }
    return buildAssistantConfig(withOverride, import.meta.env.VITE_SUPABASE_URL as string)
  }, [business, cfg])

  if (profile.role !== "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 20px", color: "var(--muted-foreground)" }}>
        <ShieldAlert size={28} strokeWidth={1.5} />
        <p style={{ fontSize: 14 }}>You don't have access to this page.</p>
      </div>
    )
  }

  async function handleSave() {
    if (!business) return
    setSaving(true); setError(null)
    const { error: e } = await updateBusinessSettings(business.id, { ...business.settings, model_config: cfg })
    setSaving(false)
    if (e) { setError(e); return }
    setSavedAt(Date.now())
    await queryClient.invalidateQueries({ queryKey: ["business-settings"] })
  }

  function handleReset() {
    setCfg({})
  }

  const llmModelOptions = LLM_MODELS_BY_PROVIDER[cfg.llmProvider || "openai"] ?? []
  const voiceModelOptions = VOICE_MODELS_BY_PROVIDER[cfg.voiceProvider || ""] ?? []
  const transcriberModelOptions = TRANSCRIBER_MODELS_BY_PROVIDER[cfg.transcriberProvider || ""] ?? []

  const model = previewConfig?.model as { systemPrompt?: string; tools?: unknown[] } | undefined
  const systemPrompt = model?.systemPrompt ?? ""
  const tools = model?.tools ?? []

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 880 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 4 }}>Assistant Model Config</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          Admin only. Overrides the LLM, voice, and transcriber for <strong>{business?.name ?? "this business"}</strong>.
          Leave a field blank to fall back to the language-based default.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
        <Field label="LLM Provider">
          <select style={selectStyle} value={cfg.llmProvider ?? ""} onChange={e => setCfg(c => ({ ...c, llmProvider: e.target.value || undefined, llmModel: undefined }))}>
            <option value="">Default (openai)</option>
            {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field label="LLM Model">
          {llmModelOptions.length > 0 ? (
            <select style={selectStyle} value={cfg.llmModel ?? ""} onChange={e => setCfg(c => ({ ...c, llmModel: e.target.value || undefined }))}>
              <option value="">Default (gpt-4o-mini)</option>
              {llmModelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input style={inputStyle} placeholder="model name" value={cfg.llmModel ?? ""} onChange={e => setCfg(c => ({ ...c, llmModel: e.target.value || undefined }))} />
          )}
        </Field>

        <Field label="Temperature">
          <input
            style={inputStyle}
            type="number" min={0} max={1} step={0.1}
            placeholder="0.3 (default)"
            value={cfg.temperature ?? ""}
            onChange={e => setCfg(c => ({ ...c, temperature: e.target.value === "" ? undefined : Number(e.target.value) }))}
          />
        </Field>

        <div />

        <Field label="Voice Provider">
          <select style={selectStyle} value={cfg.voiceProvider ?? ""} onChange={e => setCfg(c => ({ ...c, voiceProvider: e.target.value || undefined, voiceModel: undefined }))}>
            <option value="">Default (by language)</option>
            {VOICE_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field label="Voice ID">
          <input style={inputStyle} placeholder="e.g. pFZP5JQG7iQjIQuC4Bku" value={cfg.voiceId ?? ""} onChange={e => setCfg(c => ({ ...c, voiceId: e.target.value || undefined }))} />
        </Field>

        {voiceModelOptions.length > 0 && (
          <Field label="Voice Model">
            <select style={selectStyle} value={cfg.voiceModel ?? ""} onChange={e => setCfg(c => ({ ...c, voiceModel: e.target.value || undefined }))}>
              <option value="">Default</option>
              {voiceModelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        )}

        <Field label="Transcriber Provider">
          <select style={selectStyle} value={cfg.transcriberProvider ?? ""} onChange={e => setCfg(c => ({ ...c, transcriberProvider: e.target.value || undefined, transcriberModel: undefined }))}>
            <option value="">Default (by language)</option>
            {TRANSCRIBER_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        {transcriberModelOptions.length > 0 && (
          <Field label="Transcriber Model">
            <select style={selectStyle} value={cfg.transcriberModel ?? ""} onChange={e => setCfg(c => ({ ...c, transcriberModel: e.target.value || undefined }))}>
              <option value="">Default</option>
              {transcriberModelOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        )}

        <Field label="Transcriber Language">
          <select style={selectStyle} value={cfg.transcriberLanguage ?? ""} onChange={e => setCfg(c => ({ ...c, transcriberLanguage: e.target.value || undefined }))}>
            <option value="">Default (by language)</option>
            {TRANSCRIBER_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button" onClick={handleSave} disabled={saving || !business}
          style={{
            padding: "8px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: "var(--foreground)", color: "var(--background)", border: "none",
            cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save & Apply"}
        </button>
        <button type="button" onClick={handleReset} style={{ padding: "8px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer" }}>
          Reset to defaults
        </button>
        <TestCallButton />
        {savedAt && <span style={{ fontSize: 12, color: "#059669" }}>Saved. The next call uses this config.</span>}
        {error && <span style={{ fontSize: 12, color: "#DC2626" }}>{error}</span>}
      </div>

      <Collapsible title="System Prompt" subtitle={`${systemPrompt.length.toLocaleString()} chars · sent as model.systemPrompt`}>
        <pre style={{
          margin: 0, padding: 16, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", maxHeight: 420, overflowY: "auto",
        }}>
          {systemPrompt || "—"}
        </pre>
      </Collapsible>

      <Collapsible title="Tools" subtitle={`${tools.length} tool${tools.length === 1 ? "" : "s"} available to the assistant`}>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {tools.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>No tools configured.</span>}
          {tools.map((t, i) => {
            const tool = t as { type?: string; function?: { name?: string; description?: string }; destinations?: { number?: string }[] }
            const name = tool.function?.name || tool.type || `tool_${i}`
            const desc = tool.function?.description || (tool.type === "transferCall" ? `Transfers to ${tool.destinations?.[0]?.number ?? "configured number"}` : "")
            return (
              <div key={i} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{name}</div>
                {desc && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{desc}</div>}
              </div>
            )
          })}
        </div>
      </Collapsible>

      <Collapsible title="Full config sent to Vapi" subtitle="raw JSON">
        <pre style={{
          margin: 0, padding: 16, fontSize: 12, lineHeight: 1.6, overflowX: "auto", maxHeight: 500, overflowY: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}>
          {previewConfig ? JSON.stringify(previewConfig, null, 2) : "Loading…"}
        </pre>
      </Collapsible>
    </div>
  )
}
