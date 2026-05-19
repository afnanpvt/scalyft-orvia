import { useState, useEffect, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Settings as SettingsIcon, Plus } from "lucide-react"

import { getClinicSettings, updateClinicSettings, updateClinicTopLevel } from "@/lib/api"
import type { Clinic, ClinicSettings as ClinicSettingsType, ClinicService, ClinicFAQ } from "@/lib/types"

// ─── Constants ─────────────────────────────────────────

const TABS = ["Business Info", "Services", "AI Assistant", "Account"] as const
type Tab = (typeof TABS)[number]

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
}

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "bilingual", label: "Bilingual" },
] as const

// ─── Style constants ───────────────────────────────────

const INPUT_CLASS =
  "w-full border-0 border-b border-border/30 bg-transparent px-0 text-[14px] text-foreground placeholder:text-muted-foreground/20 focus:border-foreground focus:outline-none transition-colors h-10"
const LABEL_CLASS =
  "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/40 mb-2 block"
const SECTION_LABEL_CLASS =
  "text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/30"
const TEXTAREA_CLASS =
  "w-full border-0 border-b border-border/30 bg-transparent px-0 text-[14px] text-foreground placeholder:text-muted-foreground/20 focus:border-foreground focus:outline-none transition-colors min-h-[80px] resize-none"
const TIME_INPUT_CLASS =
  "w-24 border-0 border-b border-border/30 bg-transparent px-0 text-[13px] tabular-nums text-foreground focus:border-foreground focus:outline-none transition-colors h-10"
const HINT_CLASS = "text-[11px] text-muted-foreground/20 mt-1.5"
const ADD_BTN_CLASS =
  "flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground/40 hover:text-foreground cursor-pointer transition-colors"
const REMOVE_BTN_CLASS =
  "text-[11px] text-red-500/60 hover:text-red-500 cursor-pointer transition-colors"

// ─── Helpers ───────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function defaultOperatingHours(): Record<string, { open: string; close: string; lunch_break?: string | null; closed?: boolean }> {
  const result: Record<string, { open: string; close: string; closed?: boolean }> = {}
  for (const day of DAY_ORDER) {
    result[day] =
      day === "sunday"
        ? { open: "09:00", close: "17:00", closed: true }
        : { open: "09:00", close: "18:00", closed: false }
  }
  return result
}

function emptyService(): ClinicService {
  return {
    name: "",
    duration_minutes: 30,
    price_range: "",
    description: "",
    can_book_directly: true,
    note: "",
  }
}

function emptyFAQ(): ClinicFAQ {
  return { question: "", answer: "" }
}

// ─── Skeletons ─────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="space-y-1 mt-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex justify-between items-center py-3 border-b border-border/20 last:border-0">
          <div className="h-3 w-24 bg-muted/40 animate-pulse rounded-lg" />
          <div className="h-3 w-36 bg-muted/40 animate-pulse rounded-lg" />
        </div>
      ))}
    </div>
  )
}

// ─── Status Badge ──────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-700",
    inactive: "bg-red-500/10 text-red-700",
    onboarding: "bg-amber-500/10 text-amber-700",
  }

  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
        styles[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

// ─── Section Heading ───────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className={`${SECTION_LABEL_CLASS} mb-4`}>{children}</h3>
}

// ─── Save Footer ───────────────────────────────────────

function StickyToast({
  dirty,
  saving,
  success,
  error,
  onSave,
}: {
  dirty: boolean
  saving: boolean
  success: boolean
  error: string | null
  onSave: () => void
}) {
  const show = dirty || success || error

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-foreground text-background px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-[13px] text-background/60">
              You have unsaved changes
            </span>
          )}
          {success && (
            <span className="text-[13px] text-emerald-400">
              Saved. Changes will apply to the next call.
            </span>
          )}
          {error && (
            <span className="text-[13px] text-red-400">{error}</span>
          )}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="bg-background text-foreground rounded-lg h-8 px-5 text-[12px] font-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Info Row (read-only) ──────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-border/20 last:border-0">
      <span className="text-[11px] text-muted-foreground/50">{label}</span>
      <span className="text-[13px] font-medium">{value || "--"}</span>
    </div>
  )
}

// ─── Confirm Remove Button ─────────────────────────────

function ConfirmRemoveButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  if (confirming) {
    return (
      <button
        type="button"
        onClick={onConfirm}
        className="text-[11px] text-red-500 font-medium cursor-pointer transition-colors"
      >
        Confirm remove?
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={REMOVE_BTN_CLASS}
    >
      {label}
    </button>
  )
}

// ─── Clinic Info Tab ───────────────────────────────────

function ClinicInfoTab({
  clinic,
  settings,
  phoneDisplay,
  onSettingsChange,
  onPhoneDisplayChange,
}: {
  clinic: Clinic
  settings: ClinicSettingsType
  phoneDisplay: string
  onSettingsChange: (patch: Partial<ClinicSettingsType>) => void
  onPhoneDisplayChange: (v: string) => void
  dirty: boolean
  saving: boolean
  success: boolean
  error: string | null
  onSave: () => void
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
    <div className="space-y-10 mt-6">
      {/* General */}
      <div>
        <SectionHeading>General</SectionHeading>
        <div className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>Owner / Manager Name</label>
            <input
              type="text"
              value={settings.doctor_name ?? ""}
              onChange={(e) => onSettingsChange({ doctor_name: e.target.value })}
              placeholder="John Smith"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Business Name</label>
            <div className="h-10 flex items-center text-[14px] text-muted-foreground/50 border-b border-border/20">
              {clinic.name}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Address</label>
            <input
              type="text"
              value={settings.address ?? ""}
              onChange={(e) => onSettingsChange({ address: e.target.value })}
              placeholder="123 Main St"
              className={INPUT_CLASS}
            />
            <p className={HINT_CLASS}>Callers will hear this when asking for directions</p>
          </div>

          <div>
            <label className={LABEL_CLASS}>Landmark</label>
            <input
              type="text"
              value={settings.landmark ?? ""}
              onChange={(e) => onSettingsChange({ landmark: e.target.value })}
              placeholder="Next to Walmart on 5th Ave"
              className={INPUT_CLASS}
            />
            <p className={HINT_CLASS}>Helps callers find your location more easily</p>
          </div>

          <div>
            <label className={LABEL_CLASS}>City</label>
            <input
              type="text"
              value={settings.city ?? ""}
              onChange={(e) => onSettingsChange({ city: e.target.value })}
              placeholder="Austin, TX"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Phone Display</label>
            <input
              type="text"
              value={phoneDisplay}
              onChange={(e) => onPhoneDisplayChange(e.target.value)}
              placeholder="+1 (512) 555-1234"
              className={INPUT_CLASS}
            />
            <p className={HINT_CLASS}>The number callers see when Orvia calls them back</p>
          </div>
        </div>
      </div>

      {/* Operating Hours */}
      <div>
        <SectionHeading>Operating Hours</SectionHeading>
        <div className="space-y-0">
          {DAY_ORDER.map((day) => {
            const info = hours[day] ?? { open: "09:00", close: "18:00", closed: false }
            const isClosed = info.closed ?? false

            return (
              <div
                key={day}
                className={`flex items-center gap-4 py-3 border-b border-border/20 last:border-0 transition-opacity ${
                  isClosed ? "opacity-40" : ""
                }`}
              >
                <span className="text-[13px] font-medium w-10 capitalize">{DAY_LABELS[day]}</span>

                {isClosed ? (
                  <span className="flex-1 text-[13px] text-muted-foreground/40">Closed</span>
                ) : (
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="time"
                      value={info.open}
                      onChange={(e) => updateHour(day, "open", e.target.value)}
                      className={TIME_INPUT_CLASS}
                    />
                    <span className="text-[12px] text-muted-foreground/30">to</span>
                    <input
                      type="time"
                      value={info.close}
                      onChange={(e) => updateHour(day, "close", e.target.value)}
                      className={TIME_INPUT_CLASS}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isClosed}
                    onChange={() => toggleClosed(day)}
                    className="accent-foreground cursor-pointer"
                  />
                  <span className="text-[11px] text-muted-foreground/50">Closed</span>
                </label>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Services Tab ──────────────────────────────────────

function ServicesTab({
  services,
  onServicesChange,
}: {
  services: ClinicService[]
  onServicesChange: (services: ClinicService[]) => void
  dirty: boolean
  saving: boolean
  success: boolean
  error: string | null
  onSave: () => void
}) {
  function updateService(index: number, patch: Partial<ClinicService>) {
    const updated = [...services]
    updated[index] = { ...updated[index], ...patch }
    onServicesChange(updated)
  }

  function removeService(index: number) {
    onServicesChange(services.filter((_, i) => i !== index))
  }

  function addService() {
    onServicesChange([...services, emptyService()])
  }

  return (
    <div className="mt-6 space-y-0">
      {services.length === 0 ? (
        <div className="py-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <SettingsIcon className="size-8 text-muted-foreground/15" />
            <p className="text-[13px] text-muted-foreground/40">No services configured yet</p>
          </div>
        </div>
      ) : (
        services.map((svc, i) => (
          <div key={i} className="py-6 border-b border-border/20">
            <div className="space-y-5">
              {/* Row 1: Name + Duration + Price */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL_CLASS}>Service Name</label>
                  <input
                    type="text"
                    value={svc.name}
                    onChange={(e) => updateService(i, { name: e.target.value })}
                    placeholder="Drain Cleaning"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Duration (min)</label>
                  <input
                    type="number"
                    value={svc.duration_minutes}
                    onChange={(e) => updateService(i, { duration_minutes: parseInt(e.target.value) || 0 })}
                    placeholder="30"
                    min={0}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Price Range</label>
                  <input
                    type="text"
                    value={svc.price_range}
                    onChange={(e) => updateService(i, { price_range: e.target.value })}
                    placeholder="500-1500"
                    className={INPUT_CLASS}
                  />
                  <p className={HINT_CLASS}>Orvia mentions this range when callers ask about cost</p>
                </div>
              </div>

              {/* Row 2: Description */}
              <div>
                <label className={LABEL_CLASS}>Description</label>
                <textarea
                  value={svc.description}
                  onChange={(e) => updateService(i, { description: e.target.value })}
                  placeholder="Brief description of this service..."
                  className={TEXTAREA_CLASS}
                  rows={2}
                />
              </div>

              {/* Row 3: Booking toggle + Note */}
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={svc.can_book_directly}
                    onChange={(e) => updateService(i, { can_book_directly: e.target.checked })}
                    className="accent-foreground cursor-pointer"
                  />
                  <span className="text-[13px]">Can book directly</span>
                </label>
                <p className={HINT_CLASS}>
                  {svc.can_book_directly
                    ? "Callers can book this service directly over the phone"
                    : "When OFF, Orvia will book a consultation instead of the service"}
                </p>

                {!svc.can_book_directly && (
                  <div className="mt-2">
                    <label className={LABEL_CLASS}>Note (shown to patients)</label>
                    <input
                      type="text"
                      value={svc.note ?? ""}
                      onChange={(e) => updateService(i, { note: e.target.value })}
                      placeholder="We need to assess the job in person before booking"
                      className={INPUT_CLASS}
                    />
                  </div>
                )}
              </div>

              {/* Remove */}
              <div className="flex justify-end">
                <ConfirmRemoveButton onConfirm={() => removeService(i)} label="Remove service" />
              </div>
            </div>
          </div>
        ))
      )}

      <div className="pt-5">
        <button type="button" onClick={addService} className={ADD_BTN_CLASS}>
          <Plus className="size-3.5" />
          Add service
        </button>
      </div>
    </div>
  )
}

// ─── AI Assistant Tab ──────────────────────────────────

function AIAssistantTab({
  settings,
  onSettingsChange,
}: {
  settings: ClinicSettingsType
  onSettingsChange: (patch: Partial<ClinicSettingsType>) => void
  dirty: boolean
  saving: boolean
  success: boolean
  error: string | null
  onSave: () => void
}) {
  // Special instructions: stored as string[], displayed as one-per-line textarea
  const instructionsText = (settings.special_instructions ?? []).join("\n")
  const faq = settings.faq ?? []
  const emergency = settings.emergency_protocol ?? { during_hours: "", after_hours: "" }

  function updateFAQ(index: number, patch: Partial<ClinicFAQ>) {
    const updated = [...faq]
    updated[index] = { ...updated[index], ...patch }
    onSettingsChange({ faq: updated })
  }

  function removeFAQ(index: number) {
    onSettingsChange({ faq: faq.filter((_, i) => i !== index) })
  }

  function addFAQ() {
    onSettingsChange({ faq: [...faq, emptyFAQ()] })
  }

  return (
    <div className="space-y-10 mt-6">
      {/* Configuration */}
      <div>
        <SectionHeading>Configuration</SectionHeading>
        <div className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>Receptionist Name</label>
            <input
              type="text"
              value={settings.receptionist_name ?? ""}
              onChange={(e) => onSettingsChange({ receptionist_name: e.target.value })}
              placeholder="Orvia"
              className={INPUT_CLASS}
            />
            <p className={HINT_CLASS}>The name your AI assistant uses when answering calls</p>
          </div>

          <div>
            <label className={LABEL_CLASS}>Tone</label>
            <input
              type="text"
              value={settings.tone ?? ""}
              onChange={(e) => onSettingsChange({ tone: e.target.value })}
              placeholder="warm, professional, reassuring"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Language Preference</label>
            <select
              value={settings.language_preference ?? "english"}
              onChange={(e) =>
                onSettingsChange({
                  language_preference: e.target.value as "english" | "hindi" | "bilingual",
                })
              }
              className={`${INPUT_CLASS} cursor-pointer`}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Special Instructions */}
      <div>
        <SectionHeading>Special Instructions</SectionHeading>
        <textarea
          value={instructionsText}
          onChange={(e) => {
            const lines = e.target.value.split("\n")
            onSettingsChange({ special_instructions: lines })
          }}
          placeholder={"Always ask for the caller's ZIP code first\nNever give exact prices, always say 'starting from'\nOffer to schedule a callback if lines are busy"}
          className={TEXTAREA_CLASS}
          rows={4}
        />
        <p className={HINT_CLASS}>One instruction per line. Orvia follows these rules during every call.</p>
      </div>

      {/* Emergency Protocol */}
      <div>
        <SectionHeading>Emergency Protocol</SectionHeading>
        <p className={`${HINT_CLASS} mb-4`}>What should Orvia do when a caller reports an emergency?</p>
        <div className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>During Hours</label>
            <textarea
              value={emergency.during_hours}
              onChange={(e) =>
                onSettingsChange({
                  emergency_protocol: { ...emergency, during_hours: e.target.value },
                })
              }
              placeholder="Dispatch someone immediately, take caller's name and address"
              className={TEXTAREA_CLASS}
              rows={2}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>After Hours</label>
            <textarea
              value={emergency.after_hours}
              onChange={(e) =>
                onSettingsChange({
                  emergency_protocol: { ...emergency, after_hours: e.target.value },
                })
              }
              placeholder="Take their info and assure them someone will call back within 30 min"
              className={TEXTAREA_CLASS}
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div>
        <SectionHeading>FAQ</SectionHeading>
        {faq.length === 0 ? (
          <p className="text-[13px] text-muted-foreground/30 py-4">No FAQs added yet</p>
        ) : (
          faq.map((item, i) => (
            <div key={i} className="py-5 border-b border-border/20">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center size-6 rounded-full bg-muted/40 text-[11px] font-medium text-muted-foreground/60 shrink-0 mt-2">
                    {i + 1}
                  </span>
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className={LABEL_CLASS}>Question</label>
                      <input
                        type="text"
                        value={item.question}
                        onChange={(e) => updateFAQ(i, { question: e.target.value })}
                        placeholder="Do you accept insurance?"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Answer</label>
                      <textarea
                        value={item.answer}
                        onChange={(e) => updateFAQ(i, { answer: e.target.value })}
                        placeholder="Yes, we accept most major insurance providers..."
                        className={TEXTAREA_CLASS}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <ConfirmRemoveButton onConfirm={() => removeFAQ(i)} label="Remove FAQ" />
                </div>
              </div>
            </div>
          ))
        )}

        <div className="pt-5">
          <button type="button" onClick={addFAQ} className={ADD_BTN_CLASS}>
            <Plus className="size-3.5" />
            Add FAQ
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Account Tab (read-only) ───────────────────────────

function AccountTab({ clinic }: { clinic: Clinic }) {
  return (
    <div className="mt-6">
      <SectionHeading>Account Details</SectionHeading>
      <InfoRow label="Vapi Phone ID" value={clinic.vapi_phone_id} />
      <InfoRow label="Display Phone" value={clinic.phone_display} />
      <div className="flex justify-between items-center py-3">
        <span className="text-[11px] text-muted-foreground/50">Status</span>
        <StatusBadge status={clinic.status} />
      </div>
    </div>
  )
}

// ─── Dirty Tabs Tracker ────────────────────────────────

function tabIsDirty(
  tab: Tab,
  editSettings: ClinicSettingsType | null,
  originalSettings: string,
  editPhoneDisplay: string,
  originalPhoneDisplay: string,
): boolean {
  if (!editSettings) return false
  const original = (() => {
    try {
      return JSON.parse(originalSettings) as ClinicSettingsType
    } catch {
      return null
    }
  })()
  if (!original) return false

  switch (tab) {
    case "Business Info": {
      const clinicFields = ["doctor_name", "address", "landmark", "city", "operating_hours"] as const
      for (const field of clinicFields) {
        if (JSON.stringify(editSettings[field]) !== JSON.stringify(original[field])) return true
      }
      return editPhoneDisplay !== originalPhoneDisplay
    }
    case "Services":
      return JSON.stringify(editSettings.service_details) !== JSON.stringify(original.service_details)
    case "AI Assistant": {
      const aiFields = ["receptionist_name", "tone", "language_preference", "special_instructions", "emergency_protocol", "faq"] as const
      for (const field of aiFields) {
        if (JSON.stringify(editSettings[field]) !== JSON.stringify(original[field])) return true
      }
      return false
    }
    default:
      return false
  }
}

// ─── Page ──────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Clinic Info")
  const queryClient = useQueryClient()

  const { data: clinic, isLoading } = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: getClinicSettings,
  })

  // ── Editable state ──────────────────────────────────

  const [editSettings, setEditSettings] = useState<ClinicSettingsType | null>(null)
  const [editPhoneDisplay, setEditPhoneDisplay] = useState("")

  // Snapshots for dirty detection
  const [originalSettings, setOriginalSettings] = useState<string>("")
  const [originalPhoneDisplay, setOriginalPhoneDisplay] = useState("")

  // Save state
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Initialize editable state from clinic data
  useEffect(() => {
    if (clinic) {
      const cloned = deepClone(clinic.settings)
      // Ensure operating_hours has all 7 days
      if (!cloned.operating_hours) {
        cloned.operating_hours = defaultOperatingHours()
      } else {
        for (const day of DAY_ORDER) {
          if (!cloned.operating_hours[day]) {
            cloned.operating_hours[day] = { open: "09:00", close: "18:00", closed: day === "sunday" }
          }
        }
      }
      setEditSettings(cloned)
      setOriginalSettings(JSON.stringify(cloned))
      setEditPhoneDisplay(clinic.phone_display ?? "")
      setOriginalPhoneDisplay(clinic.phone_display ?? "")
    }
  }, [clinic])

  // ── Dirty detection ─────────────────────────────────

  const isDirty = useMemo(() => {
    if (!editSettings) return false
    const settingsDirty = JSON.stringify(editSettings) !== originalSettings
    const phoneDirty = editPhoneDisplay !== originalPhoneDisplay
    return settingsDirty || phoneDirty
  }, [editSettings, originalSettings, editPhoneDisplay, originalPhoneDisplay])

  // ── Patch settings helper ───────────────────────────

  const patchSettings = useCallback(
    (patch: Partial<ClinicSettingsType>) => {
      if (!editSettings) return
      setEditSettings({ ...editSettings, ...patch })
    },
    [editSettings],
  )

  // ── Services change handler ─────────────────────────

  const onServicesChange = useCallback(
    (services: ClinicService[]) => {
      if (!editSettings) return
      setEditSettings({ ...editSettings, service_details: services })
    },
    [editSettings],
  )

  // ── Save handler ────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!clinic || !editSettings) return

    setSaving(true)
    setSuccessMsg(false)
    setErrorMsg(null)

    try {
      // Clean up special instructions: filter out empty trailing lines
      const cleanedSettings = deepClone(editSettings)
      if (cleanedSettings.special_instructions) {
        // Remove completely empty trailing entries but keep interior blank lines
        const instructions = cleanedSettings.special_instructions
        while (instructions.length > 0 && instructions[instructions.length - 1].trim() === "") {
          instructions.pop()
        }
        cleanedSettings.special_instructions = instructions.filter((line: string) => line.trim() !== "")
      }

      // Save settings
      const { error: settingsError } = await updateClinicSettings(
        clinic.id,
        cleanedSettings as unknown as Record<string, unknown>,
      )

      if (settingsError) {
        setErrorMsg(settingsError)
        return
      }

      // Save phone_display if changed
      if (editPhoneDisplay !== originalPhoneDisplay) {
        const { error: phoneError } = await updateClinicTopLevel(clinic.id, {
          phone_display: editPhoneDisplay,
        })
        if (phoneError) {
          setErrorMsg(phoneError)
          return
        }
      }

      // Update snapshots
      const newSnapshot = JSON.stringify(cleanedSettings)
      setEditSettings(cleanedSettings)
      setOriginalSettings(newSnapshot)
      setOriginalPhoneDisplay(editPhoneDisplay)

      // Invalidate query cache
      await queryClient.invalidateQueries({ queryKey: ["clinic-settings"] })

      setSuccessMsg(true)
      setTimeout(() => setSuccessMsg(false), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }, [clinic, editSettings, editPhoneDisplay, originalPhoneDisplay, originalSettings, queryClient])

  // ── Render ──────────────────────────────────────────

  return (
    <div className="space-y-0 pb-20">
      {/* Header */}
      <div className="pb-1">
        <h1 className="text-xl font-semibold tracking-[-0.03em]">Settings</h1>
        <p className="text-[12px] text-muted-foreground/30 mt-1">
          Configure your business and AI assistant
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border/40 mt-4">
        {TABS.map((tab) => {
          const dirty = tabIsDirty(tab, editSettings, originalSettings, editPhoneDisplay, originalPhoneDisplay)
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[12px] font-medium pb-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground/30 hover:text-muted-foreground"
              }`}
            >
              {tab}
              {dirty && (
                <span className="size-1.5 rounded-full bg-foreground/60 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <CardSkeleton />
      ) : !clinic || !editSettings ? (
        <div className="py-24 text-center">
          <div className="flex flex-col items-center gap-3">
            <SettingsIcon className="size-8 text-muted-foreground/15" />
            <p className="text-[13px] text-muted-foreground/40">No clinic settings found</p>
          </div>
        </div>
      ) : (
        <>
          {activeTab === "Business Info" && (
            <ClinicInfoTab
              clinic={clinic}
              settings={editSettings}
              phoneDisplay={editPhoneDisplay}
              onSettingsChange={patchSettings}
              onPhoneDisplayChange={setEditPhoneDisplay}
              dirty={isDirty}
              saving={saving}
              success={successMsg}
              error={errorMsg}
              onSave={handleSave}
            />
          )}
          {activeTab === "Services" && (
            <ServicesTab
              services={editSettings.service_details ?? []}
              onServicesChange={onServicesChange}
              dirty={isDirty}
              saving={saving}
              success={successMsg}
              error={errorMsg}
              onSave={handleSave}
            />
          )}
          {activeTab === "AI Assistant" && (
            <AIAssistantTab
              settings={editSettings}
              onSettingsChange={patchSettings}
              dirty={isDirty}
              saving={saving}
              success={successMsg}
              error={errorMsg}
              onSave={handleSave}
            />
          )}
          {activeTab === "Account" && <AccountTab clinic={clinic} />}
        </>
      )}

      {/* Sticky save bar — always visible when dirty */}
      <StickyToast
        dirty={isDirty}
        saving={saving}
        success={successMsg}
        error={errorMsg}
        onSave={handleSave}
      />
    </div>
  )
}
