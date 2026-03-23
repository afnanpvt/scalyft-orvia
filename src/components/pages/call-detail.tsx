import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "@tanstack/react-router"
import {
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Play,
  Pause,
  FileText,
} from "lucide-react"

import {
  getCallById,
  getLeadByCallId,
  getAppointmentByCallId,
  markCallHandled,
} from "@/lib/api"
import type { TranscriptTurn } from "@/lib/types"

// ─── Helpers ────────────────────────────────────────────

function formatDuration(secs: number | null): string {
  if (secs == null) return "--"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "--"
  return value.replace(/_/g, " ")
}

const outcomeStyles: Record<string, string> = {
  appointment_booked: "bg-emerald-500/10 text-emerald-700",
  lead_captured: "bg-blue-500/10 text-blue-700",
  info_given: "bg-muted text-muted-foreground",
  transferred: "bg-amber-500/10 text-amber-700",
  missed: "bg-red-500/10 text-red-700",
}

const statusStyles: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700",
  in_progress: "bg-blue-500/10 text-blue-700",
  missed: "bg-red-500/10 text-red-700",
  failed: "bg-red-500/10 text-red-700",
  transferred: "bg-amber-500/10 text-amber-700",
}

const urgencyStyles: Record<string, string> = {
  emergency: "bg-red-500/10 text-red-700",
  urgent: "bg-amber-500/10 text-amber-700",
  routine: "bg-muted text-muted-foreground",
  inquiry: "bg-blue-500/10 text-blue-700",
}

// ─── Skeletons ──────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-6 w-36 bg-muted/50 animate-pulse rounded-lg" />
        <div className="h-5 w-20 bg-muted/50 animate-pulse rounded-full" />
        <div className="h-5 w-16 bg-muted/50 animate-pulse rounded-full" />
      </div>
      <div className="h-2.5 w-48 bg-muted/40 animate-pulse rounded-lg" />
      <div className="h-4 w-full max-w-md bg-muted/40 animate-pulse rounded-lg mt-4" />
      <div className="h-4 w-3/4 max-w-sm bg-muted/40 animate-pulse rounded-lg" />
    </div>
  )
}

function TranscriptSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-3 w-24 bg-muted/40 animate-pulse rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <div className="space-y-2 max-w-[70%]">
            <div className="h-2 w-12 bg-muted/40 animate-pulse rounded-lg" />
            <div className="h-16 w-64 bg-muted/40 animate-pulse rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((n) => (
        <div key={n} className="space-y-4">
          <div className="h-2.5 w-16 bg-muted/40 animate-pulse rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2 w-12 bg-muted/40 animate-pulse rounded-lg" />
              <div className="h-3 w-32 bg-muted/50 animate-pulse rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Audio Player ────────────────────────────────────────

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play()
    }
    setPlaying(!playing)
  }

  function handleTimeUpdate() {
    const el = audioRef.current
    if (!el || !el.duration) return
    setProgress(el.currentTime / el.duration)
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    if (!el || !el.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * el.duration
    setProgress(ratio)
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, "0")}`
  }

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />
      <button
        onClick={toggle}
        className="flex items-center justify-center size-8 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer shrink-0"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
      </button>
      <div
        className="flex-1 h-1 bg-border/40 rounded-full cursor-pointer relative"
        onClick={handleSeek}
      >
        <div
          className="absolute inset-y-0 left-0 bg-foreground/60 rounded-full transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {duration > 0 && (
        <span className="text-[11px] tabular-nums text-muted-foreground/40 shrink-0">
          {fmt(progress * duration)} / {fmt(duration)}
        </span>
      )}
    </div>
  )
}

// ─── Transcript Bubble ──────────────────────────────────

function ChatBubble({ turn }: { turn: TranscriptTurn }) {
  const isAI = turn.role === "assistant"

  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[80%] space-y-1">
        <p className={`text-[10px] font-medium text-muted-foreground/30 ${isAI ? "" : "text-right"}`}>
          {isAI ? "Orvia" : "Caller"}
        </p>
        <div
          className={`px-4 py-3 text-[13px] leading-relaxed ${
            isAI
              ? "bg-accent/30 rounded-2xl rounded-tl-sm"
              : "bg-card ring-1 ring-border/10 rounded-2xl rounded-tr-sm"
          }`}
        >
          {turn.content}
        </div>
        {turn.timestamp != null && (
          <p className={`text-[10px] tabular-nums text-muted-foreground/20 ${isAI ? "" : "text-right"}`}>
            {Math.floor(turn.timestamp / 60)}:{String(Math.floor(turn.timestamp % 60)).padStart(2, "0")}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Whisper Section Label ──────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/40">
      {children}
    </h3>
  )
}

// ─── Info Item ──────────────────────────────────────────

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground/40">{label}</p>
      <div className="text-[13px] text-foreground mt-0.5">{children}</div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────

export default function CallDetailPage() {
  const { id } = useParams({ from: "/_dashboard/calls_/$id" })
  const queryClient = useQueryClient()

  const callQuery = useQuery({
    queryKey: ["call", id],
    queryFn: () => getCallById(id),
    enabled: !!id,
  })

  const leadQuery = useQuery({
    queryKey: ["lead-by-call", id],
    queryFn: () => getLeadByCallId(id),
    enabled: !!id,
  })

  const appointmentQuery = useQuery({
    queryKey: ["appointment-by-call", id],
    queryFn: () => getAppointmentByCallId(id),
    enabled: !!id,
  })

  const handleMutation = useMutation({
    mutationFn: () => markCallHandled(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call", id] })
      queryClient.invalidateQueries({ queryKey: ["calls"] })
    },
  })

  const call = callQuery.data
  const lead = leadQuery.data
  const appointment = appointmentQuery.data
  const isLoading = callQuery.isLoading

  const extracted = call?.extracted_data ?? {}
  const extractedEntries = Object.entries(extracted).filter(
    ([, v]) => v != null && v !== ""
  )

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <Link
        to="/calls"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground/40 hover:text-foreground transition-colors duration-150 cursor-pointer"
      >
        <ChevronLeft className="size-3.5" />
        Calls
      </Link>

      {/* Not found state */}
      {!isLoading && !call && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <AlertCircle className="size-10 text-muted-foreground/15" strokeWidth={1.5} />
          <p className="text-[14px] text-muted-foreground/40">Call not found</p>
        </div>
      )}

      {/* Main content */}
      {(isLoading || call) && (
        <div className="space-y-8">
          {/* Hero section */}
          {isLoading ? (
            <HeroSkeleton />
          ) : call ? (
            <div>
              {/* Phone + inline badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-semibold tracking-[-0.03em]">
                  {call.caller_phone ?? "Unknown caller"}
                </h1>
                {call.outcome && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                      outcomeStyles[call.outcome] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatLabel(call.outcome)}
                  </span>
                )}
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    statusStyles[call.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatLabel(call.status)}
                </span>
              </div>

              {/* Meta line */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/30 mt-2">
                <span className="tabular-nums">{formatDuration(call.duration_secs)}</span>
                <span>&middot;</span>
                <span>{call.language_detected === "hi" ? "Hindi" : "English"}</span>
                <span>&middot;</span>
                <span className="tabular-nums">{formatDateTime(call.started_at ?? call.created_at)}</span>
              </div>

              {/* AI summary */}
              {call.summary && (
                <p className="text-[14px] text-muted-foreground/60 leading-relaxed mt-4 max-w-2xl">
                  {call.summary}
                </p>
              )}

              {/* Mark as handled */}
              {call.status !== "completed" && (
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => handleMutation.mutate()}
                    disabled={handleMutation.isPending}
                    className="inline-flex items-center gap-2 bg-foreground text-background rounded-xl h-9 px-5 text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-3.5" />
                    {handleMutation.isPending ? "Marking\u2026" : "Mark as handled"}
                  </button>
                  {handleMutation.isSuccess && (
                    <span className="text-[12px] text-emerald-700">Done</span>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
            {/* Left column — Transcript */}
            <div className="space-y-5">
              {isLoading ? (
                <TranscriptSkeleton />
              ) : call?.transcript && call.transcript.length > 0 ? (
                <>
                  <SectionLabel>Conversation</SectionLabel>
                  <div className="space-y-4">
                    {call.transcript.map((turn: TranscriptTurn, i: number) => (
                      <ChatBubble key={i} turn={turn} />
                    ))}
                  </div>
                </>
              ) : !isLoading && call ? (
                <>
                  <SectionLabel>Conversation</SectionLabel>
                  <div className="flex flex-col items-center py-16 gap-4">
                    <FileText className="size-10 text-muted-foreground/15" strokeWidth={1.5} />
                    <p className="text-[13px] text-muted-foreground/30">No transcript available</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Right column — Details sidebar */}
            <div className="space-y-8">
              {isLoading ? (
                <SidebarSkeleton />
              ) : (
                <>
                  {/* Extracted data */}
                  {extractedEntries.length > 0 && (
                    <div className="space-y-4">
                      <SectionLabel>Details</SectionLabel>
                      <div className="space-y-3">
                        {extractedEntries.map(([key, value]) => (
                          <InfoItem key={key} label={formatLabel(key)}>
                            {String(value)}
                          </InfoItem>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Patient section */}
                  {leadQuery.isLoading ? (
                    <div className="space-y-3">
                      <div className="h-2.5 w-14 bg-muted/40 animate-pulse rounded-lg" />
                      <div className="h-3 w-28 bg-muted/50 animate-pulse rounded-lg" />
                      <div className="h-3 w-24 bg-muted/50 animate-pulse rounded-lg" />
                    </div>
                  ) : lead ? (
                    <div className="space-y-4">
                      <SectionLabel>Patient</SectionLabel>
                      <div className="space-y-3">
                        <InfoItem label="Name">{lead.name ?? "Unknown"}</InfoItem>
                        <InfoItem label="Phone">
                          <span className="tabular-nums">{lead.phone}</span>
                        </InfoItem>
                        {lead.service_needed && (
                          <InfoItem label="Service needed">{lead.service_needed}</InfoItem>
                        )}
                        <InfoItem label="Urgency">
                          <span
                            className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                              urgencyStyles[lead.urgency] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {lead.urgency}
                          </span>
                        </InfoItem>
                        {lead.notes && (
                          <InfoItem label="Notes">
                            <span className="text-muted-foreground/60">{lead.notes}</span>
                          </InfoItem>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Appointment section */}
                  {appointmentQuery.isLoading ? (
                    <div className="space-y-3">
                      <div className="h-2.5 w-20 bg-muted/40 animate-pulse rounded-lg" />
                      <div className="h-3 w-32 bg-muted/50 animate-pulse rounded-lg" />
                      <div className="h-3 w-28 bg-muted/50 animate-pulse rounded-lg" />
                    </div>
                  ) : appointment ? (
                    <div className="space-y-4">
                      <SectionLabel>Appointment</SectionLabel>
                      <div className="space-y-3">
                        {appointment.service_type && (
                          <InfoItem label="Service">{appointment.service_type}</InfoItem>
                        )}
                        <InfoItem label="Date / Time">
                          <span className="tabular-nums">{formatDateTime(appointment.scheduled_start)}</span>
                        </InfoItem>
                        <InfoItem label="Status">
                          <span
                            className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                              appointment.status === "confirmed"
                                ? "bg-emerald-500/10 text-emerald-700"
                                : appointment.status === "cancelled" || appointment.status === "no_show"
                                  ? "bg-red-500/10 text-red-700"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {formatLabel(appointment.status)}
                          </span>
                        </InfoItem>
                        {appointment.notes && (
                          <InfoItem label="Notes">
                            <span className="text-muted-foreground/60">{appointment.notes}</span>
                          </InfoItem>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Audio player */}
                  {call?.recording_url && (
                    <div className="space-y-4">
                      <SectionLabel>Recording</SectionLabel>
                      <AudioPlayer src={call.recording_url} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
