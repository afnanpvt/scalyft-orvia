package com.scalyft.orvia.gemini

import android.content.Context
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import okhttp3.*
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Live Gemini session. During cellular calls, Shizuku supplies 16 kHz call downlink
 * and injects Gemini's 24 kHz replies into the telephony uplink; otherwise use the mic.
 *
 * [Mode.AGENT] is a call the agent answered for the owner: it greets as the owner's
 * assistant, takes a message, and can hang up. [Mode.TALK] is the owner talking to
 * Gemini, or pulling it into a call they answered themselves.
 */
class GeminiLiveSession(
    private val context: Context,
    private val callAudioBridge: IVoiceCallProbe? = null,
    private val mode: Mode = Mode.TALK,
    private val listener: Listener? = null,
    /** Only for [Mode.OUTBOUND]: who we are calling and what we are offering. */
    private val brief: OutboundBrief? = null
) {

    enum class Mode { TALK, AGENT, OUTBOUND }

    /** What an outreach call is about. Typed by the owner on the Outreach tab. */
    data class OutboundBrief(
        val company: String,
        val pitch: String,
        val availability: String,
        val contactName: String,
        val contactBusiness: String,
    )

    /** The two modes where the agent is on a phone call with someone else. */
    private val onPhoneCall get() = mode == Mode.AGENT || mode == Mode.OUTBOUND

    interface Listener {
        /** The assistant said goodbye and wants the call ended. */
        fun onHangupRequested() {}
        /** The call audio bridge could not start. */
        fun onBridgeFailed(reason: String) {}
        /** The caller wants the owner in person; ask them (AGENT mode). */
        fun onOwnerRequested(reason: String) {}
    }

    companion object {
        const val TAG = "GeminiPhone"
        const val PREFS = "gemini_phone"
        const val IN_RATE = 16000
        const val OUT_RATE = 24000
        const val DEFAULT_MODEL = "gemini-3.8-live"
        /** Longest call the agent stays on, so a stuck call cannot run up cost. */
        const val MAX_CALL_MS = 10 * 60 * 1000L
        val OUTCOMES = listOf("interested", "not_interested", "call_back", "do_not_call", "wrong_number", "voicemail")

        var statusCallback: ((String) -> Unit)? = null
        private fun status(msg: String) {
            Log.i(TAG, msg)
            statusCallback?.invoke(msg)
        }
    }

    private var ownerName = ""
    private var geminiModel = DEFAULT_MODEL
    private var geminiVoice = "Kore"

    private var ws: WebSocket? = null
    private var httpClient: OkHttpClient? = null
    private var recorder: AudioRecord? = null
    private var player: AudioTrack? = null
    private var aec: AcousticEchoCanceler? = null
    private var ns: NoiseSuppressor? = null
    @Volatile private var recording = false
    @Volatile private var stopped = false
    @Volatile private var modelSpeaking = false
    @Volatile private var setupDone = false
    @Volatile private var hangupRequested = false
    private val main = Handler(Looper.getMainLooper())
    private var apiKey = ""
    @Volatile private var reconnects = 0
    private var timersArmed = false

    // On a call, the greeting must wait for both the Gemini setup and the call audio bridge;
    // audio written before the uplink track exists is silently dropped.
    @Volatile private var bridgeReady = false
    @Volatile private var kickoffSentFor = -1

    // Gemini streams audio faster than real time. Playing it on its own thread keeps the
    // socket reader free, so an "interrupted" message is handled at once, not after every
    // chunk already received has played.
    private val playQueue = java.util.concurrent.LinkedBlockingQueue<ByteArray>()
    @Volatile private var playing = false

    private val transcriptBuilder = TranscriptBuilder()
    private val notes = mutableListOf<String>()

    /** (role, text) turns; role is "user" (the caller) or "assistant". */
    fun transcript(): List<Pair<String, String>> = transcriptBuilder.turns()

    fun notes(): List<String> = synchronized(notes) { notes.toList() }

    /** True while the agent is still talking or has audio queued for the caller. */
    val speaking: Boolean get() = modelSpeaking || playing || playQueue.isNotEmpty()

    /**
     * Passes the owner's answer to an ask_owner request into the conversation, as an
     * instruction the model acts on right away.
     */
    fun ownerReply(instruction: String) {
        if (stopped) return
        try {
            ws?.send(JSONObject().put("realtimeInput", JSONObject().put("text", instruction)).toString())
        } catch (e: Exception) {
            Log.w(TAG, "Owner reply not sent", e)
        }
    }

    // Outreach results, set by the book_meeting and set_outcome tools.
    @Volatile var meeting: JSONObject? = null
        private set
    @Volatile var outcome: String? = null
        private set

    private val callAudioCallback = object : IVoiceCallAudioCallback.Stub() {
        override fun onPcmChunk(pcm16: ByteArray) {
            if (!setupDone || !recording) return
            val b64 = Base64.encodeToString(pcm16, Base64.NO_WRAP)
            val msg = JSONObject().put("realtimeInput", JSONObject()
                .put("audio", JSONObject()
                    .put("data", b64)
                    .put("mimeType", "audio/pcm;rate=$IN_RATE")))
            try { ws?.send(msg.toString()) } catch (e: Exception) {
                Log.w(TAG, "Call downlink send failed", e)
            }
        }

        override fun onError(message: String) {
            status(message)
        }
    }

    fun start() {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        apiKey = p.getString("apiKey", "") ?: ""
        ownerName = p.getString("ownerName", "") ?: ""
        geminiModel = p.getString("model", DEFAULT_MODEL)?.ifBlank { DEFAULT_MODEL } ?: DEFAULT_MODEL
        geminiVoice = p.getString("voice", "Kore")?.ifBlank { "Kore" } ?: "Kore"
        Thread({ playbackLoop() }, "gemini-playback").apply { isDaemon = true; start() }
        Thread({
            val url = resolveUrl()
            if (url == null) {
                giveUp()
                return@Thread
            }
            if (stopped) return@Thread
            main.post { if (!stopped) startAudio() }
            connect(url)
        }, "gemini-connect").start()
    }

    /** A key the owner typed wins; otherwise Orvia mints a short-lived, single-use token. */
    private fun resolveUrl(): String? {
        if (apiKey.isNotEmpty()) {
            return "wss://generativelanguage.googleapis.com/ws/" +
                "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=$apiKey"
        }
        val token = DeviceAgentClient(context).geminiToken()
        if (token == null) {
            status("No Gemini access. Link this phone to Orvia or add a Gemini key.")
            return null
        }
        return "wss://generativelanguage.googleapis.com/ws/" +
            "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${token.first}"
    }

    /** During an answered call a dropped socket would leave the caller in silence. */
    private fun reconnect(reason: String) {
        if (stopped || !onPhoneCall || reconnects >= 2) {
            status("Disconnected: $reason")
            giveUp()
            return
        }
        reconnects++
        setupDone = false
        status("Reconnecting ($reason)")
        Thread({
            Thread.sleep(500)
            val url = resolveUrl()
            if (url == null) giveUp() else if (!stopped) connect(url)
        }, "gemini-reconnect").start()
    }

    /** No Gemini to talk to. On a phone call that means silence, so end the call instead. */
    private fun giveUp() {
        if (stopped || !onPhoneCall) return
        status("Gemini unavailable, ending the call")
        listener?.onHangupRequested()
    }

    fun stop() {
        stopped = true
        playQueue.clear()
        setupDone = false
        modelSpeaking = false
        recording = false
        main.removeCallbacksAndMessages(null)
        try { ws?.close(1000, "done") } catch (_: Exception) {}
        ws = null
        httpClient?.dispatcher?.executorService?.shutdown()
        httpClient = null
        try { aec?.release() } catch (_: Exception) {}
        try { ns?.release() } catch (_: Exception) {}
        aec = null; ns = null
        try { callAudioBridge?.stopCallAudio() } catch (_: Exception) {}
        try { recorder?.stop() } catch (_: Exception) {}
        recorder?.release(); recorder = null
        try { player?.stop() } catch (_: Exception) {}
        player?.release(); player = null
        status("Stopped")
    }

    // ---- Audio ----

    private fun startAudio() {
        if (callAudioBridge != null) {
            recording = true
            Thread({
                // Right after answering, the audio mode can lag the call state by a moment.
                var result = ""
                for (attempt in 0 until 12) {
                    if (stopped) return@Thread
                    result = try {
                        callAudioBridge.startCallAudio(callAudioCallback)
                    } catch (e: Exception) {
                        "Call audio bridge error: ${e.message}"
                    }
                    if (result.startsWith("CALL_BRIDGE_STARTED")) break
                    Thread.sleep(500)
                }
                status(result)
                if (result.startsWith("CALL_BRIDGE_STARTED")) {
                    bridgeReady = true
                    maybeKickoff()
                }
                if (!result.startsWith("CALL_BRIDGE_STARTED")) {
                    recording = false
                    listener?.onBridgeFailed(result)
                }
            }, "call-audio-start").start()
            return
        }
        val minIn = AudioRecord.getMinBufferSize(
            IN_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        recorder = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, IN_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minIn * 2, 3200)
            )
        } catch (e: Exception) {
            null
        }
        if (recorder?.state != AudioRecord.STATE_INITIALIZED) {
            // Usually a missing microphone permission. Without this check startRecording() throws.
            recorder?.release()
            recorder = null
            status("Microphone unavailable. Allow the microphone for Orvia Assistant.")
            return
        }
        val sessionId = recorder?.audioSessionId ?: AudioManager.ERROR
        if (sessionId != AudioManager.ERROR) {
            if (AcousticEchoCanceler.isAvailable()) {
                aec = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
            }
            if (NoiseSuppressor.isAvailable()) {
                ns = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
            }
        }
        val minOut = AudioTrack.getMinBufferSize(
            OUT_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        player = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(OUT_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minOut * 2, 4800))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()

        player?.play()
        recorder?.startRecording()
        recording = true

        Thread({
            val buf = ShortArray(640)
            val raw = ByteArray(1280)
            while (recording) {
                val n = recorder?.read(buf, 0, buf.size) ?: -1
                if (n <= 0) {
                    try { Thread.sleep(20) } catch (_: InterruptedException) { return@Thread }
                    continue
                }
                if (!setupDone || modelSpeaking) continue
                for (i in 0 until n) {
                    raw[i * 2] = (buf[i].toInt() and 0xFF).toByte()
                    raw[i * 2 + 1] = (buf[i].toInt() shr 8).toByte()
                }
                val b64 = Base64.encodeToString(raw, 0, n * 2, Base64.NO_WRAP)
                val msg = JSONObject().put("realtimeInput", JSONObject()
                    .put("audio", JSONObject()
                        .put("data", b64)
                        .put("mimeType", "audio/pcm;rate=$IN_RATE")))
                try { ws?.send(msg.toString()) } catch (_: Exception) {}
            }
        }, "mic-reader").start()
        status("Listening")
    }

    private fun playChunk(base64: String) {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        playQueue.offer(if (callAudioBridge == null) bytes else AudioMath.resample24kTo16k(bytes))
    }

    private fun playbackLoop() {
        while (!stopped) {
            val chunk = try { playQueue.poll(200, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) { return } ?: continue
            playing = true
            val bridge = callAudioBridge
            if (bridge == null) {
                player?.write(chunk, 0, chunk.size)
            } else {
                try { bridge.writeCallAudio(chunk) }
                catch (e: Exception) { status("Call uplink write failed: ${e.message}") }
            }
            playing = playQueue.isNotEmpty()
        }
    }

    private fun stopPlayback() {
        playQueue.clear()
        player?.flush()
        try { callAudioBridge?.flushCallAudio() } catch (_: Exception) {}
    }

    // ---- Gemini Live WebSocket ----

    private fun connect(url: String) {
        if (httpClient == null) httpClient = OkHttpClient.Builder().readTimeout(0, TimeUnit.SECONDS).build()
        ws = httpClient?.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    status("Connected")
                    sendSetup(webSocket)
                }
                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (webSocket !== ws) return
                    try { handleMessage(JSONObject(text)) }
                    catch (e: Exception) { status("Parse error: ${e.message}") }
                }
                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    if (webSocket !== ws) return
                    try { handleMessage(JSONObject(bytes.utf8())) }
                    catch (e: Exception) { status("Parse error: ${e.message}") }
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (!stopped && webSocket === ws) reconnect("error: ${t.message}")
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (!stopped && webSocket === ws) reconnect("closed $code $reason")
                }
            }
        )
    }

    private fun sendSetup(webSocket: WebSocket) {
        val setup = JSONObject().put("setup", JSONObject()
            .put("model", "models/$geminiModel")
            .put("generationConfig", JSONObject()
                .put("responseModalities", JSONArray().put("AUDIO"))
                .put("speechConfig", JSONObject()
                    .put("voiceConfig", JSONObject()
                        .put("prebuiltVoiceConfig", JSONObject()
                            .put("voiceName", geminiVoice)))))
            .put("systemInstruction", JSONObject()
                .put("parts", JSONArray().put(JSONObject().put("text", systemPrompt()))))
            .put("tools", JSONArray().put(JSONObject()
                .put("functionDeclarations", toolDeclarations())))
            .put("inputAudioTranscription", JSONObject())
            .put("outputAudioTranscription", JSONObject()))
        webSocket.send(setup.toString())
    }

    private fun systemPrompt(): String {
        if (mode == Mode.OUTBOUND) return outboundPrompt(brief ?: OutboundBrief("Orvia", "", "", "", ""))
        val who = ownerName.ifBlank { "the owner" }
        val name = ownerName.trim().ifBlank { null }
        val assistantOf = if (name != null) "$name's assistant" else "the phone owner's assistant"
        if (mode == Mode.AGENT) return """
You are answering a phone call for ${name ?: "the person who owns this phone"}, who cannot pick up right now. You are $assistantOf.
Open with one short greeting: say you are $assistantOf, that ${name ?: "they"} can't take the call right now, and ask how you can help.
Speak the caller's language and mirror how they talk, including Hindi, Urdu, Dakhni, Telugu or English, and mixes of them.
Find out who is calling, what it is about, and whether it is urgent. Offer to pass on a message.
Whenever you learn something $who should know (the caller's name, why they called, a message, a good time to call back), call save_note with it. Do not say you are saving anything.
If the caller asks to speak with ${name ?: "the owner"} directly, or it sounds urgent, call ask_owner with a short reason. Tell the caller you will check if ${name ?: "they"} can come to the phone, and then wait quietly for the answer. When you get it, follow it exactly.
Never make promises or commitments for $who, and never share $who's personal details, location or schedule.
Keep every reply short, like a real phone conversation.
When the caller is finished, say a brief goodbye and then call end_call.
""".trimIndent()
        return """
You are $who's personal voice assistant. You speak with them directly, hands-free.
Keep replies short and conversational, like a real spoken conversation.
You may be speaking with a caller over the owner's phone. Address them directly.
Help with questions, quick reasoning, and reminders. When they ask you to remember
or note something, call save_note. Before a note, say a brief "Got it." Greet very
briefly when the conversation starts, then let them lead.
""".trimIndent()
    }

    private fun outboundPrompt(b: OutboundBrief): String {
        val company = b.company.ifBlank { "Orvia" }
        val them = listOf(b.contactName, b.contactBusiness).filter { it.isNotBlank() }.joinToString(" at ")
        return """
You are an AI assistant making a sales call on behalf of $company. ${if (them.isNotEmpty()) "You are calling $them." else ""}
In your first sentence, say plainly that you are an AI assistant calling for $company, then ask if they have a minute. If they say no or that it is a bad time, offer to call back later, ask when, and call set_outcome with call_back.
What you are offering:
${b.pitch.ifBlank { "Ask what they need and offer a short follow-up meeting." }}
Your goal is to book a short meeting (about 15 minutes). ${if (b.availability.isNotBlank()) "You can offer times within: ${b.availability}." else ""}
When they agree on a time, confirm it back to them, ask for their name and the best email or number, then call book_meeting.
Listen more than you talk. Ask one question at a time. Answer honestly; never invent prices, features or results that are not in the offer above, and say you will have someone follow up if you do not know.
If they are not interested, thank them and stop pitching; call set_outcome with not_interested. If they ask not to be called again, apologise, confirm they will not be called again, and call set_outcome with do_not_call. If it is the wrong number, call set_outcome with wrong_number.
If you reach voicemail or an automated system, say one short sentence about who you are and why you called, then call set_outcome with voicemail and end_call.
Speak the other person's language and mirror how they talk. Keep every reply short, like a real phone conversation.
Use save_note for anything useful you learn (their current setup, pain points, objections). Do not say you are saving anything.
When the conversation is done, say a brief goodbye and then call end_call.
""".trimIndent()
    }

    private fun toolDeclarations(): JSONArray {
        val tools = JSONArray().put(JSONObject()
            .put("name", "save_note")
            .put("description", "Save something the owner should know about this conversation.")
            .put("parametersJsonSchema", JSONObject()
                .put("type", "object")
                .put("properties", JSONObject()
                    .put("note", JSONObject()
                        .put("type", "string")
                        .put("description", "The note, in English")))
                .put("required", JSONArray().put("note"))))
        if (mode == Mode.OUTBOUND) {
            tools.put(JSONObject()
                .put("name", "book_meeting")
                .put("description", "Record a meeting the person agreed to. Call after confirming the time back to them.")
                .put("parametersJsonSchema", JSONObject()
                    .put("type", "object")
                    .put("properties", JSONObject()
                        .put("when", JSONObject().put("type", "string").put("description", "Agreed day and time, with timezone if said"))
                        .put("name", JSONObject().put("type", "string").put("description", "Their name"))
                        .put("contact", JSONObject().put("type", "string").put("description", "Email or phone to send the invite to"))
                        .put("notes", JSONObject().put("type", "string").put("description", "Anything to know before the meeting")))
                    .put("required", JSONArray().put("when"))))
            tools.put(JSONObject()
                .put("name", "set_outcome")
                .put("description", "Record how the call went.")
                .put("parametersJsonSchema", JSONObject()
                    .put("type", "object")
                    .put("properties", JSONObject()
                        .put("outcome", JSONObject()
                            .put("type", "string")
                            .put("enum", JSONArray(OUTCOMES))
                            .put("description", "How the call ended up"))
                        .put("reason", JSONObject().put("type", "string").put("description", "Short reason, in English")))
                    .put("required", JSONArray().put("outcome"))))
        }
        if (mode == Mode.AGENT) {
            tools.put(JSONObject()
                .put("name", "ask_owner")
                .put("description", "Ask the owner whether they can join this call now. Use when the caller wants them in person or it is urgent.")
                .put("parametersJsonSchema", JSONObject()
                    .put("type", "object")
                    .put("properties", JSONObject()
                        .put("reason", JSONObject().put("type", "string").put("description", "Who is calling and why, in a few English words")))
                    .put("required", JSONArray().put("reason"))))
        }
        if (onPhoneCall) {
            tools.put(JSONObject()
                .put("name", "end_call")
                .put("description", "Hang up. Use only after saying goodbye, when the caller is done.")
                .put("parametersJsonSchema", JSONObject().put("type", "object").put("properties", JSONObject())))
        }
        return tools
    }

    private fun handleMessage(msg: JSONObject) {
        if (msg.has("setupComplete")) {
            setupDone = true
            status("Ready")
            maybeKickoff()
            return
        }
        handleContent(msg)
    }

    /** Sends the opening prompt once per connection, when Gemini and (on a call) the audio are both ready. */
    @Synchronized
    private fun maybeKickoff() {
        if (!setupDone || stopped || kickoffSentFor == reconnects) return
        if (callAudioBridge != null && !bridgeReady) return
        kickoffSentFor = reconnects
        val kickoff = when {
            !onPhoneCall -> "The user just opened the assistant. Greet them in one short sentence."
            reconnects > 0 -> "The line dropped for a moment and you are back on the same call. " +
                "Say sorry for the pause in a few words and carry on. The conversation so far:\n" +
                transcript().takeLast(12).joinToString("\n") { (role, text) ->
                    "${if (role == "user") "Caller" else "You"}: $text"
                }
            mode == Mode.OUTBOUND -> "The person you called just picked up. Introduce yourself now."
            else -> "The call has just connected. Greet the caller now."
        }
        ws?.send(JSONObject().put("realtimeInput", JSONObject().put("text", kickoff)).toString())
        if (onPhoneCall && !timersArmed) {
            timersArmed = true
            // Keep calls bounded: a nudge to wrap up, then a hard stop.
            main.postDelayed({
                ws?.send(JSONObject().put("realtimeInput", JSONObject().put("text",
                    "About one minute is left on this call. Wrap up politely, say goodbye, then call end_call.")).toString())
            }, MAX_CALL_MS - 60_000)
            main.postDelayed({ requestHangup() }, MAX_CALL_MS)
        }
    }

    private fun handleContent(msg: JSONObject) {
        val sc = msg.optJSONObject("serverContent")
        if (sc != null) {
            if (sc.optBoolean("interrupted")) {
                modelSpeaking = false
                stopPlayback()
            }
            val parts = sc.optJSONObject("modelTurn")?.optJSONArray("parts")
            if (parts != null) {
                for (i in 0 until parts.length()) {
                    val d = parts.getJSONObject(i).optJSONObject("inlineData")
                    if (d != null) {
                        modelSpeaking = true
                        playChunk(d.getString("data"))
                    }
                }
            }
            sc.optJSONObject("outputTranscription")?.optString("text")?.let {
                if (it.isNotBlank()) {
                    transcriptBuilder.append("assistant", it)
                    status("Assistant: $it")
                }
            }
            sc.optJSONObject("inputTranscription")?.optString("text")?.let {
                if (it.isNotBlank()) {
                    transcriptBuilder.append("user", it)
                    status("Caller: $it")
                }
            }
            if (sc.optBoolean("turnComplete")) {
                modelSpeaking = false
                if (hangupRequested) requestHangup()
            }
        }
        val tc = msg.optJSONObject("toolCall")
        if (tc != null) {
            val fcs = tc.optJSONArray("functionCalls") ?: return
            val responses = JSONArray()
            for (i in 0 until fcs.length()) {
                val fc = fcs.getJSONObject(i)
                val name = fc.getString("name")
                val args = fc.optJSONObject("args") ?: JSONObject()
                val id = fc.optString("id")
                when (name) {
                    "save_note" -> {
                        val note = args.optString("note", "").trim()
                        if (note.isNotEmpty()) synchronized(notes) { notes.add(note) }
                        status("Note: $note")
                        responses.put(toolResult(id, name, JSONObject().put("status", "saved")))
                    }
                    "book_meeting" -> {
                        val m = JSONObject()
                            .put("when", args.optString("when").trim())
                            .put("name", args.optString("name").trim())
                            .put("contact", args.optString("contact").trim())
                            .put("notes", args.optString("notes").trim())
                        meeting = m
                        outcome = "meeting_booked"
                        status("Meeting booked: ${m.optString("when")}")
                        responses.put(toolResult(id, name, JSONObject().put("status", "booked")))
                    }
                    "set_outcome" -> {
                        val o = args.optString("outcome").trim()
                        // A booked meeting is the best result; a later outcome does not undo it.
                        if (o in OUTCOMES && outcome != "meeting_booked") outcome = o
                        args.optString("reason").trim().takeIf { it.isNotEmpty() }?.let { r ->
                            synchronized(notes) { notes.add("Outcome: $o. $r") }
                        }
                        status("Outcome: $o")
                        responses.put(toolResult(id, name, JSONObject().put("status", "recorded")))
                    }
                    "end_call" -> {
                        hangupRequested = true
                        status("Assistant is ending the call")
                        responses.put(toolResult(id, name, JSONObject().put("status", "ending")))
                        // Normally the goodbye's turnComplete triggers the hangup; this is the fallback.
                        main.postDelayed({ requestHangup() }, 6000)
                    }
                    "ask_owner" -> {
                        val reason = args.optString("reason").trim().ifEmpty { "The caller wants to talk to you" }
                        status("Asking the owner: $reason")
                        responses.put(toolResult(id, name, JSONObject().put("status", "asking the owner, wait for their answer")))
                        listener?.onOwnerRequested(reason)
                    }
                    // Without a response the model waits forever and the call goes silent.
                    else -> responses.put(toolResult(id, name, JSONObject().put("error", "Unknown tool $name")))
                }
            }
            if (responses.length() > 0) {
                ws?.send(JSONObject().put("toolResponse", JSONObject()
                    .put("functionResponses", responses)).toString())
            }
        }
    }

    @Volatile private var hangupSent = false

    /** Hangs up once the goodbye has finished playing (at most ~8 s of waiting). */
    private fun requestHangup() {
        if (hangupSent || stopped) return
        hangupSent = true
        Thread({
            val until = System.currentTimeMillis() + 8_000
            while ((playing || playQueue.isNotEmpty()) && System.currentTimeMillis() < until) Thread.sleep(100)
            Thread.sleep(700)
            if (!stopped) listener?.onHangupRequested()
        }, "gemini-hangup").start()
    }

    private fun toolResult(id: String, name: String, result: JSONObject) = JSONObject()
        .put("id", id).put("name", name)
        .put("response", JSONObject().put("result", result))
}
