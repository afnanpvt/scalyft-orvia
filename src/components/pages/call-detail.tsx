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
  Phone,
  Clock,
  Calendar,
} from "lucide-react"

import {
  getCallById,
  getLeadByCallId,
  getAppointmentByCallId,
  markCallHandled,
} from "@/lib/api"
import type { TranscriptTurn } from "@/lib/types"

// --- Helpers ------------------------------------------------

function formatDuration(secs: number | null): string {
  if (secs == null) return "--"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "--"
  return value.replace(/_/g, " ")
}

const outcomeStyles: Record<string, string> = {
  appointment_booked: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
  lead_captured: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
  info_given: "bg-muted text-muted-foreground border border-transparent",
  transferred: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  missed: "bg-red-500/10 text-red-700 border border-red-500/20",
}

const statusStyles: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700",
  in_progress: "bg-blue-500/10 text-blue-700",
  missed: "bg-red-500/10 text-red-700",
  failed: "bg-red-500/10 text-red-700",
  transferred: "bg-amber-500/10 text-amber-700",
}

const urgencyStyles: Record<string, string> = {
  emergency: "bg-red-500/10 text-red-700 border border-red-500/20",
  urgent: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  routine: "bg-muted text-muted-foreground border border-transparent",
  inquiry: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
}

// --- Skeletons ----------------------------------------------

function HeroSkeleton() {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-6 w-36 bg-muted/50 animate-pulse rounded-lg" />
        <div className="h-5 w-20 bg-muted/40 animate-pulse rounded-full" />
      </div>
      <div className="h-3 w-48 bg-muted/30 animate-pulse rounded-lg" />
      <div className="h-4 w-full max-w-lg bg-muted/30 animate-pulse rounded-lg" />
    </div>
  )
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40">
        <div className="h-3 w-20 bg-muted/40 animate-pulse rounded-lg" />
      </div>
      <div className="px-5 py-4 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-12 bg-muted/30 animate-pulse rounded-lg" />
            <div className="h-3.5 w-32 bg-muted/50 animate-pulse rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Audio Player -------------------------------------------

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play() }
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
        className="flex items-center justify-center size-8 rounded-full bg-foreground text-background hover:opacity-85 transition-opacity cursor-pointer shrink-0"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
      </button>
      <div
        className="flex-1 h-1.5 bg-border/60 rounded-full cursor-pointer relative"
        onClick={handleSeek}
      >
        <div
          className="absolute inset-y-0 left-0 bg-foreground/70 rounded-full transition-[width] duration-100"
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

// --- Chat Bubble --------------------------------------------

function ChatBubble({ turn }: { turn: TranscriptTurn }) {
  const isAI = turn.role === "assistant"
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[80%] space-y-1">
        <p className={`text-[10px] font-medium text-muted-foreground/40 ${isAI ? "" : "text-right"}`}>
          {isAI ? "Orvia" : "Caller"}
        </p>
        <div
          className={`px-4 py-3 text-[13px] leading-relaxed rounded-2xl ${
            isAI
              ? "bg-muted/50 rounded-tl-sm"
              : "bg-card border border-border/50 rounded-tr-sm"
          }`}
        >
          {turn.content}
        </div>
        {turn.timestamp != null && (
          <p className={`text-[10px] tabular-nums text-muted-foreground/25 ${isAI ? "" : "text-right"}`}>
            {Math.floor(turn.timestamp / 60)}:{String(Math.floor(turn.timestamp % 60)).padStart(2, "0")}
          </p>
        )}
      </div>
    </div>
  )
}

// --- Detail Card Section ------------------------------------

function DetailCard({ title, icon: Icon, children }: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40">
        {Icon && <Icon className="size-3.5 text-muted-foreground/50" />}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
          {title}
        </h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground/50 shrink-0">{label}</span>
      <div className="text-[13px] text-foreground text-right">{children}</div>
    </div>
  )
}

// --- Page ---------------------------------------------------

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
  const extractedEntries = Object.entries(extracted).filter(([, v]) => v != null && v !== "")

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        to="/calls"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-3.5" />
        Back to Calls
      </Link>

      {/* Not found */}
      {!isLoading && !call && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle className="size-8 text-muted-foreground/15" strokeWidth={1.5} />
          <p className="text-[14px] text-muted-foreground/40">Call not found</p>
        </div>
      )}

      {(isLoading || call) && (
        <>
          {/* Hero card */}
          {isLoading ? (
            <HeroSkeleton />
          ) : call ? (
            <div className="bg-card border border-border/60 rounded-xl p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl font-semibold tracking-[-0.04em]">
                      {call.caller_phone ?? "Unknown caller"}
                    </h1>
                    {call.outcome && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${outcomeStyles[call.outcome] ?? "bg-muted text-muted-foreground"}`}>
                        {formatLabel(call.outcome)}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${statusStyles[call.status] ?? "bg-muted text-muted-foreground"}`}>
                      {formatLabel(call.status)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[12px] text-muted-foreground/45">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3" />
                      <span className="tabular-nums">{formatDuration(call.duration_secs)}</span>
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      <span className="tabular-nums">{formatDateTime(call.started_at ?? call.created_at)}</span>
                    </span>
                    {call.language_detected && (
                      <>
                        <span>·</span>
                        <span>{call.language_detected === "hi" ? "Hindi" : "English"}</span>
                      </>
                    )}
                  </div>
                </div>

                {call.status !== "completed" && (
                  <button
                    onClick={() => handleMutation.mutate()}
                    disabled={handleMutation.isPending}
                    className="inline-flex items-center gap-2 bg-foreground text-background rounded-lg h-9 px-4 text-[13px] font-medium cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-50 shrink-0"
                  >
                    <CheckCircle2 className="size-3.5" />
                    {handleMutation.isPending ? "Marking..." : "Mark handled"}
                  </button>
                )}
                {handleMutation.isSuccess && (
                  <span className="text-[12px] text-emerald-700 font-medium">Marked as handled</span>
                )}
              </div>

              {call.summary && (
                <p className="text-[14px] text-muted-foreground/65 leading-relaxed mt-4 max-w-2xl border-t border-border/40 pt-4">
                  {call.summary}
                </p>
              )}
            </div>
          ) : null}

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            {/* Transcript */}
            <div>
              {isLoading ? (
                <CardSkeleton rows={4} />
              ) : call?.transcript && call.transcript.length > 0 ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div className="space-y-4">
                    {call.transcript.map((turn: TranscriptTurn, i: number) => (
                      <ChatBubble key={i} turn={turn} />
                    ))}
                  </div>
                </DetailCard>
              ) : !isLoading && call ? (
                <DetailCard title="Conversation" icon={Phone}>
                  <div className="flex flex-col items-center py-12 gap-3">
                    <FileText className="size-8 text-muted-foreground/15" strokeWidth={1.5} />
                    <p className="text-[13px] text-muted-foreground/35">No transcript available</p>
                  </div>
                </DetailCard>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {isLoading ? (
                <>
                  <CardSkeleton rows={3} />
                  <CardSkeleton rows={3} />
                </>
              ) : (
                <>
                  {/* Extracted data */}
                  {extractedEntries.length > 0 && (
                    <DetailCard title="Call details">
                      {extractedEntries.map(([key, value]) => (
                        <InfoRow key={key} label={formatLabel(key)}>
                          {String(value)}
                        </InfoRow>
                      ))}
                    </DetailCard>
                  )}

                  {/* Caller / lead */}
                  {leadQuery.isLoading ? (
                    <CardSkeleton rows={3} />
                  ) : lead ? (
                    <DetailCard title="Caller" icon={Phone}>
                      <InfoRow label="Name">{lead.name ?? "Unknown"}</InfoRow>
                      <InfoRow label="Phone">
                        <a href={`tel:${lead.phone}`} className="tabular-nums hover:text-foreground/70 transition-colors">
                          {lead.phone}
                        </a>
                      </InfoRow>
                      {lead.service_needed && (
                        <InfoRow label="Service">{lead.service_needed}</InfoRow>
                      )}
                      <InfoRow label="Urgency">
                        <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${urgencyStyles[lead.urgency] ?? "bg-muted text-muted-foreground"}`}>
                          {lead.urgency}
                        </span>
                      </InfoRow>
                      {lead.notes && (
                        <InfoRow label="Notes">
                          <span className="text-muted-foreground/60 text-right">{lead.notes}</span>
                        </InfoRow>
                      )}
                    </DetailCard>
                  ) : null}

                  {/* Appointment */}
                  {appointmentQuery.isLoading ? (
                    <CardSkeleton rows={3} />
                  ) : appointment ? (
                    <DetailCard title="Appointment" icon={Calendar}>
                      {appointment.service_type && (
                        <InfoRow label="Service">{appointment.service_type}</InfoRow>
                      )}
                      <InfoRow label="Time">
                        <span className="tabular-nums">{formatDateTime(appointment.scheduled_start)}</span>
                      </InfoRow>
                      <InfoRow label="Status">
                        <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                          appointment.status === "confirmed"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : appointment.status === "cancelled" || appointment.status === "no_show"
                              ? "bg-red-500/10 text-red-700"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          {formatLabel(appointment.status)}
                        </span>
                      </InfoRow>
                      {appointment.notes && (
                        <InfoRow label="Notes">
                          <span className="text-muted-foreground/60 text-right">{appointment.notes}</span>
                        </InfoRow>
                      )}
                    </DetailCard>
                  ) : null}

                  {/* Recording */}
                  {call?.recording_url && (
                    <DetailCard title="Recording">
                      <AudioPlayer src={call.recording_url} />
                    </DetailCard>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
