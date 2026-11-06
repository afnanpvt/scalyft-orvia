package com.scalyft.orvia.gemini

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Pure helpers for the call agent, kept free of Android types so they unit-test on the JVM. */
object CallParsing {

    /**
     * The caller's number from `dumpsys telephony.registry`. The dump has one block per
     * SIM ("Phone Id=N"), each with mCallState and mCallIncomingNumber. A SIM that is not
     * ringing can still hold the number of an old call, so only the ringing SIM counts,
     * then an off-hook one. Empty when hidden or unknown.
     */
    fun ringingNumber(registryDump: String): String {
        val blocks = registryDump.split(Regex("Phone Id=\\d+")).drop(1)
        val parsed = blocks.map { block ->
            val state = Regex("mCallState=(\\d+)").find(block)?.groupValues?.get(1)?.toIntOrNull() ?: -1
            val number = Regex("mCallIncomingNumber=([^\\s]*)").find(block)?.groupValues?.get(1).orEmpty()
            state to number
        }
        return parsed.firstOrNull { it.first == 1 && it.second.isNotEmpty() }?.second
            ?: parsed.firstOrNull { it.first == 2 && it.second.isNotEmpty() }?.second
            ?: ""
    }

    const val CALL_ACTIVE = 1

    /**
     * The foreground call's precise state from the same dump ("Foreground call state: N").
     * For an outgoing call the plain call state is already off-hook while it rings, so this
     * is how the agent knows the other side picked up. ACTIVE on any SIM wins.
     */
    fun foregroundCallState(registryDump: String): Int {
        val states = Regex("Foreground call state: (-?\\d+)").findAll(registryDump)
            .mapNotNull { it.groupValues[1].toIntOrNull() }.toList()
        return when {
            states.isEmpty() -> -1
            CALL_ACTIVE in states -> CALL_ACTIVE
            else -> states.firstOrNull { it > 0 } ?: states.max()
        }
    }

    /** Digits with an optional leading +, as dialed. Anything else is refused. */
    fun dialable(number: String): String? {
        val cleaned = number.replace(Regex("[\\s()-]"), "")
        return cleaned.takeIf { Regex("^\\+?[0-9]{5,15}$").matches(it) }
    }

    /**
     * Whether two numbers are the same line, however they are written. Compares the last
     * 10 digits, so "+91 98765 43210", "098765 43210" and "9876543210" all match. Numbers
     * shorter than 7 digits (service codes) must match exactly.
     */
    fun sameNumber(a: String, b: String): Boolean {
        val x = a.filter { it.isDigit() }
        val y = b.filter { it.isDigit() }
        if (x.isEmpty() || y.isEmpty()) return false
        if (x.length < 7 || y.length < 7) return x == y
        return x.takeLast(10) == y.takeLast(10)
    }

    /** Last four digits only, for logs. */
    fun mask(number: String): String = if (number.length <= 4) "****" else "****" + number.takeLast(4)

    /** The newest number in `content query --uri content://call_log/calls --projection number:date` output. */
    fun newestCallLogNumber(queryOutput: String): String =
        Regex("number=([^,]*), date=(\\d+)").findAll(queryOutput)
            .map { it.groupValues[1].trim() to (it.groupValues[2].toLongOrNull() ?: 0L) }
            .filter { it.first.isNotEmpty() && it.first != "NULL" }
            .maxByOrNull { it.second }?.first ?: ""
}

object AudioMath {
    /** Gemini speaks 24 kHz PCM16; the call uplink track runs at 16 kHz. Linear interpolation. */
    fun resample24kTo16k(pcm24: ByteArray): ByteArray {
        val sampleCount = pcm24.size / 2
        if (sampleCount == 0) return ByteArray(0)
        val input = ByteBuffer.wrap(pcm24).order(ByteOrder.LITTLE_ENDIAN)
        val source = ShortArray(sampleCount) { input.short }
        val outputCount = sampleCount * 2 / 3
        val output = ByteBuffer.allocate(outputCount * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until outputCount) {
            val position = i * 1.5
            val index = position.toInt().coerceAtMost(sampleCount - 1)
            val next = (index + 1).coerceAtMost(sampleCount - 1)
            val fraction = position - index
            val sample = source[index] * (1.0 - fraction) + source[next] * fraction
            output.putShort(sample.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
        }
        return output.array()
    }
}

/**
 * Builds the call transcript from Gemini's streamed transcription chunks. Consecutive
 * chunks from the same speaker join into one turn. Thread-safe: chunks arrive on the
 * socket thread while the agent reads the result on its own thread.
 */
class TranscriptBuilder {
    private val turns = mutableListOf<Pair<String, StringBuilder>>()

    @Synchronized fun append(role: String, text: String) {
        if (text.isEmpty()) return
        val last = turns.lastOrNull()
        if (last != null && last.first == role) last.second.append(text)
        else turns.add(role to StringBuilder(text))
    }

    /** Turns as (role, text), trimmed, without empty ones. Role is "user" or "assistant". */
    @Synchronized fun turns(): List<Pair<String, String>> =
        turns.map { it.first to it.second.toString().trim().replace(Regex("\\s+"), " ") }
            .filter { it.second.isNotEmpty() }
}
