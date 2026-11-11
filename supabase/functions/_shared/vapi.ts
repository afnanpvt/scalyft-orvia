// Parsing helpers for Vapi tool-call payloads (shared by all tool endpoints).

export interface VapiToolCall {
  id: string;
  name?: string;
  arguments?: Record<string, unknown>;
  function?: { name: string; arguments: string | Record<string, unknown> };
}

export interface ParsedToolCall {
  toolCallId: string | null;
  args: Record<string, unknown>;
  vapiCallId: string | null;
  callerPhone: string | null;
}

export function parseToolCall(body: Record<string, unknown>): ParsedToolCall {
  const msg = body.message as Record<string, unknown> | undefined;
  const list =
    (msg?.toolCallList as VapiToolCall[] | undefined) ??
    (msg?.toolCalls as VapiToolCall[] | undefined) ??
    (body.toolCallList as VapiToolCall[] | undefined) ??
    (body.toolCalls as VapiToolCall[] | undefined);
  const tc = list?.[0];

  let args: Record<string, unknown> = {};
  if (tc) {
    const fnArgs = tc.function?.arguments;
    if (fnArgs && typeof fnArgs === "object") args = fnArgs;
    else if (typeof fnArgs === "string") {
      try { args = JSON.parse(fnArgs); } catch { args = {}; }
    } else if (tc.arguments && typeof tc.arguments === "object") args = tc.arguments;
  } else {
    args = body; // direct invocation (manual testing)
  }

  const call = msg?.call as Record<string, unknown> | undefined;
  const customer = call?.customer as Record<string, unknown> | undefined;
  return {
    toolCallId: tc?.id ?? null,
    args,
    vapiCallId: (call?.id as string) ?? null,
    callerPhone: (customer?.number as string) ?? null,
  };
}

export function toolResponse(toolCallId: string | null, name: string, result: unknown): Response {
  const body = toolCallId
    ? { results: [{ toolCallId, name, result: typeof result === "string" ? result : JSON.stringify(result) }] }
    : (result as object);
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function runInBackground(p: Promise<unknown>) {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}
