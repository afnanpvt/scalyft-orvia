# Sarvam bridge (proof of concept)

Lets a Vapi assistant use Sarvam for speech in and out, so calls work in Kannada, Telugu, Hindi and English.
Vapi has no built-in Sarvam provider, so this server plugs in as a `custom-transcriber` and `custom-voice`.
The brain is GPT-4o (default, reliable with tools) or Sarvam 105B, switchable on the test page. Booking tools are mocks with the same names and arguments as Orvia's real ones (tools.js).

- **STT:** Saaras v4, language auto-detected (`STT_LANGUAGE=unknown`). Only the caller channel is sent.
- **TTS:** Bulbul v3. The language is picked per reply from its script (Kannada, Telugu, Devanagari, else Indian English).
- **Auth:** Vapi sends `?token=BRIDGE_TOKEN` on both URLs. Requests without it get 401.

## Run it

1. `cp .env.example .env` and fill `SARVAM_API_KEY`, `BRIDGE_TOKEN`, `VAPI_API_KEY`.
2. `npm install && npm start`
3. Expose it: `ngrok http 3001` (or cloudflared). Put the https URL in `PUBLIC_URL`.
4. `npm run create-assistant -- kn` (or `te`, `hi`, `en`). Prints an assistant id.
5. Open `test.html` in a browser, paste your Vapi public key and the assistant id, start a call.

Watch the server console: every STT result and TTS call logs its language and latency.

## What to judge

- Does Saaras catch Kannada/Telugu with English words mixed in? Check the `STT (...)` log lines.
- Time from end of your sentence to the first sound. TTS is one request per reply (not streamed), so expect a gap. Try `bulbul:v4-flash` in `server.js` if it feels slow (needs a v4 speaker id).
- Compare against Eleven v3: set a business to Kannada in Settings and run the same script.
- Latency from Vapi's servers to this bridge to Sarvam (India). Host the bridge in an Indian region for real use.

## Not done yet

Tools (booking, lead capture), phone numbers, per-business config, and streaming TTS.

## Cost panel

The test page shows each service in use and a live cost estimate (meter.js has the price list). Sarvam usage is counted by the bridge. GPT-4o tokens are estimated during the call and replaced by Vapi's own end-of-call report. Prices are list prices; set `USD_INR` to change the exchange rate.

## Direct mode (no Vapi)

The test page's "Line" setting defaults to **Direct test**: the browser streams the microphone to `/api/live`
(live.js), which runs Sarvam listening, the brain (with the mock booking tools) and Sarvam voice itself, and streams
the voice back. No Vapi fee, so it is the cheapest way to judge language quality. "Via Vapi" keeps the old path
(Vapi in the middle, phone-ready). Direct mode shows the reply delay (wait for you to finish + brain + voice).

Brains: `sarvam-105b-conversations` (default, called the booking tool on 12 of 12 test turns), `sarvam-105b`
(9 of 12), GPT-4o (direct needs `OPENAI_API_KEY` in `.env`; over Vapi it uses Vapi's own).
