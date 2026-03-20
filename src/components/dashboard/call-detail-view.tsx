import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptView } from "./transcript-view";
import { MarkHandledButton } from "./mark-handled-button";
import type { Call, Lead, Appointment } from "@/lib/types";
import { Phone, Clock, Calendar } from "lucide-react";

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
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Call Summary</span>
            {call.outcome && (
              <Badge>{call.outcome.replace("_", " ")}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {call.summary ?? "No summary available."}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {call.caller_phone ?? "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {call.duration_secs
                ? `${Math.floor(call.duration_secs / 60)}m ${call.duration_secs % 60}s`
                : "—"}
            </span>
            {call.language_detected && (
              <span>
                Language: {call.language_detected === "hi" ? "Hindi" : "English"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {call.caller_phone && (
              <a
                href={`tel:${call.caller_phone}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <Phone className="h-3.5 w-3.5" /> Call Back
              </a>
            )}
            <MarkHandledButton callId={call.id} />
          </div>
        </CardContent>
      </Card>

      {/* Lead info */}
      {lead && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{lead.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{lead.phone}</dd>
              <dt className="text-muted-foreground">Service</dt>
              <dd>{lead.service_needed ?? "—"}</dd>
              <dt className="text-muted-foreground">Urgency</dt>
              <dd>
                <Badge
                  variant={
                    lead.urgency === "emergency" || lead.urgency === "urgent"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {lead.urgency}
                </Badge>
              </dd>
              {lead.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd>{lead.notes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Appointment */}
      {appointment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Appointment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Date & Time</dt>
              <dd>
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
              </dd>
              <dt className="text-muted-foreground">Service</dt>
              <dd>{appointment.service_type ?? "—"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant="secondary">{appointment.status}</Badge>
              </dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Recording */}
      {call.recording_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={call.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              Listen to recording
            </a>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <TranscriptView transcript={call.transcript} />
        </CardContent>
      </Card>
    </div>
  );
}
