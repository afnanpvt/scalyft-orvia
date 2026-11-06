package com.scalyft.orvia.gemini

import org.junit.Assert.assertEquals
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AgentLogicTest {

    private fun registry(vararg phones: Pair<Int, String>) = buildString {
        appendLine("last known state:")
        phones.forEachIndexed { id, (state, number) ->
            appendLine("  Phone Id=$id")
            appendLine("    mCallState=$state")
            appendLine("    mServiceState=...")
            appendLine("    mCallIncomingNumber=$number")
            appendLine("    mSignalStrength=...")
        }
    }

    @Test
    fun takesTheNumberOfTheRingingSim() {
        assertEquals("+919876543210", CallParsing.ringingNumber(registry(0 to "", 1 to "+919876543210")))
    }

    @Test
    fun ignoresAStaleNumberOnAnIdleSim() {
        // SIM 1 is idle but still holds an old caller; SIM 2 is ringing.
        assertEquals("", CallParsing.ringingNumber(registry(0 to "+14155550100", 1 to "")))
        assertEquals("+919000000001", CallParsing.ringingNumber(registry(0 to "+14155550100", 1 to "+919000000001")))
    }

    @Test
    fun fallsBackToTheOffHookSim() {
        assertEquals("+919876543210", CallParsing.ringingNumber(registry(2 to "+919876543210", 0 to "")))
    }

    @Test
    fun emptyWhenNothingIsKnown() {
        assertEquals("", CallParsing.ringingNumber(""))
        assertEquals("", CallParsing.ringingNumber(registry(0 to "", 0 to "")))
    }

    @Test
    fun picksTheNewestCallLogEntry() {
        val out = """
            Row: 0 number=+919876543210, date=1791900000000
            Row: 1 number=+14155550100, date=1791900500000
            Row: 2 number=NULL, date=1791900900000
        """.trimIndent()
        assertEquals("+14155550100", CallParsing.newestCallLogNumber(out))
        assertEquals("", CallParsing.newestCallLogNumber("No result found."))
    }

    private fun pcm(vararg samples: Short): ByteArray =
        ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN).apply { samples.forEach { putShort(it) } }.array()

    private fun shorts(bytes: ByteArray): List<Short> {
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return List(bytes.size / 2) { b.short }
    }

    @Test
    fun resamplesThreeSamplesToTwo() {
        val out = shorts(AudioMath.resample24kTo16k(pcm(0, 300, 600, 900, 1200, 1500)))
        assertEquals(listOf<Short>(0, 450, 900, 1350), out)
    }

    @Test
    fun resampleKeepsDurationAndHandlesEmptyInput() {
        assertEquals(0, AudioMath.resample24kTo16k(ByteArray(0)).size)
        val oneSecond = ByteArray(24_000 * 2)
        assertEquals(16_000 * 2, AudioMath.resample24kTo16k(oneSecond).size)
    }

    @Test
    fun resampleDoesNotOverflowAtFullScale() {
        val out = shorts(AudioMath.resample24kTo16k(pcm(Short.MAX_VALUE, Short.MAX_VALUE, Short.MIN_VALUE)))
        assertEquals(Short.MAX_VALUE, out[0])
    }

    @Test
    fun joinsChunksFromTheSameSpeaker() {
        val t = TranscriptBuilder()
        t.append("assistant", "Hi, this is")
        t.append("assistant", " Alhaan's assistant.")
        t.append("user", "Salaam,")
        t.append("user", "  kya aap   Dakhni bolte?")
        t.append("assistant", "Ji haan.")
        assertEquals(
            listOf(
                "assistant" to "Hi, this is Alhaan's assistant.",
                "user" to "Salaam, kya aap Dakhni bolte?",
                "assistant" to "Ji haan.",
            ),
            t.turns(),
        )
    }

    @Test
    fun dropsEmptyTurns() {
        val t = TranscriptBuilder()
        t.append("user", "   ")
        t.append("assistant", "")
        assertEquals(emptyList<Pair<String, String>>(), t.turns())
    }

    private fun precise(vararg foreground: Int) = foreground.withIndex().joinToString("\n") { (id, state) ->
        "  Phone Id=$id\n    mPreciseCallState=Ringing call state: 0, Foreground call state: $state, Background call state: 0"
    }

    @Test
    fun knowsWhenTheOtherSidePickedUp() {
        assertEquals(3, CallParsing.foregroundCallState(precise(3, -1))) // dialing
        assertEquals(4, CallParsing.foregroundCallState(precise(-1, 4))) // ringing them
        assertEquals(CallParsing.CALL_ACTIVE, CallParsing.foregroundCallState(precise(0, 1)))
        assertEquals(0, CallParsing.foregroundCallState(precise(0, 0)))
        assertEquals(-1, CallParsing.foregroundCallState(""))
    }

    @Test
    fun onlyDialsRealNumbers() {
        assertEquals("+14155550100", CallParsing.dialable("+1 (415) 555-0100"))
        assertEquals("9876543210", CallParsing.dialable("98765 43210"))
        assertEquals(null, CallParsing.dialable("*#06#"))
        assertEquals(null, CallParsing.dialable("+1 415; rm"))
        assertEquals(null, CallParsing.dialable("12"))
    }

    @Test
    fun matchesTheSameLineWrittenDifferently() {
        assertEquals(true, CallParsing.sameNumber("+91 98765 43210", "9876543210"))
        assertEquals(true, CallParsing.sameNumber("098765-43210", "+919876543210"))
        assertEquals(true, CallParsing.sameNumber("+1 (415) 555-0100", "4155550100"))
        assertEquals(false, CallParsing.sameNumber("+919876543210", "+919876543211"))
        assertEquals(false, CallParsing.sameNumber("", "9876543210"))
        assertEquals(true, CallParsing.sameNumber("121", "121"))
        assertEquals(false, CallParsing.sameNumber("121", "+91121"))
    }

    @Test
    fun masksNumbersForLogs() {
        assertEquals("****0100", CallParsing.mask("+14155550100"))
        assertEquals("****", CallParsing.mask("123"))
    }
}
