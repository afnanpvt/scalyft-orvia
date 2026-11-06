package com.scalyft.orvia.gemini

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/** Flutter side of the call agent: settings, on/off, status, and the saved calls. */
class GeminiPhoneChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {

    companion object {
        const val NAME = "com.scalyft.orvia/gemini_phone"
        const val EXTRA_AUDIO_BRIDGE = "call_audio_bridge"
        private const val MIC_REQUEST_CODE = 4313
    }

    private val prefs by lazy {
        activity.getSharedPreferences(GeminiLiveSession.PREFS, Context.MODE_PRIVATE)
    }

    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "configure" -> {
                val edit = prefs.edit()
                call.argument<String>("apiKey")?.let { edit.putString("apiKey", it.trim()) }
                call.argument<String>("ownerName")?.let { edit.putString("ownerName", it.trim()) }
                call.argument<String>("model")?.let { edit.putString("model", it) }
                call.argument<String>("voice")?.let { edit.putString("voice", it) }
                call.argument<Int>("answerDelaySecs")?.let { edit.putInt("answerDelaySecs", it.coerceIn(0, 60)) }
                edit.apply()
                result.success(true)
            }
            "config" -> result.success(mapOf(
                "ownerName" to (prefs.getString("ownerName", "") ?: ""),
                "model" to (prefs.getString("model", GeminiLiveSession.DEFAULT_MODEL) ?: GeminiLiveSession.DEFAULT_MODEL),
                "voice" to (prefs.getString("voice", "Kore") ?: "Kore"),
                "hasApiKey" to !(prefs.getString("apiKey", "") ?: "").isEmpty(),
                "answerDelaySecs" to CallAgentService.answerDelaySecs(activity),
                "linked" to DeviceAgentClient(activity).linked,
            ))
            "linkBackend" -> {
                DeviceAgentClient(activity).configure(
                    call.argument<String>("supabaseUrl") ?: "",
                    call.argument<String>("anonKey") ?: "",
                    call.argument<String>("deviceToken"),
                )
                CallAgentService.requestSync(activity)
                result.success(true)
            }
            "status" -> {
                // Left on, but stopped (app update, force stop, low memory): start it again.
                if (CallAgentService.isEnabled(activity) && !CallAgentService.running) {
                    try { CallAgentService.setEnabled(activity, true) } catch (_: Exception) {}
                }
                result.success(status())
            }
            "setAgentEnabled" -> {
                val enabled = call.argument<Boolean>("enabled") == true
                if (enabled && ShizukuBridge.status() == ShizukuBridge.Status.NO_PERMISSION) {
                    ShizukuBridge.requestPermission()
                } else if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    // So "the agent took a call" alerts can show.
                    activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), MIC_REQUEST_CODE + 1)
                }
                try {
                    CallAgentService.setEnabled(activity, enabled)
                    result.success(status())
                } catch (e: Exception) {
                    result.error("AGENT_START", e.message, null)
                }
            }
            "requestShizukuPermission" -> {
                ShizukuBridge.requestPermission()
                result.success(true)
            }
            "openShizuku" -> {
                val intent = activity.packageManager.getLaunchIntentForPackage("moe.shizuku.privileged.api")
                if (intent != null) activity.startActivity(intent)
                result.success(intent != null)
            }
            "requestBatteryExemption" -> {
                requestBatteryExemption()
                result.success(true)
            }
            "openVendorBatterySettings" -> result.success(openVendorBatterySettings())
            "setBatteryAcknowledged" -> {
                prefs.edit().putBoolean("batteryAcknowledged", call.argument<Boolean>("done") == true).apply()
                result.success(true)
            }
            "agentCalls" -> worker.execute {
                val calls = AgentCallStore(activity).list().map { jsonToMap(it) }
                mainHandler.post { result.success(calls) }
            }
            "syncAgentCalls" -> {
                CallAgentService.requestSync(activity)
                result.success(true)
            }
            "startTalk" -> startTalk(result)
            "stopTalk" -> {
                activity.startService(
                    Intent(activity, GeminiAssistantService::class.java)
                        .setAction(GeminiAssistantService.ACTION_STOP)
                )
                result.success(true)
            }
            "isTalking" -> result.success(GeminiAssistantService.running)
            "placeOutboundCall" -> {
                if (OutboundCallService.busy || CallAgentService.onCall || GeminiAssistantService.running) {
                    result.error("OUTREACH_BUSY", "A call or Talk now is already in progress.", null)
                } else if (CallParsing.dialable(call.argument<String>("number") ?: "") == null) {
                    result.error("OUTREACH_NUMBER", "That does not look like a phone number.", null)
                } else if (ShizukuBridge.status() != ShizukuBridge.Status.READY) {
                    result.error("SHIZUKU", "Start Shizuku and allow Orvia Assistant first.", null)
                } else {
                    try {
                        OutboundCallService.start(activity, OutboundCallService.OutreachCall(
                            contactId = call.argument<String>("contactId") ?: "",
                            number = call.argument<String>("number") ?: "",
                            name = call.argument<String>("name") ?: "",
                            business = call.argument<String>("business") ?: "",
                            company = call.argument<String>("company") ?: "",
                            pitch = call.argument<String>("pitch") ?: "",
                            availability = call.argument<String>("availability") ?: "",
                        ))
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("OUTREACH_START", e.message, null)
                    }
                }
            }
            "outreachStatus" -> result.success(mapOf(
                "phase" to OutboundCallService.phase,
                "contactId" to OutboundCallService.contactId,
                "error" to OutboundCallService.lastError,
            ))
            "outreachCalls" -> worker.execute {
                val calls = AgentCallStore(activity, AgentCallStore.OUTBOUND).list(200).map { o ->
                    jsonToMap(o) + mapOf(
                        "contactId" to o.optString("contact_id"),
                        "outcome" to o.optString("outcome"),
                        "meeting" to o.optJSONObject("meeting")?.let { m ->
                            mapOf("when" to m.optString("when"), "name" to m.optString("name"),
                                "contact" to m.optString("contact"), "notes" to m.optString("notes"))
                        },
                        "error" to o.optString("error").ifEmpty { null },
                    )
                }
                mainHandler.post { result.success(calls) }
            }
            "outreachTakeOver" -> {
                OutboundCallService.send(activity, OutboundCallService.ACTION_TAKE_OVER)
                result.success(true)
            }
            "outreachHangUp" -> {
                OutboundCallService.send(activity, OutboundCallService.ACTION_HANGUP)
                result.success(true)
            }
            "answerOwner" -> {
                val action = when (call.argument<String>("answer")) {
                    "join" -> CallAgentService.ACTION_OWNER_JOIN
                    "reply" -> CallAgentService.ACTION_OWNER_REPLY
                    else -> CallAgentService.ACTION_OWNER_BUSY
                }
                try {
                    activity.startService(
                        Intent(activity, CallAgentService::class.java)
                            .setAction(action)
                            .putExtra(CallAgentService.EXTRA_REPLY, call.argument<String>("text") ?: "")
                    )
                    result.success(true)
                } catch (e: Exception) {
                    result.error("AGENT_ANSWER", e.message, null)
                }
            }
            "skipNumbers" -> result.success(CallAgentService.skipNumbers(activity))
            "setSkipNumbers" -> {
                CallAgentService.setSkipNumbers(activity, call.argument<List<String>>("numbers") ?: emptyList())
                result.success(true)
            }
            "takeOverCall" -> {
                sendAgentAction(CallAgentService.ACTION_TAKE_OVER)
                result.success(true)
            }
            "hangUpCall" -> {
                sendAgentAction(CallAgentService.ACTION_HANGUP)
                result.success(true)
            }
            "probeCallAudio" -> runProbe(result) { it.captureFiveSeconds() }
            "testCallUplink" -> runProbe(result) { it.injectShortTone() }
            else -> result.notImplemented()
        }
    }

    private fun status(): Map<String, Any?> {
        val pm = activity.getSystemService(PowerManager::class.java)
        return mapOf(
            "enabled" to CallAgentService.isEnabled(activity),
            "running" to CallAgentService.running,
            "state" to CallAgentService.state,
            "shizuku" to when (ShizukuBridge.status()) {
                ShizukuBridge.Status.OFFLINE -> "offline"
                ShizukuBridge.Status.NO_PERMISSION -> "no_permission"
                ShizukuBridge.Status.READY -> "ready"
            },
            "batteryExempt" to (pm?.isIgnoringBatteryOptimizations(activity.packageName) == true),
            "batteryAcknowledged" to prefs.getBoolean("batteryAcknowledged", false),
            "vendor" to Build.MANUFACTURER.lowercase(),
            "talking" to GeminiAssistantService.running,
            "onCall" to CallAgentService.onCall,
            "ownerRequest" to CallAgentService.ownerRequest,
            "liveTurns" to CallAgentService.liveTurns().map { (role, text) -> mapOf("role" to role, "content" to text) },
        )
    }

    private fun sendAgentAction(action: String) {
        try {
            activity.startService(Intent(activity, CallAgentService::class.java).setAction(action))
        } catch (e: Exception) {
            Log.w("GeminiPhone", "Could not send $action to the call agent", e)
        }
    }

    /**
     * vivo (and iQOO) stop background apps through their own power manager, which the
     * standard battery-optimization exemption does not cover. Opens its "high background
     * power use" page if present, else this app's system settings page.
     */
    private fun openVendorBatterySettings(): String {
        val candidates = listOf(
            "vivo" to Intent("com.iqoo.powersaving.battery.high.power.jump"),
            "vivo" to Intent("com.vivo.abe.highpower.search.powermanageractivity"),
        )
        for ((vendor, intent) in candidates) {
            // startActivity, not resolveActivity: package visibility hides other apps' activities.
            try {
                activity.startActivity(intent)
                return vendor
            } catch (_: Exception) {}
        }
        activity.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${activity.packageName}"))
        )
        return "app"
    }

    @SuppressLint("BatteryLife")
    private fun requestBatteryExemption() {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:${activity.packageName}"))
        try { activity.startActivity(intent) }
        catch (_: Exception) { activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
    }

    private fun startTalk(result: MethodChannel.Result) {
        // A second session on the same call audio would cut the agent off mid-sentence.
        if (CallAgentService.onCall || OutboundCallService.busy) {
            result.error("AGENT_ON_CALL", "The agent is on a call. Use Take over to join it.", null)
            return
        }
        when (ShizukuBridge.status()) {
            ShizukuBridge.Status.OFFLINE -> {
                result.error("SHIZUKU_OFFLINE", "Start the Shizuku service, then retry.", null); return
            }
            ShizukuBridge.Status.NO_PERMISSION -> {
                ShizukuBridge.requestPermission()
                result.error("SHIZUKU_PERMISSION", "Allow Orvia Assistant in Shizuku, then tap talk again.", null); return
            }
            ShizukuBridge.Status.READY -> {}
        }
        worker.execute {
            val service = ShizukuBridge.await(activity)
            if (service == null) {
                mainHandler.post { result.error("SHIZUKU_SERVICE", "Call audio service did not connect.", null) }
                return@execute
            }
            // In a call, Gemini joins the call audio. Otherwise it is a mic conversation.
            val inCall = try { service.callState() != TelephonyManager.CALL_STATE_IDLE } catch (_: Exception) { false }
            if (!inCall && activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                mainHandler.post {
                    activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC_REQUEST_CODE)
                    result.error("MIC_PERMISSION", "Allow the microphone, then tap Talk now again.", null)
                }
                return@execute
            }
            val intent = Intent(activity, GeminiAssistantService::class.java)
                .setAction(GeminiAssistantService.ACTION_START)
            if (inCall) intent.putExtras(Bundle().apply { putBinder(EXTRA_AUDIO_BRIDGE, service.asBinder()) })
            mainHandler.post {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(intent)
                    else activity.startService(intent)
                    result.success(true)
                } catch (e: Exception) {
                    result.error("ASSISTANT_START", e.message, null)
                }
            }
        }
    }

    private fun runProbe(result: MethodChannel.Result, operation: (IVoiceCallProbe) -> String) {
        if (ShizukuBridge.status() != ShizukuBridge.Status.READY) {
            ShizukuBridge.requestPermission()
            result.error("SHIZUKU", "Shizuku is not running or Orvia Assistant is not allowed in it.", null)
            return
        }
        worker.execute {
            try {
                val response = ShizukuBridge.await(activity)?.let(operation) ?: "Shizuku UserService did not connect"
                mainHandler.post { result.success(response) }
            } catch (e: Exception) {
                mainHandler.post { result.error("PROBE_FAILED", e.message, null) }
            }
        }
    }

    private fun jsonToMap(o: org.json.JSONObject): Map<String, Any?> {
        val turns = o.optJSONArray("turns")
        val notes = o.optJSONArray("notes")
        return mapOf(
            "id" to o.optString("id"),
            "startedAt" to o.optLong("started_at"),
            "endedAt" to o.optLong("ended_at"),
            "callerNumber" to o.optString("caller_number"),
            "uploaded" to o.optBoolean("uploaded"),
            "uploadError" to o.optString("upload_error").ifEmpty { null },
            "notes" to (0 until (notes?.length() ?: 0)).map { notes!!.optString(it) },
            "turns" to (0 until (turns?.length() ?: 0)).map {
                val t = turns!!.getJSONObject(it)
                mapOf("role" to t.optString("role"), "content" to t.optString("content"))
            },
        )
    }
}
