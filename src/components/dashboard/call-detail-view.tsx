import { Badge } from "@/components/ui/badge";
import { TranscriptView } from "./transcript-view";
import { MarkHandledButton } from "./mark-handled-button";
import type { Call, Lead, Appointment } from "@/lib/types";
import { Phone, Clock, Calendar, Globe } from "lucide-react";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
      {children}
    </h2>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5">
      <dt className="text-[13px] text-muted-foreground/70">{label}</dt>
      <dd className="text-[14px] text-foreground text-right">{children}</dd>
    </div>
  );
}

export function CallDetailView({
  call,
  lead,
  appointment,
}: {
  call: Call;
  lead: Lead | null;
  appointment: Appointment | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Left column: summary + transcript */}
      <div className="space-y-8 lg:col-span-2">
        {/* Call Summary */}
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-5">
          <div className="flex items-center justify-between">
            <SectionTitle>Call Summary</SectionTitle>
            {call.outcome && (
              <Badge className="rounded-full text-[12px] font-medium px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                {call.outcome.replace("_", " ")}
              </Badge>
            )}
          </div>
          <p className="text-[14px] leading-relaxed text-foreground/90">
            {call.summary ?? "No summary available."}
          </p>
          <div className="flex flex-wrap gap-5 text-[13px] text-muted-foreground/70">
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" />
              {call.caller_phone ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {call.duration_secs
                ? `${Math.floor(call.duration_secs / 60)}m ${call.duration_secs % 60}s`
                : "\u2014"}
            </span>
            {call.language_detected && (
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5" />
                {call.language_detected === "hi" ? "Hindi" : "English"}
              </span>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            {call.caller_phone && (
              <a
                href={`tel:${call.caller_phone}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-muted/60"
              >
                <Phone className="size-3.5" /> Call Back
              </a>
            )}
            <MarkHandledButton callId={call.id} />
          </div>
        </div>

        {/* Recording */}
        {call.recording_url && (
          <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
            <SectionTitle>Recording</SectionTitle>
            <a
              href={call.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] text-primary font-medium underline underline-offset-2"
            >
              Listen to recording
            </a>
          </div>
        )}

        {/* Transcript */}
        <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
          <SectionTitle>Transcript</SectionTitle>
          <TranscriptView transcript={call.transcript} />
        </div>
      </div>

      {/* Right column: patient info + appointment */}
      <div className="space-y-8">
        {/* Patient Details */}
        {lead && (
          <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
            <SectionTitle>Patient Details</SectionTitle>
            <dl className="divide-y divide-border/30">
              <DetailRow label="Name">{lead.name ?? "\u2014"}</DetailRow>
              <DetailRow label="Phone">{lead.phone}</DetailRow>
              <DetailRow label="Service">{lead.service_needed ?? "\u2014"}</DetailRow>
              <DetailRow label="Urgency">
                <Badge
                  className={`rounded-full text-[12px] font-medium px-2.5 py-0.5 border-0 ${
                    lead.urgency === "emergency" || lead.urgency === "urgent"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {lead.urgency}
                </Badge>
              </DetailRow>
              {lead.notes && (
                <DetailRow label="Notes">{lead.notes}</DetailRow>
              )}
            </dl>
          </div>
        )}

        {/* Appointment */}
        {appointment && (
          <div className="bg-card rounded-2xl border-0 shadow-none p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-muted-foreground/60" />
              <SectionTitle>Appointment</SectionTitle>
            </div>
            <dl className="divide-y divide-border/30">
              <DetailRow label="Date & Time">
                {new Date(appointment.scheduled_start).toLocaleString(
                  "en-IN",
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </DetailRow>
              <DetailRow label="Service">{appointment.service_type ?? "\u2014"}</DetailRow>
              <DetailRow label="Status">
                <Badge className="rounded-full text-[12px] font-medium px-2.5 py-0.5 bg-muted text-muted-foreground border-0">
                  {appointment.status}
                </Badge>
              </DetailRow>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
