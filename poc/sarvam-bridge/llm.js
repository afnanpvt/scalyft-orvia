// Streaming OpenAI-style chat completion (works for OpenAI and Sarvam). Calls onText
// for each text delta, collects tool calls and token usage.

async function streamChat({ url, headers, body, signal, onText }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
    signal,
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let usage = null;
  let finish = null;
  let firstAt = null;
  const calls = [];

  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.usage) usage = j.usage;
      const choice = j.choices && j.choices[0];
      if (!choice) continue;
      const d = choice.delta || {};
      if (d.content) {
        if (firstAt === null) firstAt = Date.now();
        text += d.content;
        onText(d.content);
      }
      for (const tc of d.tool_calls || []) {
        const k = tc.index ?? 0;
        calls[k] = calls[k] || { id: "", name: "", arguments: "" };
        if (tc.id && !calls[k].id) calls[k].id = tc.id;
        if (tc.function && tc.function.name && !calls[k].name) calls[k].name = tc.function.name;
        if (tc.function && tc.function.arguments) calls[k].arguments += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }
  return { text, toolCalls: calls.filter(Boolean), usage, finish, firstAt };
}

module.exports = { streamChat };
