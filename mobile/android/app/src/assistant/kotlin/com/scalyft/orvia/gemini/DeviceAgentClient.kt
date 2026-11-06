package com.scalyft.orvia.gemini

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Talks to the `device-agent` edge function with the device token the app got
 * when the owner linked this phone. That token, not the owner's login session,
 * lets the agent work while the app is closed: it can save calls to the
 * dashboard and mint short-lived Gemini tokens, nothing else.
 */
class DeviceAgentClient(context: Context) {

    companion object {
        const val PREFS = "agent_backend"
        private const val TAG = "GeminiPhone"
        private val JSON = "application/json".toMediaType()
        private val http = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build()
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    val linked: Boolean
        get() = !prefs.getString("deviceToken", null).isNullOrEmpty() &&
            !prefs.getString("supabaseUrl", null).isNullOrEmpty()

    fun configure(supabaseUrl: String, anonKey: String, deviceToken: String?) {
        prefs.edit()
            .putString("supabaseUrl", supabaseUrl.trimEnd('/'))
            .putString("anonKey", anonKey)
            .apply {
                if (deviceToken.isNullOrEmpty()) remove("deviceToken") else putString("deviceToken", deviceToken)
            }
            .apply()
    }

    /** Ephemeral Gemini Live token and the server's default model, or null. */
    fun geminiToken(): Pair<String, String>? {
        val res = post(JSONObject().put("action", "gemini_token")) ?: return null
        val token = res.optString("token")
        if (token.isEmpty()) return null
        return token to res.optString("model")
    }

    /** Null on success, otherwise a short reason. */
    fun saveCall(call: JSONObject): String? {
        if (!linked) return "Phone not linked to Orvia"
        val payload = JSONObject()
            .put("action", "save")
            .put("call", JSONObject()
                .put("id", call.getString("id"))
                .put("started_at", call.optLong("started_at"))
                .put("ended_at", call.optLong("ended_at"))
                .put("caller_number", call.optString("caller_number"))
                .put("turns", call.optJSONArray("turns"))
                .put("notes", call.optJSONArray("notes")))
        val res = post(payload) ?: return lastError ?: "Upload failed"
        return if (res.optBoolean("ok")) null else res.optString("error", "Upload failed")
    }

    @Volatile private var lastError: String? = null

    private fun post(body: JSONObject): JSONObject? {
        val url = prefs.getString("supabaseUrl", null) ?: return null
        val anonKey = prefs.getString("anonKey", null) ?: return null
        val token = prefs.getString("deviceToken", null) ?: return null
        val request = Request.Builder()
            .url("$url/functions/v1/device-agent")
            .header("apikey", anonKey)
            .header("x-orvia-device-token", token)
            .post(body.toString().toRequestBody(JSON))
            .build()
        return try {
            http.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (!resp.isSuccessful) {
                    lastError = json?.optString("error")?.takeIf { it.isNotEmpty() } ?: "HTTP ${resp.code}"
                    Log.w(TAG, "device-agent ${body.optString("action")} failed: $lastError")
                    null
                } else {
                    lastError = null
                    json
                }
            }
        } catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
            Log.w(TAG, "device-agent ${body.optString("action")} error", e)
            null
        }
    }
}
