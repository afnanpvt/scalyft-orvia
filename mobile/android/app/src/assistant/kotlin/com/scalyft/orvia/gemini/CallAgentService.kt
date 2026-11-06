package com.scalyft.orvia.gemini

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.TelephonyManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * The owner's always-on call agent. While on, it watches the phone through the
 * Shizuku shell service; when a call rings for longer than the owner's answer
 * delay it picks up, lets Gemini handle the caller, then saves the conversation
 * and sends it to the Orvia dashboard. Calls the owner answers stay theirs.
 */
class CallAgentService : Service(), GeminiLiveSession.Listener {

    companion object {
        private const val TAG = "GeminiPhone"
        const val ACTION_START = "com.scalyft.orvia.gemini.AGENT_START"
        const val ACTION_STOP = "com.scalyft.orvia.gemini.AGENT_STOP"
        const val ACTION_SYNC = "com.scalyft.orvia.gemini.AGENT_SYNC"
        const val ACTION_TAKE_OVER = "com.scalyft.orvia.gemini.AGENT_TAKE_OVER"
        const val ACTION_HANGUP = "com.scalyft.orvia.gemini.AGENT_HANGUP"

        /** True while the agent is on a live call, so the app can show a take-over banner. */
        @Volatile var onCall = false
            private set

        // The caller asked for the owner (ask_owner tool); answered from the alert or the app.
        const val ACTION_OWNER_JOIN = "com.scalyft.orvia.gemini.AGENT_OWNER_JOIN"
        const val ACTION_OWNER_BUSY = "com.scalyft.orvia.gemini.AGENT_OWNER_BUSY"
        const val ACTION_OWNER_REPLY = "com.scalyft.orvia.gemini.AGENT_OWNER_REPLY"
        const val EXTRA_REPLY = "reply"
        private const val OWNER_CHANNEL_ID = "call_agent_owner"
        private const val OWNER_NOTIF_ID = 2004
        private const val OWNER_ANSWER_TIMEOUT_MS = 30_000L

        /** Why the caller wants the owner, while the agent is waiting for an answer. */
        @Volatile var ownerRequest: String? = null
            private set

        @Volatile private var instance: CallAgentService? = null

        /** The last few lines of the live conversation, for the app's live view. */
        fun liveTurns(): List<Pair<String, String>> =
            instance?.session?.transcript()?.takeLast(6).orEmpty()

        /** Numbers the agent never answers; they ring for the owner as usual. */
        fun skipNumbers(context: Context): List<String> = try {
            val raw = JSONArray(prefs(context).getString("skipNumbers", "[]"))
            (0 until raw.length()).map { raw.optString(it) }.filter { it.isNotBlank() }
        } catch (_: Exception) {
            emptyList()
        }

        fun setSkipNumbers(context: Context, numbers: List<String>) {
            prefs(context).edit().putString("skipNumbers", JSONArray(numbers.map { it.trim() }.filter { it.isNotEmpty() }).toString()).apply()
        }
        private const val CHANNEL_ID = "call_agent"
        private const val CALLS_CHANNEL_ID = "call_agent_calls"
        private const val NOTIF_ID = 2002
        const val DEFAULT_ANSWER_DELAY_SECS = 5
        private const val SYNC_RETRY_MS = 15 * 60 * 1000L

        @Volatile var running = false
            private set
        /** Short human status for the app: what the agent is doing right now. */
        @Volatile var state = "Off"
            private set

        fun isEnabled(context: Context) = prefs(context).getBoolean("agentEnabled", false)

        fun answerDelaySecs(context: Context) =
            prefs(context).getInt("answerDelaySecs", DEFAULT_ANSWER_DELAY_SECS)

        fun setEnabled(context: Context, enabled: Boolean) {
            prefs(context).edit().putBoolean("agentEnabled", enabled).apply()
            val intent = Intent(context, CallAgentService::class.java)
            if (enabled) {
                intent.action = ACTION_START
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
            } else {
                context.stopService(intent)
            }
        }

        fun requestSync(context: Context) {
            Thread({ uploadPending(context.applicationContext) }, "agent-sync").start()
        }

        private fun prefs(context: Context) =
            context.getSharedPreferences(GeminiLiveSession.PREFS, Context.MODE_PRIVATE)

        @Synchronized
        private fun uploadPending(context: Context): Int {
            val store = AgentCallStore(context)
            val client = DeviceAgentClient(context)
            // Signed out, calls are meant to stay on the phone; they go up once it is linked.
            if (!client.linked) return 0
            var sent = 0
            for (call in store.pending()) {
                val error = client.saveCall(call)
                store.markUploaded(call.getString("id"), error == null, error)
                if (error == null) sent++ else Log.w(TAG, "Agent call ${call.optString("id")} not sent: $error")
            }
            return sent
        }
    }

    @Volatile private var loop: Thread? = null
    @Volatile private var session: GeminiLiveSession? = null
    private var wakeLock: PowerManager.WakeLock? = null

    // Per-call state, touched only by the loop thread.
    private var previousState = TelephonyManager.CALL_STATE_IDLE
    private var ringStartedAt = 0L
    private var answeredAt = 0L
    private var answerAttempts = 0
    private var agentAnswered = false
    @Volatile private var handedOver = false
    private var callerNumber = ""
    private var lastSyncAt = System.currentTimeMillis()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs(this).edit().putBoolean("agentEnabled", false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        // These arrive while the service is already running (notification buttons, app).
        // Only act while the agent is on a call: a stale notification button must never
        // hang up, or meddle with, a call the owner is having themselves.
        if (intent?.action == ACTION_OWNER_JOIN || intent?.action == ACTION_OWNER_BUSY || intent?.action == ACTION_OWNER_REPLY) {
            val typed = android.app.RemoteInput.getResultsFromIntent(intent)?.getCharSequence(EXTRA_REPLY)?.toString()
                ?: intent.getStringExtra(EXTRA_REPLY)
            if (session != null) answerOwnerRequest(intent.action!!, typed?.trim().orEmpty())
            if (loop == null) stopSelf()
            return if (loop == null) START_NOT_STICKY else START_STICKY
        }
        if (intent?.action == ACTION_TAKE_OVER || intent?.action == ACTION_HANGUP) {
            if (session != null) {
                if (intent.action == ACTION_TAKE_OVER) Thread({ takeOver() }, "agent-take-over").start()
                else onHangupRequested()
            }
            if (loop == null) stopSelf()
            return if (loop == null) START_NOT_STICKY else START_STICKY
        }
        if (!isEnabled(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, statusNotification("Starting"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIF_ID, statusNotification("Starting"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Call agent could not start in the foreground", e)
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        if (loop == null) {
            loop = Thread({ runLoop() }, "call-agent").apply { isDaemon = true; start() }
        }
        requestSync(this)
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        clearOwnerRequest()
        running = false
        state = "Off"
        loop?.interrupt()
        loop = null
        // Saving reads the call log over binder; keep it off the main thread.
        Thread({ endSession(save = true) }, "agent-stop").start()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ---- Loop ----

    private fun runLoop() {
        var lastShown = ""
        while (!Thread.currentThread().isInterrupted) {
            try {
                val bridge = ShizukuBridge.await(this, 5_000)
                if (bridge == null) {
                    setState(when (ShizukuBridge.status()) {
                        ShizukuBridge.Status.OFFLINE -> "Waiting for Shizuku to start"
                        ShizukuBridge.Status.NO_PERMISSION -> "Shizuku access not granted"
                        ShizukuBridge.Status.READY -> "Connecting to Shizuku"
                    })
                    Thread.sleep(5_000)
                    continue
                }
                val callState = bridge.callState()
                onCallState(bridge, callState)
                previousState = callState
                val idleText = if (hasGeminiAccess()) "On · answers after ${answerDelaySecs(this)} sec"
                    else "On, but needs a Gemini key or sign in"
                if (callState == TelephonyManager.CALL_STATE_IDLE && session == null) {
                    setState(idleText)
                    // Calls that failed to upload (no signal, server down) are retried while idle.
                    val now = System.currentTimeMillis()
                    if (now - lastSyncAt > SYNC_RETRY_MS) {
                        lastSyncAt = now
                        requestSync(this)
                    }
                }
                if (state != lastShown) {
                    lastShown = state
                    updateNotification(state)
                }
                Thread.sleep(if (callState == TelephonyManager.CALL_STATE_IDLE) 500 else 300)
            } catch (_: InterruptedException) {
                return
            } catch (e: Exception) {
                Log.w(TAG, "Call agent loop error", e)
                try { Thread.sleep(2_000) } catch (_: InterruptedException) { return }
            }
        }
    }

    private fun onCallState(bridge: IVoiceCallProbe, callState: Int) {
        val now = System.currentTimeMillis()
        when (callState) {
            TelephonyManager.CALL_STATE_RINGING -> {
                if (previousState != TelephonyManager.CALL_STATE_RINGING) {
                    ringStartedAt = now
                    answerAttempts = 0
                    agentAnswered = false
                    handedOver = false
                    callerNumber = try { bridge.currentCallNumber() } catch (_: Exception) { "" }
                    Log.i(TAG, "Agent: incoming call ${callerNumber.ifEmpty { "(number hidden)" }}")
                }
                if (previousState == TelephonyManager.CALL_STATE_OFFHOOK) return // call waiting: leave it
                if (callerNumber.isNotEmpty() && skipNumbers(this).any { CallParsing.sameNumber(it, callerNumber) }) {
                    setState("Ringing for you · on your never-answer list")
                    return
                }
                // Never pick up a call nobody can talk on.
                if (!hasGeminiAccess()) {
                    setState("Not answering: add a Gemini key or sign in")
                    return
                }
                // "Talk now" already owns the call audio; two sessions would fight over it.
                if (GeminiAssistantService.running) {
                    setState("Not answering: Talk now is on")
                    return
                }
                val delayMs = answerDelaySecs(this) * 1000L
                val due = now - ringStartedAt >= delayMs + answerAttempts * 3_000L
                if (due && answerAttempts < 3) {
                    answerAttempts++
                    setState("Answering")
                    Log.i(TAG, "Agent: answering (attempt $answerAttempts)")
                    if (bridge.answerRingingCall()) {
                        agentAnswered = true
                        answeredAt = now
                    }
                } else if (answerAttempts == 0) {
                    setState("Incoming call · answering in ${((delayMs - (now - ringStartedAt)) / 1000) + 1} sec")
                }
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (agentAnswered && !handedOver && session == null && previousState == TelephonyManager.CALL_STATE_RINGING) {
                    startSession(bridge)
                } else if (previousState == TelephonyManager.CALL_STATE_RINGING && !agentAnswered) {
                    setState("You answered · agent stays out")
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (session != null) {
                    Log.i(TAG, "Agent: call ended")
                    endSession(save = true)
                }
                agentAnswered = false
            }
        }
    }

    private fun hasGeminiAccess(): Boolean =
        !(prefs(this).getString("apiKey", "") ?: "").isEmpty() || DeviceAgentClient(this).linked

    // ---- Session ----

    private fun startSession(bridge: IVoiceCallProbe) {
        if (answeredAt == 0L) answeredAt = System.currentTimeMillis()
        onCall = true
        setState("On a call")
        acquireWakeLock()
        updateNotification(state)
        session = GeminiLiveSession(this, bridge, GeminiLiveSession.Mode.AGENT, this).also { it.start() }
    }

    /**
     * The owner joins the call themselves. Stops the agent and gives the mic back (via
     * stopCallAudio), but keeps the call connected, so the owner just talks. What the agent
     * gathered so far is still saved.
     */
    private fun takeOver() {
        if (session == null) return
        handedOver = true
        Log.i(TAG, "Agent: owner took over the call")
        endSession(save = true)
        setState("You took over")
        updateNotification(state)
    }

    // Called from the loop thread when the call ends and from onDestroy; only one may save.
    @Synchronized
    private fun endSession(save: Boolean) {
        val s = session ?: return
        session = null
        onCall = false
        clearOwnerRequest()
        s.stop()
        releaseWakeLock()
        if (!save) return
        val endedAt = System.currentTimeMillis()
        val turns = s.transcript()
        val notes = s.notes()
        // The call log is authoritative; the number read while ringing is the fallback.
        val logged = try { ShizukuBridge.service?.callLogNumberSince(ringStartedAt - 5_000) } catch (_: Exception) { null }
        if (!logged.isNullOrEmpty()) callerNumber = logged
        val call = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("started_at", answeredAt.takeIf { it > 0 } ?: ringStartedAt)
            .put("ended_at", endedAt)
            .put("caller_number", callerNumber)
            .put("turns", AgentCallStore.turnsToJson(turns))
            .put("notes", JSONArray(notes))
            .put("uploaded", false)
        AgentCallStore(this).save(call)
        postCallNotification(callerNumber, notes, turns.size)
        answeredAt = 0L
        callerNumber = ""
        requestSync(this)
    }

    override fun onHangupRequested() {
        Log.i(TAG, "Agent: assistant ended the call")
        Thread({
            try { ShizukuBridge.service?.endCall() } catch (e: Exception) { Log.w(TAG, "endCall failed", e) }
        }, "agent-hangup").start()
    }

    override fun onOwnerRequested(reason: String) {
        ownerRequest = reason
        Log.i(TAG, "Agent: caller asked for the owner")
        postOwnerAlert(reason)
        // No answer in time: the agent tells the caller the owner is not available.
        mainHandler.postDelayed(ownerTimeout, OWNER_ANSWER_TIMEOUT_MS)
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private val ownerTimeout = Runnable {
        if (ownerRequest == null) return@Runnable
        clearOwnerRequest()
        session?.ownerReply("${ownerLabel()} did not answer. Tell the caller they cannot come to the phone right now, " +
            "and offer to take a message or arrange a call back.")
    }

    private fun ownerLabel() = (prefs(this).getString("ownerName", "") ?: "").trim().ifEmpty { "The owner" }

    /** Join, busy, or a typed message for the caller. */
    private fun answerOwnerRequest(action: String, typed: String) {
        val s = session ?: return
        clearOwnerRequest()
        val who = ownerLabel()
        when {
            action == ACTION_OWNER_JOIN -> {
                s.ownerReply("$who is joining the call now. Tell the caller in one short sentence that you are " +
                    "connecting them, then say nothing more.")
                // Let that sentence play out, then hand the call over.
                Thread({
                    Thread.sleep(1_500)
                    val until = System.currentTimeMillis() + 8_000
                    while (s.speaking && System.currentTimeMillis() < until) Thread.sleep(100)
                    Thread.sleep(400)
                    takeOver()
                }, "agent-owner-join").start()
            }
            action == ACTION_OWNER_REPLY && typed.isNotEmpty() ->
                s.ownerReply("$who says: \"$typed\". Pass this on to the caller in your own words, in their " +
                    "language, then carry on helping them.")
            else ->
                s.ownerReply("$who is busy and cannot come to the phone right now. Tell the caller, then offer " +
                    "to take a message or arrange a call back.")
        }
    }

    private fun clearOwnerRequest() {
        ownerRequest = null
        mainHandler.removeCallbacks(ownerTimeout)
        try { getSystemService(NotificationManager::class.java).cancel(OWNER_NOTIF_ID) } catch (_: Exception) {}
    }

    private fun postOwnerAlert(reason: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(OWNER_CHANNEL_ID, "Caller wants you", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
            }
        )
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 20, it, PendingIntent.FLAG_IMMUTABLE)
        }
        // A typed reply needs a mutable intent so the system can attach the text.
        val replyIntent = PendingIntent.getService(
            this, 23, Intent(this, CallAgentService::class.java).setAction(ACTION_OWNER_REPLY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        val reply = Notification.Action.Builder(null, "Reply", replyIntent)
            .addRemoteInput(android.app.RemoteInput.Builder(EXTRA_REPLY).setLabel("Message for the caller").build())
            .build()
        val n = Notification.Builder(this, OWNER_CHANNEL_ID)
            .setContentTitle("Caller wants to talk to you")
            .setContentText(reason)
            .setStyle(Notification.BigTextStyle().bigText(reason))
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setCategory(Notification.CATEGORY_CALL)
            .setContentIntent(open)
            .setAutoCancel(true)
            .addAction(serviceAction("Join", ACTION_OWNER_JOIN, 21))
            .addAction(serviceAction("Busy", ACTION_OWNER_BUSY, 22))
            .addAction(reply)
            .build()
        try { nm.notify(OWNER_NOTIF_ID, n) } catch (_: Exception) {}
    }

    override fun onBridgeFailed(reason: String) {
        Log.w(TAG, "Agent: call audio unavailable, hanging up: $reason")
        setState("Call audio unavailable")
        // A caller left in silence is worse than a dropped call they can retry.
        onHangupRequested()
    }

    // ---- Notifications and power ----

    private fun setState(text: String) {
        state = text
    }

    private fun channels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Call agent status", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(CALLS_CHANNEL_ID, "Calls the agent took", NotificationManager.IMPORTANCE_DEFAULT))
    }

    private fun statusNotification(text: String): Notification {
        channels()
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(if (onCall) "On a call" else "Call agent")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setContentIntent(open)
        if (onCall) {
            // Mid-call: the owner can join (take over) or hang up from here.
            builder.addAction(serviceAction("Take over", ACTION_TAKE_OVER, 3))
            builder.addAction(serviceAction("Hang up", ACTION_HANGUP, 4))
        } else {
            builder.addAction(serviceAction("Turn off", ACTION_STOP, 1))
        }
        return builder.build()
    }

    private fun serviceAction(label: String, action: String, code: Int): Notification.Action {
        val pi = PendingIntent.getService(
            this, code, Intent(this, CallAgentService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Action.Builder(null, label, pi).build()
    }

    private fun updateNotification(text: String) {
        try {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, statusNotification(text))
        } catch (_: Exception) {}
    }

    private fun postCallNotification(number: String, notes: List<String>, turnCount: Int) {
        channels()
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val body = notes.joinToString(" · ").ifEmpty {
            if (turnCount == 0) "The caller hung up before saying anything." else "No message left."
        }
        val n = Notification.Builder(this, CALLS_CHANNEL_ID)
            .setContentTitle("Agent took a call from ${number.ifEmpty { "a hidden number" }}")
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            getSystemService(NotificationManager::class.java).notify((System.currentTimeMillis() % 100000).toInt() + 3000, n)
        } catch (_: Exception) {}
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "orvia:call-agent")
            .apply { acquire(60 * 60 * 1000L) }
    }

    private fun releaseWakeLock() {
        try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
        wakeLock = null
    }
}
