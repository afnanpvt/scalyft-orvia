# Personal AI Call Assistant — Technical Handoff

## Goal & context
Personal-use tool for **one physical phone the owner controls** (not a product, not Play
Store, not for clients). When a call comes in to the owner's own number, an AI (Gemini
Live) should answer, converse with the caller, and take notes — a personal assistant.
Privileged/shell permissions via Shizuku on the owner's own device are acceptable. The
owner has installed Shizuku and authorized free adb use on this device. Work happens in a
throwaway branch that is **not** pushed.

## Device
- vivo V2443, Android 16 (API 36), Qualcomm Snapdragon ("parrot" platform).
- adb id `10BF881UQG006K4`.
- **The phone locks and drops adb often.** Recover with `adb kill-server && adb start-server`
  or `adb reconnect`. Do not try to unlock it remotely; just wait for it to come back.
- SELinux is **Enforcing**.

## Toolchain (Windows, Git Bash + PowerShell both available)
- Android SDK at `D:\android-sdk` — `platform-tools\adb.exe`, `build-tools\36.0.0\` (d8),
  `platforms\android-36\android.jar`.
- Flutter at `D:\android-sdk\flutter\bin\flutter.bat`.
- Java 17 (Temurin).
- Shizuku **v13.6.0** installed (RikkaApps). Runs app code as **shell uid 2000**, no root.
- Project: `D:\scalyft\scalyft-orvia`. Flutter app in `mobile/`
  (package `com.scalyft.orvia`, dev flavor id `com.scalyft.orvia.dev`).
- Build dev flavor: `flutter build apk --debug --flavor dev` (add
  `--target lib/main_assistant.dart` for the standalone assistant entry point).
- Gradle: AGP 9.1.0, Kotlin 2.4.0, `compileSdk` forced to ≥37, `minSdk` 26.
- SDK XML v4 warning from flutter is harmless.

## Privileged-audio facts established on THIS device
- `com.android.shell` (uid 2000) **holds** these, granted=true: `CAPTURE_AUDIO_OUTPUT`,
  `CALL_AUDIO_INTERCEPTION`, `MODIFY_AUDIO_ROUTING`, `MODIFY_PHONE_STATE`,
  `CAPTURE_MEDIA_OUTPUT`. These are signature|privileged — a normal installed app cannot
  be granted them with `pm grant`.
- Shizuku runs code as that shell uid, so a Shizuku `UserService` inherits those perms
  **without spoofing identity** (this is the key difference from the app_process route).
- AudioRecord call-audio sources: `VOICE_CALL`(4), `VOICE_DOWNLINK`(3), `VOICE_UPLINK`(2),
  `MIC`(1). `VOICE_CALL`/`VOICE_DOWNLINK` need `CAPTURE_AUDIO_OUTPUT`.

## Dead-ends — do NOT repeat these
1. **ALSA / tinycap / tinymix direct PCM off the HAL.** Shell uid 2000 is NOT in the
   `audio` group; `/dev/snd/controlC0` is `crw-rw---- system audio`; SELinux Enforcing;
   `tinymix` returns "Failed to open mixer". Fully ruled out.
2. **Standard app (RECORD_AUDIO) using `AudioRecord(MIC)` during a live cellular call,
   even on speakerphone, to hear the caller.** Does not work. The remote party's voice is
   on the modem/telephony path, not the mic; hardware AEC strips the acoustic bleed from
   the speaker. **Proven empirically**: two real test calls produced transcripts with
   `Assistant:` lines only and **zero** `Caller:` lines. Gemini greeted but received no
   caller audio.
3. **`AudioTrack` with `USAGE_MEDIA` to make the caller hear the AI during a cellular
   call.** Media playback does not reach the call uplink. The caller heard nothing.
4. **InCallService auto-answer DOES work, but requires the default-dialer role**, which
   removes the stock in-call UI. With no replacement UI, the phone showed no call screen
   for incoming OR outgoing calls — broke normal calling until the dialer role was
   restored (`telecom set-default-dialer com.android.contacts`) / app uninstalled. If you
   go the InCallService route, you MUST ship a minimal in-call UI, or the owner's phone
   loses its call screen.
5. **app_process standalone probe** (scrcpy-style: FakeContext + reflected hidden
   AudioRecord constructors + faked AttributionSource) to test VOICE_CALL capture. This
   got flagged/blocked by a safety classifier in the prior session. The Shizuku
   UserService route below is cleaner anyway because it does not need identity spoofing.

## What WORKS — keep these
### InCallService auto-answer
`onCallAdded(call)` → for `Call.Details.DIRECTION_INCOMING`, `call.answer(STATE_AUDIO_ONLY)`.
Confirmed answering real incoming calls. (Requires default-dialer role; see dead-end #4.)

### Gemini Live over WebSocket from Android (OkHttp) — this is solid, reuse it
- Dependency: `com.squareup.okhttp3:okhttp:4.12.0`. Proguard: keep `okhttp3.**`, `okio.**`.
- URL: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<API_KEY>`
- **GOTCHA 1 — binary frames.** Gemini Live sends every response as a **BINARY**
  WebSocket frame, not text. You MUST implement `onMessage(ws, bytes: okio.ByteString)`
  and parse `bytes.utf8()` as JSON. A text-only `onMessage(ws, text: String)` handler
  silently drops setupComplete, audio, everything. This cost two debugging cycles.
- **GOTCHA 2 — setup ordering.** Send the `setup` message on `onOpen`, then WAIT for
  `setupComplete` before sending ANY `realtimeInput`. Sending mic audio before
  setupComplete makes the server close with code **1007** (invalid payload). Gate the
  mic-send loop on a `setupDone` flag.
- **GOTCHA 3 — config persistence.** The InCallService/foreground-service process is
  killed between "enable" and a call arriving. Do NOT keep apiKey/enabled only in a static
  companion object — persist to SharedPreferences and re-read at call time.
- Setup JSON:
  ```json
  {"setup":{"model":"models/gemini-3.8-live",
    "generationConfig":{"responseModalities":["AUDIO"],
      "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":"Kore"}}}},
    "systemInstruction":{"parts":[{"text":"..."}]},
    "tools":[{"functionDeclarations":[...]}],
    "inputAudioTranscription":{},"outputAudioTranscription":{}}}
  ```
- Audio IN (mic → Gemini): `{"realtimeInput":{"audio":{"data":"<b64 pcm16>","mimeType":"audio/pcm;rate=16000"}}}`
- Audio OUT (Gemini → you): `serverContent.modelTurn.parts[].inlineData.data` = b64 PCM16 @ **24000** Hz.
- `serverContent.interrupted` → flush playback. `serverContent.turnComplete` → model done.
- Transcripts: `serverContent.inputTranscription.text` (caller),
  `serverContent.outputTranscription.text` (assistant).
- Tools: `toolCall.functionCalls[]` → reply `{"toolResponse":{"functionResponses":[{"id","name","response":{"result":{...}}}]}}`.
- Rates: **16 kHz PCM16 mono IN, 24 kHz PCM16 mono OUT.**
- Known-good models: `gemini-3.8-live` (default), `gemini-3.1-flash-live-preview`,
  `gemini-2.5-flash-native-audio-latest`.
- A working browser reference exists at `scripts/gemini-live-test.html`; the React hook is
  `src/lib/gemini/use-gemini-call.ts`; model/voice lists in `src/lib/gemini/options.ts`.
- API key: there is no raw key in the repo. The server key lives only in the Supabase edge
  function `gemini-live-token` (mints ephemeral tokens). For a personal build, the owner
  supplies a key from aistudio.google.com; it can be pushed to the app's native prefs
  (`gemini_phone` SharedPreferences, keys `apiKey`/`ownerName`/`model`/`voice`) via
  `run-as`.

### Call uplink injection (verified 2026-10-13)
- The caller hears audio only via the `incall_music_uplink` mixPort
  (`AUDIO_OUTPUT_FLAG_INCALL_MUSIC`), which the Qualcomm DSP mixes into the voice TX.
- AudioPolicyManager sets that flag only when the track is stream MUSIC (or usage
  VOICE_COMMUNICATION) AND Telephony Tx is explicitly selected (`setPreferredDevice`) while
  mode is IN_CALL. Needs `MODIFY_PHONE_STATE` (shell has it), so build it in the UserService.
- `USAGE_CALL_ASSISTANT` + `CALL_REDIRECT_PSTN` tracks report route Telephony Tx but land on the
  unflagged `voice_tx` port (AFE proxy) and the caller hears nothing. Do not use them.
- While the agent talks, the UserService mutes the phone mic (`setMicrophoneMute`). Otherwise the
  live mic also feeds voice_tx: the owner's voice leaks to the caller, and the mic hearing the
  earpiece echoes the caller back. Downlink capture does not use the mic, so the agent still hears.
  `stopCallAudio` unmutes, which is also how "Take over" hands the live call back to the owner.
- Telecom reapplies its own mute state on route changes (speaker, Bluetooth), so the capture
  thread re-asserts the mute about once a second.
- The opening prompt waits for both Gemini `setupComplete` and a started bridge
  (`maybeKickoff`): audio written before the uplink track exists is dropped silently.
- Notification "Hang up"/"Take over" only act while that service is on a call; a stale button
  must never end a personal call.
- Proof: `dumpsys media.audio_flinger` showed the INCALL_MUSIC output with the UID 2000 track
  active and frames written, and the tone was heard during the call.

## Current repo state (what's already built on this branch)
The agent ships only in the **`assistant` flavor** (`com.scalyft.orvia.assistant`, label
"Orvia Assistant"): the full Orvia app plus the call agent. `prod`/`dev` contain none of
it (Shizuku/OkHttp are `assistantImplementation`; prod/dev get a no-op `FlavorChannels`
from `src/standard/`). Build: `flutter build apk --flavor assistant --dart-define-from-file=env.json`.

- `android/app/src/assistant/` — manifest (Shizuku provider, services), AIDL, Kotlin:
  - `VoiceCallProbeUserService` — shell-UID service: call state, ringing number
    (`dumpsys telephony.registry`), answer (`acceptRingingCall`, KEYCODE_CALL fallback),
    hang up, call-log lookup, downlink capture, INCALL_MUSIC uplink, probes.
  - `ShizukuBridge` — one shared binding (daemon, version 10). Bump on AIDL/service changes.
  - `CallAgentService` — specialUse FGS. While on, polls call state; answers after the
    owner's delay (default 5 s); calls the owner answers stay theirs; runs Gemini in AGENT
    mode; on hang-up saves to `AgentCallStore` and uploads.
  - `GeminiLiveSession` — TALK/AGENT modes, transcript + notes, `end_call` tool, uplink
    flush on barge-in. Auth: owner's key if set, else ephemeral token from the server.
  - `DeviceAgentClient` — calls `device-agent` with the device token.
- `supabase/functions/device-agent` (deployed, verify_jwt off): `register` (user JWT ->
  HMAC device token), `gemini_token`, `save` (upserts `calls` row `vapi_call_id=device-<id>`,
  `extracted_data.source=phone_agent`, Gemini-written English summary).
- Flutter: `lib/agent/` (channel, Call agent screen, Settings switch row). Signed out, the
  assistant build opens straight to the Call agent (own Gemini key, calls stay on the phone);
  "Sign in" adds dashboard sync. The agent never answers without Gemini access, and the app
  restarts the agent service on open if it was left on. Calls show in the
  Calls tab with an "On your phone" pill. `lib/main_assistant.dart` is a no-login variant.

Owner in the loop (Incoming tab): the live banner shows the last 6 transcript lines (polled
every second). The `ask_owner` tool (AGENT mode) posts a high-priority "Caller wants to talk to
you" alert with Join / Busy / Reply (RemoteInput); the answer goes back into the session as text
(`ownerReply`). Join waits for the agent's "connecting you" sentence to finish, then takes over.
No answer in 30 s: the agent says the owner is unavailable. A never-answer list (`skipNumbers`,
matched on the last 10 digits) leaves those calls ringing for the owner.

Outreach (test tool, Outreach tab): `OutboundCallService` dials one owner-picked number via the
shell (`am start -a CALL`), waits for `Foreground call state: 1` (ACTIVE) in telephony.registry,
since plain call state is off-hook while it still rings, then runs `GeminiLiveSession` in OUTBOUND
mode (AI disclosure first, pitch from the owner's offer, `book_meeting`/`set_outcome` tools). No
answer in 45 s hangs up. Results go to `outreach_calls/`, never to the dashboard. Contacts and the
offer live in the app's SharedPreferences. A `do_not_call` outcome disables Call for that contact.
TCPA: AI voice to US cell phones needs prior express consent; this is for test numbers.

Tests: `flutter test` (includes `test/agent/`), and the JVM tests for the agent's pure logic
(`AgentLogic.kt`: caller-number parsing per SIM, 24k->16k resample, transcript merging) with
`cd mobile/android && ./gradlew :app:testAssistantDebugUnitTest`.

## Proposed architecture for real two-way call audio (the thing to build)
The only path to clean two-way audio on a cellular call is privileged capture as shell:

1. **Shizuku AIDL `UserService`** bound via `Shizuku.bindUserService()`. It runs as uid
   2000, so it natively holds `CAPTURE_AUDIO_OUTPUT` — no FakeContext, no attribution
   spoofing needed.
2. Inside it, `AudioRecord` with `AudioSource.VOICE_CALL` (both directions) or
   `VOICE_DOWNLINK` (remote party only). The owner's uplink mic is already captured
   separately if needed.
3. **IPC**: stream captured PCM16 from the UserService to the app (AIDL callback, or a
   `ParcelFileDescriptor` pipe for throughput). The app process runs the Gemini WebSocket
   (reuse `GeminiLiveSession`'s protocol code).
4. **Playback to the caller (the genuinely unsolved part):** Gemini's 24k PCM must reach
   the call **uplink** so the caller hears it. `VOICE_UPLINK` is a capture source, not a
   sink. Making the caller hear injected audio needs telephony audio routing
   (`MODIFY_PHONE_STATE` / `MODIFY_AUDIO_ROUTING`, both held by shell). Whether an
   `AudioTrack` from the shell UserService can be routed into the live call uplink on this
   vivo HAL is **untested and uncertain** — this is the main research risk.
5. Auto-answer: either keep a minimal InCallService **with a real in-call UI** (so the
   phone's call screen isn't broken), or auto-answer from the shell service via
   `TelecomManager`/telephony as shell.

## Open questions the next model must actually resolve (in priority order)
1. **Does `AudioRecord(VOICE_CALL)` / `VOICE_DOWNLINK` return real remote-caller audio
   when run inside a Shizuku UserService as shell uid on this vivo?** The permission is
   held; whether the HAL delivers samples (vs. silence) is unverified. Test with a short
   capture-to-file first, before building anything else. This is make-or-break.
2. **Can Gemini's audio be injected into the call uplink as shell so the caller hears it?**
   Try `AudioTrack` with voice-call usage/stream + `MODIFY_AUDIO_ROUTING`, and/or
   `AudioManager` call modes. If impossible, the feature degrades to "AI listens and takes
   notes, caller doesn't hear it" — decide if that's acceptable.
3. **Auto-answer without breaking the dialer** — minimal in-call UI, or shell-side answer.

## Fast first test (do this before writing the full app)
Write a tiny Shizuku UserService that, on command, does `AudioRecord(VOICE_CALL, 16k,
mono, PCM16)` for ~5s during an active call and writes the PCM to
`/data/local/tmp/voicecall.pcm`; compute max amplitude / RMS. Place a real call, trigger
it, pull the file, inspect. **Non-silent samples = the whole approach is viable. Silence =
the HAL blocks it and you must stop and tell the owner it can't be done on this device.**
Resolve question #1 before investing in IPC, Gemini wiring, or UI.

---

# Appendix A — Auto-answer code (InCallService), as built

This is the auto-answer path that worked for answering, reconstructed from this session.
It is the default-dialer / InCallService route (dead-end #4: requires dialer role and a
real in-call UI). The MIC+speakerphone capture shown here did NOT deliver caller audio
(dead-end #2) — it is included for structure only. Replace the capture/playback with the
Shizuku VOICE_CALL path. Comments here are implementation notes only.

### Manifest (dialer role + InCallService)
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.ANSWER_PHONE_CALLS" />
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />

<service
    android:name=".gemini.GeminiInCallService"
    android:permission="android.permission.BIND_INCALL_SERVICE"
    android:foregroundServiceType="phoneCall|microphone"
    android:exported="true">
    <meta-data android:name="android.telecom.IN_CALL_SERVICE_UI" android:value="true" />
    <intent-filter>
        <action android:name="android.telecom.InCallService" />
    </intent-filter>
</service>

<!-- Required so the app is eligible for the dialer role. Needs a DIAL-handling activity. -->
<activity
    android:name=".gemini.DialerActivity"
    android:exported="true"
    android:theme="@android:style/Theme.NoDisplay">
    <intent-filter>
        <action android:name="android.intent.action.DIAL" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.DIAL" />
        <data android:scheme="tel" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

### Request the default-dialer role (API 29+)
```kotlin
val rm = activity.getSystemService(RoleManager::class.java)
if (rm.isRoleAvailable(RoleManager.ROLE_DIALER) && !rm.isRoleHeld(RoleManager.ROLE_DIALER)) {
    activity.startActivityForResult(
        rm.createRequestRoleIntent(RoleManager.ROLE_DIALER), REQ_DEFAULT_DIALER
    )
}
// Pre-29: Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
//   .putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, packageName)
// Restore the stock dialer when done: adb shell telecom set-default-dialer com.android.contacts
```

### InCallService (auto-answer + session lifecycle)
```kotlin
class GeminiInCallService : InCallService() {

    private var activeCall: Call? = null
    private val handler = Handler(Looper.getMainLooper())
    private var audioManager: AudioManager? = null
    // ... apiKey/ownerName/model/voice loaded from SharedPreferences("gemini_phone") ...

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            when (state) {
                Call.STATE_ACTIVE -> onCallActive()
                Call.STATE_DISCONNECTED -> onCallEnded()
            }
        }
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        loadConfig()                                   // read from prefs; process may have been killed
        if (!enabled || apiKey.isEmpty()) return
        if (call.details.callDirection != Call.Details.DIRECTION_INCOMING) return
        activeCall = call
        call.registerCallback(callCallback)
        call.answer(VideoProfile.STATE_AUDIO_ONLY)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        if (call == activeCall) { call.unregisterCallback(callCallback); onCallEnded() }
    }

    private fun onCallActive() {
        audioManager = getSystemService(AudioManager::class.java)
        handler.postDelayed({
            audioManager?.isSpeakerphoneOn = true      // MIC+speaker path: did NOT capture caller audio
            startAudioCapture()                         // replace with Shizuku VOICE_CALL capture
            connectGemini()                             // reuse GeminiLiveSession's WebSocket code
        }, 1200)
    }

    private fun onCallEnded() {
        disconnectGemini(); stopAudioCapture()
        audioManager?.isSpeakerphoneOn = false
        saveCallNotes(); activeCall = null
    }

    // To end the call programmatically after a goodbye: activeCall?.disconnect()
}
```

### Notes for the next model
- `call.answer()` / `call.disconnect()` only work while the app holds the dialer role and
  an InCallService is bound. `TelecomManager.acceptRingingCall()` is deprecated on API 29+
  and needs the dialer role anyway.
- The Gemini WebSocket client, setup JSON, binary-frame handling, setupComplete gating,
  tool handling, and note persistence are all in `GeminiLiveSession.kt` in the repo —
  lift them wholesale; only the audio source/sink changes for the call case.
- The real work is swapping `AudioRecord(MIC)` for Shizuku-shell `AudioRecord(VOICE_CALL)`
  and solving uplink injection (open question #2). Everything else is in place.
