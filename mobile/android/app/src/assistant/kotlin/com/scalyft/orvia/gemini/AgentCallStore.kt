package com.scalyft.orvia.gemini

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Calls the agent handled, one JSON file each, kept until they reach the Orvia
 * dashboard (and a while after, so the app can show them offline).
 *
 * Shape: { id, started_at, ended_at, caller_number, turns: [{role, content}],
 *          notes: [..], uploaded, upload_error }
 */
class AgentCallStore(context: Context, folder: String = INBOUND) {

    private val dir = File(context.filesDir, folder).apply { mkdirs() }

    @Synchronized fun save(call: JSONObject) {
        val target = File(dir, "${call.getString("id")}.json")
        val tmp = File(dir, "${call.getString("id")}.tmp")
        tmp.writeText(call.toString())
        if (!tmp.renameTo(target)) {
            target.writeText(call.toString())
            tmp.delete()
        }
    }

    @Synchronized fun list(limit: Int = 50): List<JSONObject> =
        (dir.listFiles { f -> f.name.endsWith(".json") } ?: emptyArray())
            .mapNotNull { runCatching { JSONObject(it.readText()) }.getOrNull() }
            .sortedByDescending { it.optLong("started_at") }
            .also { prune(it) }
            .take(limit)

    fun pending(): List<JSONObject> = list(Int.MAX_VALUE).filter { !it.optBoolean("uploaded") }

    @Synchronized fun markUploaded(id: String, uploaded: Boolean, error: String?) {
        val file = File(dir, "$id.json")
        val call = runCatching { JSONObject(file.readText()) }.getOrNull() ?: return
        call.put("uploaded", uploaded)
        if (error == null) call.remove("upload_error") else call.put("upload_error", error)
        save(call)
    }

    /** Keeps every unsent call, and the newest 200 sent ones. */
    private fun prune(sortedNewestFirst: List<JSONObject>) {
        sortedNewestFirst.filter { it.optBoolean("uploaded") }.drop(200).forEach {
            File(dir, "${it.optString("id")}.json").delete()
        }
    }

    companion object {
        /** Calls the agent answered; these sync to the dashboard. */
        const val INBOUND = "agent_calls"
        /** Outreach test calls; kept on the phone only. */
        const val OUTBOUND = "outreach_calls"

        fun turnsToJson(turns: List<Pair<String, String>>): JSONArray = JSONArray().apply {
            turns.forEach { (role, text) -> put(JSONObject().put("role", role).put("content", text)) }
        }
    }
}
