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
 * Outreach test calls: dials one number the owner picked, waits until the other side
 * actually picks up (precise call state ACTIVE, not just off-hook), then lets Gemini
 * pitch and try to book a meeting. One call at a time, started by a tap; never a
 * dialing loop. Results stay on the phone (outreach_calls), not on the dashboard.
 */
class OutboundCallService : Service(), GeminiLiveSession.Listener {

    companion object {
        private const val TAG = "GeminiPhone"
        const val ACTION_CALL = "com.scalyft.orvia.gemini.OUTREACH_CALL"
        const val ACTION_TAKE_OVER = "com.scalyft.orvia.gemini.OUTREACH_TAKE_OVER"
        const val ACTION_HANGUP = "com.scalyft.orvia.gemini.OUTREACH_HANGUP"
        private const val CHANNEL_ID = "outreach"
        private const val NOTIF_ID = 2003
        /** Give up if nobody picks up within this long. */
        private const val ANSWER_TIMEOUT_MS = 45_000L

        /** "idle", "dialing", "talking", "taken_over" or "ended". Read by the app. */
        @Volatile var phase = "idle"
            private set
        @Volatile var contactId: String? = null
            private set
        @Volatile var lastError: String? = null
            private set

        val busy get() = phase == "dialing" || phase == "talking" || phase == "taken_over"

        fun start(context: Context, call: OutreachCall) {
            val intent = Intent(context, OutboundCallService::class.java).setAction(ACTION_CALL).putExtras(call.bundle)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun send(context: Context, action: String) {
            if (!busy) return
            context.startService(Intent(context, OutboundCallService::class.java).setAction(action))
        }
    }

    /** What the app passes in for one call. */
    class OutreachCall(
        val contactId: String,
        val number: String,
        val name: String,
        val business: String,
        val company: String,
        val pitch: String,
        val availability: String,
    ) {
        val bundle get() = android.os.Bundle().apply {
            putString("contactId", contactId); putString("number", number); putString("name", name)
            putString("business", business); putString("company", company); putString("pitch", pitch)
            putString("availability", availability)
        }
    }

    @Volatile private var worker: Thread? = null
    @Volatile private var session: GeminiLiveSession? = null
    @Volatile private var handedOver = false
    @Volatile private var ownerHungUp = false

    private fun stopIfIdle() {
        if (worker == null) stopSelf()
    }
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            // Only during an outreach call: a stale button must never end a personal call.
            ACTION_TAKE_OVER -> { if (phase == "talking") takeOver(); stopIfIdle(); return START_NOT_STICKY }
            ACTION_HANGUP -> {
                if (busy) {
                    ownerHungUp = true
                    onHangupRequested()
                }
                stopIfIdle()
                return START_NOT_STICKY
            }
            ACTION_CALL -> {}
            else -> { stopSelf(); return START_NOT_STICKY }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, notification("Dialing"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIF_ID, notification("Dialing"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Outreach could not start in the foreground", e)
            stopSelf()
            return START_NOT_STICKY
        }
        if (worker != null) return START_NOT_STICKY // one call at a time
        val extras = intent.extras ?: return START_NOT_STICKY
        val call = OutreachCall(
            contactId = extras.getString("contactId").orEmpty(),
            number = extras.getString("number").orEmpty(),
            name = extras.getString("name").orEmpty(),
            business = extras.getString("business").orEmpty(),
            company = extras.getString("company").orEmpty(),
            pitch = extras.getString("pitch").orEmpty(),
            availability = extras.getString("availability").orEmpty(),
        )
        worker = Thread({ runCall(call) }, "outreach-call").apply { isDaemon = true; start() }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        worker?.interrupt()
        worker = null
        session?.stop()
        session = null
        releaseWakeLock()
        if (busy) phase = "ended"
        super.onDestroy()
    }

    private fun runCall(call: OutreachCall) {
        contactId = call.contactId
        lastError = null
        handedOver = false
        ownerHungUp = false
        pendingTranscript = null
        phase = "dialing"
        val bridge = ShizukuBridge.await(this, 10_000)
        if (bridge == null) return finish(call, null, 0L, "Shizuku is not running or not allowed")
        if (bridge.callState() != TelephonyManager.CALL_STATE_IDLE) return finish(call, null, 0L, "The phone is already on a call")
        val dialedAt = System.currentTimeMillis()
        if (!bridge.placeCall(call.number)) return finish(call, null, 0L, "Could not dial that number")
        acquireWakeLock()

        var sawOffHook = false
        var answeredAt = 0L
        var outcomeOverride: String? = null
        try {
            while (!Thread.currentThread().isInterrupted) {
                val state = bridge.callState()
                if (state != TelephonyManager.CALL_STATE_IDLE) sawOffHook = true
                if (sawOffHook && state == TelephonyManager.CALL_STATE_IDLE) break // call ended
                if (!sawOffHook && System.currentTimeMillis() - dialedAt > 15_000) {
                    // Typically a dual-SIM phone with no default calling SIM: Android shows a
                    // "which SIM?" prompt and the call never starts.
                    return finish(call, null, 0L,
                        "The call did not start. If your phone asked which SIM to use, set a default SIM for calls and try again.")
                }
                if (answeredAt == 0L && sawOffHook) {
                    if (bridge.foregroundCallState() == CallParsing.CALL_ACTIVE) {
                        answeredAt = System.currentTimeMillis()
                        if (!handedOver) startSession(bridge, call)
                    } else if (System.currentTimeMillis() - dialedAt > ANSWER_TIMEOUT_MS) {
                        Log.i(TAG, "Outreach: no answer from ${CallParsing.mask(call.number)}")
                        outcomeOverride = "no_answer"
                        bridge.endCall()
                    }
                }
                updateNotification()
                Thread.sleep(300)
            }
        } catch (_: InterruptedException) {
        } catch (e: Exception) {
            Log.w(TAG, "Outreach call loop error", e)
        }
        finish(call, outcomeOverride, answeredAt, null)
    }

    private fun startSession(bridge: IVoiceCallProbe, call: OutreachCall) {
        phase = "talking"
        val brief = GeminiLiveSession.OutboundBrief(call.company, call.pitch, call.availability, call.name, call.business)
        session = GeminiLiveSession(this, bridge, GeminiLiveSession.Mode.OUTBOUND, this, brief).also { it.start() }
        updateNotification()
    }

    @Synchronized
    private fun finish(call: OutreachCall, outcomeOverride: String?, answeredAt: Long, error: String?) {
        val s = session ?: pendingTranscript
        session = null
        pendingTranscript = null
        s?.stop()
        releaseWakeLock()
        lastError = error
        if (error != null) Log.w(TAG, "Outreach: $error")
        val record = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("contact_id", call.contactId)
            .put("caller_number", call.number)
            .put("started_at", if (answeredAt > 0) answeredAt else System.currentTimeMillis())
            .put("ended_at", System.currentTimeMillis())
            .put("turns", AgentCallStore.turnsToJson(s?.transcript().orEmpty()))
            .put("notes", JSONArray(s?.notes().orEmpty()))
            .put("outcome", error?.let { "failed" } ?: s?.outcome ?: outcomeOverride
                ?: if (handedOver) "taken_over" else if (ownerHungUp) "owner_hung_up" else if (answeredAt == 0L) "no_answer" else "ended")
            .put("uploaded", true) // never synced; marked so the store does not treat it as pending
        s?.meeting?.let { record.put("meeting", it) }
        error?.let { record.put("error", it) }
        AgentCallStore(this, AgentCallStore.OUTBOUND).save(record)
        phase = "ended"
        worker = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** The owner joins: the agent leaves, the mic comes back, the call stays up. */
    private fun takeOver() {
        handedOver = true
        val s = session ?: return
        session = null
        // Keep what was said so far for the record, then stop audio (this unmutes the mic).
        pendingTranscript = s
        s.stop()
        phase = "taken_over"
        updateNotification()
    }

    /** Session the owner took over from; finish() still reads its transcript and notes. */
    @Volatile private var pendingTranscript: GeminiLiveSession? = null

    override fun onHangupRequested() {
        Thread({
            try { ShizukuBridge.service?.endCall() } catch (e: Exception) { Log.w(TAG, "endCall failed", e) }
        }, "outreach-hangup").start()
    }

    override fun onBridgeFailed(reason: String) {
        Log.w(TAG, "Outreach: call audio unavailable, hanging up: $reason")
        onHangupRequested()
    }

    private fun notification(text: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Outreach calls", NotificationManager.IMPORTANCE_LOW))
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 10, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val builder = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Outreach call")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setOngoing(true)
            .setContentIntent(open)
        if (phase == "talking") builder.addAction(action("Take over", ACTION_TAKE_OVER, 11))
        if (busy) builder.addAction(action("Hang up", ACTION_HANGUP, 12))
        return builder.build()
    }

    private fun action(label: String, action: String, code: Int): Notification.Action {
        val pi = PendingIntent.getService(this, code, Intent(this, OutboundCallService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Action.Builder(null, label, pi).build()
    }

    private var lastShown = ""

    private fun updateNotification() {
        val text = when (phase) {
            "dialing" -> "Calling"
            "talking" -> "Agent is talking"
            "taken_over" -> "You are on the call"
            else -> "Ended"
        }
        if (text == lastShown) return
        lastShown = text
        try { getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification(text)) } catch (_: Exception) {}
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "orvia:outreach")
            .apply { acquire(20 * 60 * 1000L) }
    }

    private fun releaseWakeLock() {
        try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
        wakeLock = null
    }
}
