import { useState, useEffect, useCallback, useMemo, Fragment } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Sun, Moon, Monitor, Check, Building2, Wrench, Bot, ShieldCheck, Sliders } from "lucide-react"

import { getBusinessSettings, updateBusinessSettings, updateBusinessTopLevel } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme, type Theme } from "@/lib/theme"
import type { Business, BusinessSettings as BusinessSettingsType, BusinessService, BusinessFAQ } from "@/lib/types"

// ─── Constants ─────────────────────────────────────────

const TABS = [
  { id: "Business Info",  label: "Business",   icon: Building2,   group: "business" },
  { id: "Services",       label: "Services",   icon: Wrench,      group: "business" },
  { id: "AI Assistant",   label: "AI",         icon: Bot,         group: "business" },
  { id: "Profile",        label: "Profile",    icon: ShieldCheck, group: "account" },
  { id: "Preferences",    label: "Appearance", icon: Sliders,     group: "account" },
] as const
type Tab = (typeof TABS)[number]["id"]
type TabGroup = (typeof TABS)[number]["group"]

const GROUP_LABELS: Record<TabGroup, string> = {
  business: "Business",
  account: "Your account",
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
}
const LANGUAGE_OPTIONS = [
  { value: "english",      label: "English" },
  { value: "spanish",      label: "Spanish" },
  { value: "hindi",        label: "Hindi" },
  { value: "kannada",      label: "Kannada" },
  { value: "multilingual", label: "Multilingual (Hindi + Kannada + English)" },
] as const

// ─── Style tokens ──────────────────────────────────────

const S = {
  label:    "block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5",
  hint:     "text-xs text-muted-foreground mt-1.5 leading-relaxed opacity-80",
  input:    "w-full bg-transparent border-0 border-b-2 border-border px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none transition-colors",
  textarea: "w-full bg-transparent border-0 border-b-2 border-border px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none transition-colors resize-none",
  timeInput:"bg-transparent border-0 border-b-2 border-border px-0 py-2 text-sm tabular-nums text-foreground focus:border-foreground focus:outline-none transition-colors",
  section:  "text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4",
  addBtn:   "flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors",
  removeBtn:"text-xs text-red-500/70 hover:text-red-500 cursor-pointer transition-colors font-medium",
  card:     "bg-card rounded-2xl border border-border p-5",
  saveBtn:  "h-9 px-5 rounded-xl bg-foreground text-background text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center gap-1.5",
}

// ─── Helpers ───────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function defaultOperatingHours() {
  const result: Record<string, { open: string; close: string; closed?: boolean }> = {}
  for (const day of DAY_ORDER) {
    result[day] = day === "sunday"
      ? { open: "09:00", close: "17:00", closed: true }
      : { open: "09:00", close: "18:00", closed: false }
  }
  return result
}

function emptyService(): BusinessService {
  return { name: "", duration_minutes: 30, price_range: "", description: "", can_book_directly: true, note: "" }
}

function emptyFAQ(): BusinessFAQ {
  return { question: "", answer: "" }
}

// ─── Sub-components ────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className={S.section}>{children}</p>
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={S.label}>{label}</label>
      {children}
      {hint && <p className={S.hint}>{hint}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    active:     { bg: "#D1FAE5", color: "#065F46" },
    inactive:   { bg: "#FEE2E2", color: "#991B1B" },
    onboarding: { bg: "#FEF3C7", color: "#92400E" },
  }
  const s = map[status] ?? { bg: "var(--muted)", color: "var(--muted-foreground)" }
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
      {status}
    </span>
  )
}

function ConfirmRemoveButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  if (confirming) return (
    <button type="button" onClick={onConfirm} className="text-xs text-red-500 font-semibold cursor-pointer">
      Confirm remove?
    </button>
  )
  return <button type="button" onClick={() => setConfirming(true)} className={S.removeBtn}>{label}</button>
}

function CardSkeleton() {
  return (
    <div className="space-y-3 mt-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`${S.card} flex items-center justify-between`}>
          <div className="h-3 w-28 bg-foreground/8 animate-pulse rounded" />
          <div className="h-3 w-40 bg-foreground/8 animate-pulse rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Save bar ──────────────────────────────────────────

function SaveBar({ dirty, saving, success, error, onSave }: {
  dirty: boolean; saving: boolean; success: boolean; error: string | null; onSave: () => void
}) {
  const show = dirty || success || !!error
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      transform: show ? "translateY(0)" : "translateY(100%)",
      transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{
        background: "#0A0A0B", borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {dirty && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Unsaved changes</span>}
          {success && <span style={{ fontSize: 13, color: "#6EE7B7" }}>Saved - applies to next call</span>}
          {error && <span style={{ fontSize: 13, color: "#FCA5A5" }}>{error}</span>}
        </div>
        {dirty && (
          <button type="button" onClick={onSave} disabled={saving} className={S.saveBtn}
            style={{ background: "#FFFFFF", color: "#0A0A0B" }}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Business Info Tab ─────────────────────────────────

function BusinessInfoTab({ clinic, settings, phoneDisplay, onSettingsChange, onPhoneDisplayChange }: {
  clinic: Business
  settings: BusinessSettingsType
  phoneDisplay: string
  onSettingsChange: (patch: Partial<BusinessSettingsType>) => void
  onPhoneDisplayChange: (v: string) => void
  dirty: boolean; saving: boolean; success: boolean; error: string | null; onSave: () => void
}) {
  const hours = settings.operating_hours ?? defaultOperatingHours()

  function updateHour(day: string, field: "open" | "close", value: string) {
    const updated = deepClone(hours)
    updated[day] = { ...updated[day], [field]: value }
    onSettingsChange({ operating_hours: updated })
  }

  function toggleClosed(day: string) {
    const updated = deepClone(hours)
    updated[day] = { ...updated[day], closed: !updated[day].closed }
    onSettingsChange({ operating_hours: updated })
  }

  return (
    <div className="space-y-8 mt-6">
      <div className={S.card}>
        <SectionHeading>General</SectionHeading>
        <div className="space-y-6">
          <FieldGroup label="Owner / Manager Name">
            <input type="text" value={settings.business_owner ?? ""} onChange={e => onSettingsChange({ business_owner: e.target.value })}
              placeholder="John Smith" className={S.input} />
          </FieldGroup>

          <FieldGroup label="Business Name">
            <div className="py-2 border-b-2 border-border text-sm text-muted-foreground">{clinic.name}</div>
          </FieldGroup>

          <FieldGroup label="Address" hint="Callers hear this when asking for directions">
            <input type="text" value={settings.address ?? ""} onChange={e => onSettingsChange({ address: e.target.value })}
              placeholder="123 Main St" className={S.input} />
          </FieldGroup>

          <FieldGroup label="Landmark" hint="Helps callers find you more easily">
            <input type="text" value={settings.landmark ?? ""} onChange={e => onSettingsChange({ landmark: e.target.value })}
              placeholder="Next to Walmart on 5th Ave" className={S.input} />
          </FieldGroup>

          <FieldGroup label="City">
            <input type="text" value={settings.city ?? ""} onChange={e => onSettingsChange({ city: e.target.value })}
              placeholder="Austin, TX" className={S.input} />
          </FieldGroup>

          <FieldGroup label="Phone Display" hint="The number callers see when Orvia calls back">
            <input type="text" value={phoneDisplay} onChange={e => onPhoneDisplayChange(e.target.value)}
              placeholder="+1 (512) 555-1234" className={S.input} />
          </FieldGroup>
        </div>
      </div>

      <div className={S.card}>
        <SectionHeading>Operating Hours</SectionHeading>
        <div className="space-y-0">
          {DAY_ORDER.map(day => {
            const info = hours[day] ?? { open: "09:00", close: "18:00", closed: false }
            const closed = info.closed ?? false
            return (
              <div key={day} className="py-3 border-b border-border last:border-0"
                style={{ opacity: closed ? 0.45 : 1 }}>
                {/* Single row on sm+, two rows on mobile */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold w-10 shrink-0">{DAY_LABELS[day]}</span>
                  {closed ? (
                    <span className="flex-1 text-sm text-muted-foreground">Closed</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input type="time" value={info.open} onChange={e => updateHour(day, "open", e.target.value)}
                        className={S.timeInput} style={{ minWidth: 0, width: "100%", maxWidth: 110 }} />
                      <span className="text-xs text-muted-foreground shrink-0">to</span>
                      <input type="time" value={info.close} onChange={e => updateHour(day, "close", e.target.value)}
                        className={S.timeInput} style={{ minWidth: 0, width: "100%", maxWidth: 110 }} />
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                    <input type="checkbox" checked={closed} onChange={() => toggleClosed(day)} className="accent-foreground cursor-pointer" />
                    <span className="text-xs text-muted-foreground">Closed</span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Services Tab ──────────────────────────────────────

function ServicesTab({ services, onServicesChange }: {
  services: BusinessService[]
  onServicesChange: (s: BusinessService[]) => void
  dirty: boolean; saving: boolean; success: boolean; error: string | null; onSave: () => void
}) {
  function update(i: number, patch: Partial<BusinessService>) {
    const u = [...services]; u[i] = { ...u[i], ...patch }; onServicesChange(u)
  }
  function remove(i: number) { onServicesChange(services.filter((_, j) => j !== i)) }

  return (
    <div className="mt-6 space-y-4">
      {services.length === 0 && (
        <div className={`${S.card} py-12 text-center`}>
          <p className="text-sm text-muted-foreground">No services configured yet</p>
          <p className="text-xs text-muted-foreground opacity-70 mt-1">Add your first service below</p>
        </div>
      )}

      {services.map((svc, i) => (
        <div key={i} className={S.card}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <FieldGroup label="Service Name">
                <input type="text" value={svc.name} onChange={e => update(i, { name: e.target.value })}
                  placeholder="Drain Cleaning" className={S.input} />
              </FieldGroup>
              <FieldGroup label="Duration (min)">
                <input type="number" value={svc.duration_minutes} onChange={e => update(i, { duration_minutes: parseInt(e.target.value) || 0 })}
                  placeholder="30" min={0} className={S.input} />
              </FieldGroup>
              <FieldGroup label="Price Range" hint="Orvia mentions this when callers ask cost">
                <input type="text" value={svc.price_range} onChange={e => update(i, { price_range: e.target.value })}
                  placeholder="$500-$1500" className={S.input} />
              </FieldGroup>
            </div>

            <FieldGroup label="Description">
              <textarea value={svc.description} onChange={e => update(i, { description: e.target.value })}
                placeholder="Brief description..." className={S.textarea} rows={2} />
            </FieldGroup>

            <div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={svc.can_book_directly} onChange={e => update(i, { can_book_directly: e.target.checked })}
                  className="accent-foreground cursor-pointer w-4 h-4" />
                <span className="text-sm font-medium">Can book directly</span>
              </label>
              <p className={S.hint}>
                {svc.can_book_directly ? "Callers can book this service over the phone" : "Orvia will book a consultation instead"}
              </p>
              {!svc.can_book_directly && (
                <div className="mt-3">
                  <FieldGroup label="Note shown to callers">
                    <input type="text" value={svc.note ?? ""} onChange={e => update(i, { note: e.target.value })}
                      placeholder="We need to assess in person before booking" className={S.input} />
                  </FieldGroup>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <ConfirmRemoveButton onConfirm={() => remove(i)} label="Remove service" />
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={() => onServicesChange([...services, emptyService()])} className={S.addBtn}>
        <Plus className="size-4" /> Add service
      </button>
    </div>
  )
}

// ─── AI Assistant Tab ──────────────────────────────────

function AIAssistantTab({ settings, onSettingsChange }: {
  settings: BusinessSettingsType
  onSettingsChange: (patch: Partial<BusinessSettingsType>) => void
  dirty: boolean; saving: boolean; success: boolean; error: string | null; onSave: () => void
}) {
  const instructionsText = (settings.special_instructions ?? []).join("\n")
  const faq = settings.faq ?? []
  const emergency = settings.emergency_protocol ?? { during_hours: "", after_hours: "" }

  function updateFAQ(i: number, patch: Partial<BusinessFAQ>) {
    const u = [...faq]; u[i] = { ...u[i], ...patch }; onSettingsChange({ faq: u })
  }
  function removeFAQ(i: number) { onSettingsChange({ faq: faq.filter((_, j) => j !== i) }) }

  return (
    <div className="space-y-6 mt-6">
      <div className={S.card}>
        <SectionHeading>Configuration</SectionHeading>
        <div className="space-y-6">
          <FieldGroup label="Receptionist Name" hint="The name your AI uses when answering calls">
            <input type="text" value={settings.receptionist_name ?? ""} onChange={e => onSettingsChange({ receptionist_name: e.target.value })}
              placeholder="Orvia" className={S.input} />
          </FieldGroup>

          <FieldGroup label="Tone">
            <input type="text" value={settings.tone ?? ""} onChange={e => onSettingsChange({ tone: e.target.value })}
              placeholder="warm, professional, reassuring" className={S.input} />
          </FieldGroup>

          <FieldGroup label="Language">
            <select value={settings.language_preference ?? "english"}
              onChange={e => onSettingsChange({ language_preference: e.target.value as BusinessSettingsType["language_preference"] })}
              className={`${S.input} cursor-pointer`}>
              {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(settings.language_preference === "kannada" || settings.language_preference === "multilingual") && (
              <p className={S.hint}>Kannada voice/transcription quality is unverified — test a real call before relying on it live.</p>
            )}
          </FieldGroup>
        </div>
      </div>

      <div className={S.card}>
        <SectionHeading>Special Instructions</SectionHeading>
        <textarea value={instructionsText}
          onChange={e => onSettingsChange({ special_instructions: e.target.value.split("\n") })}
          placeholder={"Always ask for the caller's ZIP code first\nNever give exact prices, say 'starting from'\nOffer a callback if lines are busy"}
          className={S.textarea} rows={5} />
        <p className={S.hint}>One instruction per line. Orvia follows these on every call.</p>
      </div>

      <div className={S.card}>
        <SectionHeading>Emergency Protocol</SectionHeading>
        <p className={`${S.hint} mb-5`}>What should Orvia do when a caller reports an emergency?</p>
        <div className="space-y-5">
          <FieldGroup label="During Hours">
            <textarea value={emergency.during_hours}
              onChange={e => onSettingsChange({ emergency_protocol: { ...emergency, during_hours: e.target.value } })}
              placeholder="Dispatch someone immediately, take caller's name and address" className={S.textarea} rows={2} />
          </FieldGroup>
          <FieldGroup label="After Hours">
            <textarea value={emergency.after_hours}
              onChange={e => onSettingsChange({ emergency_protocol: { ...emergency, after_hours: e.target.value } })}
              placeholder="Take their info, assure callback within 30 min" className={S.textarea} rows={2} />
          </FieldGroup>
        </div>
      </div>

      <div className={S.card}>
        <SectionHeading>FAQ</SectionHeading>
        {faq.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No FAQs added yet</p>
        ) : (
          <div className="space-y-5">
            {faq.map((item, i) => (
              <div key={i} className="space-y-4 pb-5 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center size-6 rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0 mt-1 border border-border">{i + 1}</span>
                  <div className="flex-1 space-y-4">
                    <FieldGroup label="Question">
                      <input type="text" value={item.question} onChange={e => updateFAQ(i, { question: e.target.value })}
                        placeholder="Do you accept insurance?" className={S.input} />
                    </FieldGroup>
                    <FieldGroup label="Answer">
                      <textarea value={item.answer} onChange={e => updateFAQ(i, { answer: e.target.value })}
                        placeholder="Yes, we accept most major providers..." className={S.textarea} rows={2} />
                    </FieldGroup>
                  </div>
                </div>
                <div className="flex justify-end">
                  <ConfirmRemoveButton onConfirm={() => removeFAQ(i)} label="Remove" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pt-4">
          <button type="button" onClick={() => onSettingsChange({ faq: [...faq, emptyFAQ()] })} className={S.addBtn}>
            <Plus className="size-4" /> Add FAQ
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Profile Tab ───────────────────────────────────────
// User profile (your name, email) + account technical details (business IDs)

function ProfileTab({ clinic }: { clinic: Business }) {
  const { profile, updateProfile } = useAuth()
  const [nameInput, setNameInput] = useState(profile.fullName ?? "")
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => { setNameInput(profile.fullName ?? "") }, [profile.fullName])

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput === profile.fullName) return
    setNameSaving(true); setNameError(null)
    const { error } = await updateProfile(nameInput.trim())
    setNameSaving(false)
    if (error) { setNameError(error) } else {
      setNameSuccess(true); setTimeout(() => setNameSuccess(false), 2500)
    }
  }

  const initials = (profile.fullName || profile.email?.split("@")[0] || "U")
    .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)

  const accountRows = [
    { label: "Business ID", value: clinic.id },
    { label: "Vapi Phone ID", value: clinic.vapi_phone_id },
    { label: "Display Phone", value: clinic.phone_display },
  ]

  return (
    <div className="mt-6 space-y-6 max-w-xl">
      <div className={S.card}>
        <SectionHeading>You</SectionHeading>

        <div className="flex items-center gap-4 mb-6">
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: "var(--foreground)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--background)", letterSpacing: "-0.02em" }}>{initials}</span>
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
              {profile.fullName || profile.email?.split("@")[0] || "User"}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{profile.email}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className={S.label}>Full Name</label>
            <div className="flex items-center gap-3">
              <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveName()}
                placeholder="Your full name" className={S.input} style={{ flex: 1 }} />
              <button type="button" onClick={handleSaveName}
                disabled={nameSaving || nameInput === profile.fullName || !nameInput.trim()}
                className={S.saveBtn}>
                {nameSuccess ? <><Check style={{ width: 12, height: 12 }} /> Saved</> : nameSaving ? "Saving..." : "Save"}
              </button>
            </div>
            {nameError && <p className="text-xs text-red-500 mt-1.5">{nameError}</p>}
            <p className={S.hint}>Appears in your dashboard greeting.</p>
          </div>

          <div>
            <label className={S.label}>Email</label>
            <div className="py-2 border-b-2 border-border text-sm text-muted-foreground">{profile.email || "--"}</div>
            <p className={S.hint}>Contact support to change your email.</p>
          </div>
        </div>
      </div>

      <div className={S.card}>
        <SectionHeading>Account details</SectionHeading>
        <div className="space-y-0">
          {accountRows.map(r => (
            <div key={r.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="text-sm font-medium font-mono">{r.value || "--"}</span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusBadge status={clinic.status} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Preferences Tab ───────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "light",  label: "Light",  icon: Sun,     desc: "Always light" },
  { value: "dark",   label: "Dark",   icon: Moon,    desc: "Always dark" },
  { value: "system", label: "System", icon: Monitor, desc: "Follows your OS" },
]

function PreferencesTab() {
  const { user } = useAuth()
  const { theme, saveTheme } = useTheme()
  const [themeSaving, setThemeSaving] = useState(false)

  async function handleThemeChange(t: Theme) {
    if (!user) return
    setThemeSaving(true)
    await saveTheme(user.id, t)
    setThemeSaving(false)
  }

  return (
    <div className="mt-6 space-y-6 max-w-xl">
      <div className={S.card}>
        <SectionHeading>Appearance</SectionHeading>
        <p className="text-sm text-muted-foreground mb-5">Choose how Orvia looks. Saved to your account.</p>

        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
            const active = theme === value
            return (
              <button key={value} type="button" onClick={() => handleThemeChange(value)}
                disabled={themeSaving}
                style={{
                  padding: "16px 14px",
                  borderRadius: 14,
                  border: active ? "2px solid var(--foreground)" : "1.5px solid var(--border)",
                  background: "var(--card)",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
                  transition: "all 0.15s",
                  opacity: themeSaving ? 0.6 : 1,
                  boxShadow: active ? "0 0 0 1px var(--foreground)" : "none",
                  position: "relative",
                }}>
                {active && (
                  <span style={{
                    position: "absolute", top: 10, right: 10,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check style={{ width: 10, height: 10, color: "var(--background)" }} strokeWidth={2.5} />
                  </span>
                )}
                <Icon style={{ width: 18, height: 18, color: active ? "var(--foreground)" : "var(--muted-foreground)" }} strokeWidth={1.75} />
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: "var(--foreground)", marginBottom: 3 }}>{label}</p>
                  <p style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.3 }}>{desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Dirty detection ───────────────────────────────────

function tabIsDirty(tab: Tab, editSettings: BusinessSettingsType | null, originalSettings: string,
  editPhoneDisplay: string, originalPhoneDisplay: string): boolean {
  if (!editSettings) return false
  let original: BusinessSettingsType | null = null
  try { original = JSON.parse(originalSettings) } catch { return false }
  if (!original) return false

  switch (tab) {
    case "Business Info": {
      const fields = ["business_owner", "address", "landmark", "city", "operating_hours"] as const
      for (const f of fields) if (JSON.stringify(editSettings[f]) !== JSON.stringify(original[f])) return true
      return editPhoneDisplay !== originalPhoneDisplay
    }
    case "Services":
      return JSON.stringify(editSettings.service_details) !== JSON.stringify(original.service_details)
    case "AI Assistant": {
      const fields = ["receptionist_name", "tone", "language_preference", "special_instructions", "emergency_protocol", "faq"] as const
      for (const f of fields) if (JSON.stringify(editSettings[f]) !== JSON.stringify(original[f])) return true
      return false
    }
    default: return false
  }
}

// ─── Page ──────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Business Info")
  const queryClient = useQueryClient()

  const { data: clinic, isLoading } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettings })

  const [editSettings, setEditSettings] = useState<BusinessSettingsType | null>(null)
  const [editPhoneDisplay, setEditPhoneDisplay] = useState("")
  const [originalSettings, setOriginalSettings] = useState("")
  const [originalPhoneDisplay, setOriginalPhoneDisplay] = useState("")
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!clinic) return
    const cloned = deepClone(clinic.settings)
    if (!cloned.operating_hours) {
      cloned.operating_hours = defaultOperatingHours()
    } else {
      for (const day of DAY_ORDER) {
        if (!cloned.operating_hours[day])
          cloned.operating_hours[day] = { open: "09:00", close: "18:00", closed: day === "sunday" }
      }
    }
    setEditSettings(cloned)
    setOriginalSettings(JSON.stringify(cloned))
    setEditPhoneDisplay(clinic.phone_display ?? "")
    setOriginalPhoneDisplay(clinic.phone_display ?? "")
  }, [clinic])

  const isDirty = useMemo(() => {
    if (!editSettings) return false
    return JSON.stringify(editSettings) !== originalSettings || editPhoneDisplay !== originalPhoneDisplay
  }, [editSettings, originalSettings, editPhoneDisplay, originalPhoneDisplay])

  const patchSettings = useCallback((patch: Partial<BusinessSettingsType>) => {
    setEditSettings(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  const onServicesChange = useCallback((services: BusinessService[]) => {
    setEditSettings(prev => prev ? { ...prev, service_details: services } : prev)
  }, [])

  const handleSave = useCallback(async () => {
    if (!clinic || !editSettings) return
    setSaving(true); setSuccessMsg(false); setErrorMsg(null)
    try {
      const cleaned = deepClone(editSettings)
      if (cleaned.special_instructions) {
        while (cleaned.special_instructions.length > 0 && cleaned.special_instructions[cleaned.special_instructions.length - 1].trim() === "")
          cleaned.special_instructions.pop()
        cleaned.special_instructions = cleaned.special_instructions.filter((l: string) => l.trim() !== "")
      }
      const { error: e1 } = await updateBusinessSettings(clinic.id, cleaned as unknown as Record<string, unknown>)
      if (e1) { setErrorMsg(e1); return }
      if (editPhoneDisplay !== originalPhoneDisplay) {
        const { error: e2 } = await updateBusinessTopLevel(clinic.id, { phone_display: editPhoneDisplay })
        if (e2) { setErrorMsg(e2); return }
      }
      setEditSettings(cleaned)
      setOriginalSettings(JSON.stringify(cleaned))
      setOriginalPhoneDisplay(editPhoneDisplay)
      await queryClient.invalidateQueries({ queryKey: ["business-settings"] })
      setSuccessMsg(true); setTimeout(() => setSuccessMsg(false), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save")
    } finally { setSaving(false) }
  }, [clinic, editSettings, editPhoneDisplay, originalPhoneDisplay, originalSettings, queryClient])

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--foreground)" }}>Settings</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
          {activeTab === "Profile" || activeTab === "Preferences"
            ? "Your personal profile and appearance"
            : "Configure your business and AI assistant"}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom: "1.5px solid var(--border)", marginBottom: 0 }}>
        {/* Mobile: icon grid */}
        <div className="flex sm:hidden">
          {TABS.map(({ id, icon: Icon }) => {
            const active = activeTab === id
            const dirty = editSettings ? tabIsDirty(id, editSettings, originalSettings, editPhoneDisplay, originalPhoneDisplay) : false
            return (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "10px 4px", border: "none", background: "transparent", cursor: "pointer",
                  borderBottom: active ? "2px solid var(--foreground)" : "2px solid transparent",
                  marginBottom: -1.5, transition: "all 0.15s", position: "relative",
                }}>
                <Icon style={{ width: 16, height: 16, color: active ? "var(--foreground)" : "var(--muted-foreground)" }} strokeWidth={active ? 2.25 : 1.75} />
                {dirty && <span style={{ position: "absolute", top: 8, right: "calc(50% - 10px)", width: 5, height: 5, borderRadius: "50%", background: "var(--foreground)", opacity: 0.6 }} />}
              </button>
            )
          })}
        </div>
        {/* Desktop: icon + label, with group divider */}
        <div className="hidden sm:flex" style={{ gap: 4, alignItems: "center" }}>
          {TABS.map(({ id, label, icon: Icon, group }, idx) => {
            const active = activeTab === id
            const dirty = editSettings ? tabIsDirty(id, editSettings, originalSettings, editPhoneDisplay, originalPhoneDisplay) : false
            const prevGroup = idx > 0 ? TABS[idx - 1].group : group
            const groupChanged = group !== prevGroup
            return (
              <Fragment key={id}>
                {groupChanged && idx > 0 && (
                  <span style={{
                    width: 1, height: 16, background: "var(--border)",
                    margin: "0 8px", display: "inline-block", opacity: 0.7,
                  }} />
                )}
                <button type="button" onClick={() => setActiveTab(id)}
                  title={GROUP_LABELS[group]}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer",
                    fontSize: 13, fontWeight: active ? 600 : 500,
                    color: active ? "var(--foreground)" : "var(--muted-foreground)",
                    borderBottom: active ? "2px solid var(--foreground)" : "2px solid transparent",
                    marginBottom: -1.5, transition: "all 0.15s", whiteSpace: "nowrap",
                  }}>
                  <Icon style={{ width: 14, height: 14 }} strokeWidth={active ? 2.25 : 1.75} />
                  {label}
                  {dirty && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--foreground)", opacity: 0.6, flexShrink: 0 }} />}
                </button>
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <CardSkeleton />
      ) : !clinic || !editSettings ? (
        <div style={{ padding: "80px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>No settings found</p>
        </div>
      ) : (
        <>
          {activeTab === "Business Info" && (
            <BusinessInfoTab clinic={clinic} settings={editSettings} phoneDisplay={editPhoneDisplay}
              onSettingsChange={patchSettings} onPhoneDisplayChange={setEditPhoneDisplay}
              dirty={isDirty} saving={saving} success={successMsg} error={errorMsg} onSave={handleSave} />
          )}
          {activeTab === "Services" && (
            <ServicesTab services={editSettings.service_details ?? []} onServicesChange={onServicesChange}
              dirty={isDirty} saving={saving} success={successMsg} error={errorMsg} onSave={handleSave} />
          )}
          {activeTab === "AI Assistant" && (
            <AIAssistantTab settings={editSettings} onSettingsChange={patchSettings}
              dirty={isDirty} saving={saving} success={successMsg} error={errorMsg} onSave={handleSave} />
          )}
          {activeTab === "Profile" && <ProfileTab clinic={clinic} />}
          {activeTab === "Preferences" && <PreferencesTab />}
        </>
      )}

      <SaveBar dirty={isDirty} saving={saving} success={successMsg} error={errorMsg} onSave={handleSave} />
    </div>
  )
}
