import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PhoneCall, PhoneOff, Loader2, X, Mic, Check, RotateCcw } from "lucide-react";
import { getBusinessSettings, getActiveVapiPublicKey } from "@/lib/api";
import { useAssistantCall, type CallPhase, type TranscriptEntry } from "@/lib/vapi/use-assistant-call";
import { OrviaLogo } from "@/components/brand/orvia-logo";

const ENV_VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined;

function formatElapsed(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const STEPS: { phase: CallPhase; label: string }[] = [
  { phase: "preparing", label: "Preparing your assistant" },
  { phase: "mic", label: "Checking your microphone" },
  { phase: "connecting", label: "Connecting the call" },
];

function ConnectSteps({ phase }: { phase: CallPhase }) {
  const current = STEPS.findIndex(s => s.phase === phase);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.phase} style={{ display: "flex", alignItems: "center", gap: 10, opacity: done || active ? 1 : 0.4 }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: done ? "#10B981" : "var(--muted)",
              color: done ? "#fff" : "var(--muted-foreground)",
            }}>
              {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={12} className="animate-spin" /> : null}
            </span>
            <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: active ? 600 : 400 }}>
              {step.label}{active ? "…" : ""}
            </span>
          </div>
        );
      })}
      {phase === "mic" && (
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginLeft: 30 }}>
          If your browser asks, click Allow.
        </p>
      )}
    </div>
  );
}

function Transcript({ entries, agentName }: { entries: TranscriptEntry[]; agentName: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", textAlign: "center", padding: "18px 0" }}>
        {agentName} will greet you in a second. Just talk normally.
      </p>
    );
  }
  return (
    <div ref={ref} style={{ height: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "2px 2px 4px" }}>
      {entries.map(e => {
        const ai = e.role === "assistant";
        return (
          <div key={e.id} style={{ display: "flex", justifyContent: ai ? "flex-start" : "flex-end" }}>
            <div style={{
              maxWidth: "82%", padding: "7px 11px", fontSize: 12.5, lineHeight: 1.45,
              borderRadius: ai ? "4px 13px 13px 13px" : "13px 4px 13px 13px",
              background: ai ? "var(--muted)" : "var(--foreground)",
              color: ai ? "var(--foreground)" : "var(--background)",
              opacity: e.partial ? 0.6 : 1,
            }}>
              {e.text || "…"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TestCallButton() {
  const { data: business } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettings });
  // The vault's active account (if any) takes priority over the static env
  // var — that's what lets switching accounts in /admin/vapi-accounts
  // actually change which Vapi org test calls run against.
  const { data: activeVaultKey } = useQuery({ queryKey: ["active-vapi-key"], queryFn: getActiveVapiPublicKey, staleTime: 10_000 });

  const call = useAssistantCall();
  const [open, setOpen] = useState(false);

  const busy = call.phase === "preparing" || call.phase === "mic" || call.phase === "connecting";
  const live = call.phase === "active";
  const agentName = business?.settings.receptionist_name || "Orvia";
  const publicKey = activeVaultKey || ENV_VAPI_PUBLIC_KEY;

  // Escape / backdrop close the window only when nothing is in flight — a
  // live or connecting call must be ended deliberately.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !live) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, live]);

  function handleStart() {
    if (!business || !publicKey) return;
    call.start(business, publicKey);
  }

  function handleClose() {
    if (busy || live) call.stop();
    call.reset();
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!business}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", fontFamily: "inherit",
          border: "1px solid var(--border)",
          background: live ? "#DC2626" : "var(--foreground)",
          color: live ? "#fff" : "var(--background)",
          cursor: business ? "pointer" : "not-allowed",
          opacity: business ? 1 : 0.5,
        }}
      >
        {live ? (
          <>
            <span className="animate-live-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
            On call · {formatElapsed(call.elapsed)}
          </>
        ) : busy ? (
          <><Loader2 size={14} className="animate-spin" /> Connecting…</>
        ) : (
          <><PhoneCall size={14} strokeWidth={2} /> Talk to Assistant</>
        )}
      </button>

      {/* Portaled to <body>: the header animates in with a transform, which
          would otherwise trap this window beneath the cards below it. */}
      {open && createPortal(
        <div
          onMouseDown={e => { if (e.target === e.currentTarget && !busy && !live) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(10,10,11,0.35)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}>
        <div role="dialog" aria-modal="true" aria-label="Talk to your assistant" className="animate-scale-in" style={{
          width: 460, maxWidth: "100%", maxHeight: "calc(100dvh - 32px)",
          display: "flex", flexDirection: "column",
          background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 18,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <OrviaLogo size={30} style={{ color: "var(--foreground)" }} />
              {live && (
                <span style={{
                  position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%",
                  background: call.speaking ? "#10B981" : "#A1A1AA", border: "2px solid var(--popover)",
                }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>{agentName}</p>
              <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {live ? (call.speaking ? `${agentName} is speaking` : "Listening…") : `AI receptionist · ${business?.name ?? ""}`}
              </p>
            </div>
            {live && (
              <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--muted-foreground)" }}>
                {formatElapsed(call.elapsed)}
              </span>
            )}
            <button type="button" onClick={handleClose} aria-label={live || busy ? "End call and close" : "Close"}
              style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {call.phase === "idle" && (
              <>
                <p style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.5, marginBottom: 4 }}>
                  Have a real conversation with {agentName}, right in your browser.
                </p>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Try booking an appointment or asking about prices. Uses your microphone.
                </p>
                {!publicKey && (
                  <p style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>No Vapi key yet. Add one in Admin · Vapi Accounts.</p>
                )}
              </>
            )}

            {busy && <ConnectSteps phase={call.phase} />}

            {(live || call.phase === "ended") && <Transcript entries={call.transcript} agentName={agentName} />}

            {call.phase === "ended" && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8 }}>
                Call ended{call.elapsed ? ` · ${formatElapsed(call.elapsed)}` : ""}. Any booking shows up on your dashboard.
              </p>
            )}

            {call.phase === "error" && (
              <p style={{ fontSize: 12.5, color: "#DC2626", lineHeight: 1.5 }}>{call.error}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
            {(call.phase === "idle" || call.phase === "error" || call.phase === "ended") && (
              <>
                <button type="button" onClick={handleStart} disabled={!publicKey}
                  style={{
                    flex: 1, height: 38, borderRadius: 10, border: "none", fontFamily: "inherit",
                    background: "var(--foreground)", color: "var(--background)",
                    fontSize: 13, fontWeight: 600, cursor: publicKey ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    opacity: publicKey ? 1 : 0.5,
                  }}>
                  {call.phase === "idle" ? <><Mic size={14} /> Start call</> : <><RotateCcw size={14} /> Call again</>}
                </button>
                <button type="button" onClick={handleClose}
                  style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  {call.phase === "idle" ? "Cancel" : "Close"}
                </button>
              </>
            )}
            {busy && (
              <button type="button" onClick={call.stop}
                style={{ flex: 1, height: 38, borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            )}
            {live && (
              <button type="button" onClick={call.stop}
                style={{
                  flex: 1, height: 38, borderRadius: 10, border: "none", fontFamily: "inherit",
                  background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}>
                <PhoneOff size={14} /> End call
              </button>
            )}
          </div>

          {(call.phase === "idle" || call.phase === "ended") && (
            <Link to="/demo" onClick={() => setOpen(false)}
              style={{ display: "block", textAlign: "center", fontSize: 11.5, color: "var(--muted-foreground)", padding: "10px 16px", borderTop: "1px solid var(--border)", textDecoration: "none" }}>
              Want the full walkthrough? Open the Demo page
            </Link>
          )}
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
