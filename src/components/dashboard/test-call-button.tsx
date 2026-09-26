import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinessSettings } from "@/lib/api";
import { buildAssistantConfig } from "@/lib/vapi/build-assistant-config";
import { PhoneCall, PhoneOff, Loader2 } from "lucide-react";
import type { CreateAssistantDTO } from "@vapi-ai/web/dist/api";

// buildAssistantConfig's return type intentionally uses widened string
// literals (it's shared with the Deno edge function, which can't import
// Vapi's SDK types) — narrow it here at the one place we hand it to the SDK.

type CallState = "idle" | "connecting" | "active" | "error";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function TestCallButton() {
  const { data: business } = useQuery({
    queryKey: ["business-settings"],
    queryFn: getBusinessSettings,
  });

  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<InstanceType<typeof import("@vapi-ai/web").default> | null>(null);

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  async function startCall() {
    if (!VAPI_PUBLIC_KEY) {
      setError("Vapi public key not configured");
      setState("error");
      return;
    }
    if (!business) return;

    setState("connecting");
    setError(null);

    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(VAPI_PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setState("active"));
      vapi.on("call-end", () => setState("idle"));
      vapi.on("error", (e: unknown) => {
        console.error("Vapi test call error", e);
        setError("Call failed — check mic permissions and Vapi key");
        setState("error");
      });

      await vapi.start(buildAssistantConfig(business, SUPABASE_URL) as CreateAssistantDTO);
    } catch (e) {
      console.error(e);
      setError("Could not start call");
      setState("error");
    }
  }

  function endCall() {
    vapiRef.current?.stop();
    setState("idle");
  }

  const isBusy = state === "connecting" || state === "active";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={isBusy ? endCall : startCall}
        disabled={state === "connecting" || !business}
        aria-label={isBusy ? "End test call" : "Start test call with assistant"}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
          border: "1px solid var(--border)",
          background: state === "active" ? "#DC2626" : "var(--foreground)",
          color: state === "active" ? "#fff" : "var(--background)",
          cursor: state === "connecting" ? "wait" : "pointer",
          opacity: !business ? 0.5 : 1,
        }}
      >
        {state === "connecting" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state === "active" ? (
          <PhoneOff size={14} strokeWidth={2} />
        ) : (
          <PhoneCall size={14} strokeWidth={2} />
        )}
        {state === "connecting" ? "Connecting…" : state === "active" ? "End test call" : "Talk to Assistant"}
      </button>
      {error && (
        <span style={{ fontSize: 11.5, color: "#DC2626" }}>{error}</span>
      )}
    </div>
  );
}
