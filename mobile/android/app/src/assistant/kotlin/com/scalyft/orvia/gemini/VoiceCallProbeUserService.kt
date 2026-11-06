package com.scalyft.orvia.gemini

import android.content.AttributionSource
import android.content.Context
import android.content.ContextWrapper
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.system.Os
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import kotlin.math.sqrt

/**
 * Privileged half of the call agent. Shizuku runs it as the shell user (UID 2000),
 * which holds CAPTURE_AUDIO_OUTPUT, CALL_AUDIO_INTERCEPTION, MODIFY_PHONE_STATE and
 * READ_CALL_LOG on this device, so it can hear the caller, speak into the call,
 * answer and hang up. The app process runs Gemini and talks to this over AIDL.
 */
class VoiceCallProbeUserService : IVoiceCallProbe.Stub() {

    @Volatile private var callDownlink: AudioRecord? = null
    @Volatile private var callUplink: AudioTrack? = null
    @Volatile private var audioCallback: IVoiceCallAudioCallback? = null
    @Volatile private var callCaptureThread: Thread? = null
    @Volatile private var mutedManager: AudioManager? = null
    private val callAudioLock = Any()
    private val shellContext: Context by lazy { createShellPackageContext() }

    // ---- Call control ----

    @Suppress("DEPRECATION")
    override fun callState(): Int = try {
        shellContext.getSystemService(TelephonyManager::class.java)?.callState ?: -1
    } catch (e: Exception) {
        Log.e(TAG, "callState failed", e)
        val telecom = shellContext.getSystemService(TelecomManager::class.java)
        if (telecom?.isInCall == true) TelephonyManager.CALL_STATE_OFFHOOK else TelephonyManager.CALL_STATE_IDLE
    }

    override fun placeCall(number: String): Boolean {
        val dial = CallParsing.dialable(number) ?: return false
        if (callState() != TelephonyManager.CALL_STATE_IDLE) return false
        // Shell holds CALL_PHONE; the app process needs no phone permission for this.
        val out = exec("am", "start", "-a", "android.intent.action.CALL", "-d", "tel:$dial")
        Log.i(TAG, "Outreach: dialing ${CallParsing.mask(dial)}")
        return !out.contains("Error", ignoreCase = true)
    }

    override fun foregroundCallState(): Int =
        CallParsing.foregroundCallState(exec("dumpsys", "telephony.registry"))

    override fun currentCallNumber(): String {
        // telephony.registry keeps the number of the ringing call for privileged readers.
        return CallParsing.ringingNumber(exec("dumpsys", "telephony.registry"))
    }

    @Suppress("DEPRECATION")
    override fun answerRingingCall(): Boolean {
        try {
            val telecom = shellContext.getSystemService(TelecomManager::class.java)
            if (telecom != null && callState() == TelephonyManager.CALL_STATE_RINGING) {
                telecom.acceptRingingCall()
                for (i in 0 until 15) {
                    if (callState() != TelephonyManager.CALL_STATE_RINGING) return true
                    Thread.sleep(100)
                }
                Log.w(TAG, "acceptRingingCall had no effect, falling back to KEYCODE_CALL")
            }
        } catch (e: Exception) {
            Log.e(TAG, "acceptRingingCall failed, falling back to KEYCODE_CALL", e)
        }
        if (callState() != TelephonyManager.CALL_STATE_RINGING) return callState() == TelephonyManager.CALL_STATE_OFFHOOK
        exec("input", "keyevent", "KEYCODE_CALL")
        return true
    }

    @Suppress("DEPRECATION")
    override fun endCall(): Boolean {
        try {
            val telecom = shellContext.getSystemService(TelecomManager::class.java)
            if (telecom != null && telecom.endCall()) return true
        } catch (e: Exception) {
            Log.e(TAG, "endCall failed, falling back to KEYCODE_ENDCALL", e)
        }
        if (callState() == TelephonyManager.CALL_STATE_IDLE) return true
        exec("input", "keyevent", "KEYCODE_ENDCALL")
        return true
    }

    override fun callLogNumberSince(sinceMillis: Long): String {
        val out = exec(
            "content", "query", "--uri", "content://call_log/calls",
            "--projection", "number:date",
            "--where", "date>$sinceMillis"
        )
        return CallParsing.newestCallLogNumber(out)
    }

    // ---- Call audio bridge ----

    override fun startCallAudio(callback: IVoiceCallAudioCallback): String {
        val uid = Os.getuid()
        if (uid != 2000) return "CALL_BRIDGE: unexpected service UID $uid (expected shell UID 2000)"
        synchronized(callAudioLock) {
            stopCallAudioLocked()
            try {
                val audioManager = shellContext.getSystemService(AudioManager::class.java)
                    ?: return "CALL_BRIDGE: AudioManager unavailable"
                val interceptable = isPstnInterceptable(audioManager)
                if (audioManager.mode != AudioManager.MODE_IN_CALL || !interceptable) {
                    return "CALL_BRIDGE: active PSTN call not interceptable; mode=${audioManager.mode} interceptable=$interceptable"
                }
                val rate = 16_000
                val record = createDownlinkRecord(rate)
                if (record.state != AudioRecord.STATE_INITIALIZED) {
                    record.release()
                    return "CALL_BRIDGE: downlink AudioRecord state=${record.state}"
                }
                val (output, uplinkDetail) = createUplinkTrack(rate, rate / 2)
                if (output.state != AudioTrack.STATE_INITIALIZED) {
                    output.release()
                    record.release()
                    return "CALL_BRIDGE: uplink AudioTrack state=${output.state}"
                }
                record.startRecording()
                if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    record.release()
                    output.release()
                    return "CALL_BRIDGE: downlink did not start recording"
                }
                output.play()
                // Mute the phone's own mic so only the agent's injected audio reaches the
                // caller. Without this the live mic also feeds the uplink (voice_tx), so the
                // owner's voice goes through, and the mic picking up the earpiece echoes the
                // caller back to themselves. The agent still hears the caller via the downlink
                // capture, which does not depend on the mic.
                try {
                    audioManager.isMicrophoneMute = true
                    mutedManager = audioManager
                } catch (e: Exception) {
                    Log.w(TAG, "Could not mute the call mic", e)
                }
                callDownlink = record
                callUplink = output
                audioCallback = callback
                val thread = Thread({
                    val shorts = ShortArray(320)
                    var chunks = 0
                    while (!Thread.currentThread().isInterrupted && callDownlink === record) {
                        val count = record.read(shorts, 0, shorts.size, AudioRecord.READ_BLOCKING)
                        if (count <= 0) continue
                        // About once a second: Telecom reapplies its own mute state on audio route
                        // changes (speaker, Bluetooth), which would put the owner's mic back on the call.
                        if (++chunks % 50 == 0) {
                            mutedManager?.let { am ->
                                try { if (!am.isMicrophoneMute) am.isMicrophoneMute = true } catch (_: Exception) {}
                            }
                        }
                        val pcm = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
                        for (i in 0 until count) pcm.putShort(shorts[i])
                        try {
                            audioCallback?.onPcmChunk(pcm.array())
                        } catch (e: android.os.DeadObjectException) {
                            // The app side is gone; stop capturing instead of spinning.
                            Log.w(TAG, "App went away, stopping call audio")
                            Thread { stopCallAudio() }.start()
                            break
                        } catch (e: Exception) {
                            Log.e(TAG, "Downlink callback failed", e)
                        }
                    }
                }, "call-downlink").apply { isDaemon = true }
                callCaptureThread = thread
                thread.start()
                val route = output.routedDevice?.let { "${it.productName}/type=${it.type}" } ?: "pending"
                return "CALL_BRIDGE_STARTED uid=$uid rate=$rate route=$route $uplinkDetail"
            } catch (e: Exception) {
                Log.e(TAG, "Call audio bridge start failed", e)
                return "CALL_BRIDGE: ${e.javaClass.simpleName}: ${e.cause?.message ?: e.message}"
            }
        }
    }

    override fun writeCallAudio(pcm16: ByteArray) {
        val output = callUplink ?: return
        try {
            val written = output.write(pcm16, 0, pcm16.size, AudioTrack.WRITE_BLOCKING)
            if (written < 0) Log.e(TAG, "Call uplink AudioTrack.write failed: $written")
        } catch (e: Exception) {
            Log.e(TAG, "Call uplink write failed", e)
            try { audioCallback?.onError("CALL_BRIDGE uplink write: ${e.message}") } catch (_: Exception) {}
        }
    }

    override fun flushCallAudio() {
        val output = callUplink ?: return
        try {
            output.pause()
            output.flush()
            output.play()
        } catch (e: Exception) {
            Log.e(TAG, "Call uplink flush failed", e)
        }
    }

    override fun stopCallAudio() {
        synchronized(callAudioLock) { stopCallAudioLocked() }
    }

    private fun stopCallAudioLocked() {
        val record = callDownlink
        val output = callUplink
        callDownlink = null
        audioCallback = null
        // Give the owner their mic back, whether the call continues (they took over) or ended.
        try { mutedManager?.isMicrophoneMute = false } catch (_: Exception) {}
        mutedManager = null
        callCaptureThread?.interrupt()
        callCaptureThread = null
        try { output?.pause() } catch (_: Exception) {}
        try { output?.flush() } catch (_: Exception) {}
        try { output?.stop() } catch (_: Exception) {}
        output?.release()
        callUplink = null
        try { record?.stop() } catch (_: Exception) {}
        record?.release()
    }

    /**
     * Far-end audio only. VOICE_CALL/VOICE_DOWNLINK fail to initialize on this vivo
     * unless the record is built in call-redirection mode with the shell context.
     */
    private fun createDownlinkRecord(rate: Int): AudioRecord {
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val minBuffer = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val attributesBuilder = AudioAttributes.Builder()
        AudioAttributes.Builder::class.java
            .getDeclaredMethod("setInternalCapturePreset", Int::class.javaPrimitiveType)
            .apply { isAccessible = true }
            .invoke(attributesBuilder, MediaRecorder.AudioSource.VOICE_DOWNLINK)
        val builder = AudioRecord.Builder()
        AudioRecord.Builder::class.java
            .getMethod("setContext", Context::class.java)
            .invoke(builder, shellContext)
        AudioRecord.Builder::class.java
            .getMethod("setAudioAttributes", AudioAttributes::class.java)
            .invoke(builder, attributesBuilder.build())
        AudioRecord.Builder::class.java
            .getDeclaredMethod("setCallRedirectionMode", Int::class.javaPrimitiveType)
            .apply { isAccessible = true }
            .invoke(builder, 1 /* CALL_REDIRECT_PSTN */)
        return builder.setAudioFormat(format)
            .setBufferSizeInBytes(maxOf(minBuffer * 2, 6400))
            .build()
    }

    /**
     * Track that the DSP mixes into the call uplink. AudioPolicyManager only tags a track
     * AUDIO_OUTPUT_FLAG_INCALL_MUSIC (the `incall_music_uplink` port) when its stream is MUSIC
     * and Telephony Tx was explicitly selected. CALL_ASSISTANT/call-redirect tracks land on the
     * unflagged `voice_tx` port instead, which this Qualcomm HAL sends to the AFE proxy, not
     * the modem. Writing to Telephony Tx requires MODIFY_PHONE_STATE, held by shell.
     */
    private fun createUplinkTrack(rate: Int, bufferBytes: Int): Pair<AudioTrack, String> {
        val audioManager = shellContext.getSystemService(AudioManager::class.java)
        val telephonyTx = audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            ?.firstOrNull { it.type == AudioDeviceInfo.TYPE_TELEPHONY }
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        val builder = AudioTrack.Builder()
        AudioTrack.Builder::class.java
            .getMethod("setContext", Context::class.java)
            .invoke(builder, shellContext)
        val track = builder.setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferBytes)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        val selected = telephonyTx != null && track.setPreferredDevice(telephonyTx)
        val detail = "telephonyTx=${telephonyTx?.let { "${it.id}/${it.productName}" } ?: "missing"} preferred=$selected"
        return track to detail
    }

    private fun isPstnInterceptable(audioManager: AudioManager): Boolean =
        audioManager.javaClass.getMethod("isPstnCallAudioInterceptable").invoke(audioManager) as Boolean

    // ---- Probes, kept for diagnosing a new phone ----

    override fun injectShortTone(): String {
        val uid = Os.getuid()
        if (uid != 2000) return "Unexpected service UID: $uid (expected shell UID 2000)"
        var track: AudioTrack? = null
        try {
            val audioManager = shellContext.getSystemService(AudioManager::class.java)
                ?: return "CALL_TX: AudioManager unavailable"
            val details = "mode=${audioManager.mode} interceptable=${isPstnInterceptable(audioManager)}"
            val rate = 16_000
            val (uplinkTrack, uplinkDetail) = createUplinkTrack(rate, rate)
            track = uplinkTrack
            if (track.state != AudioTrack.STATE_INITIALIZED) return "CALL_TX: AudioTrack state=${track.state}; $details"

            // Long enough to be unmistakable on the far end and to inspect with dumpsys.
            val beepMs = 400
            val gapMs = 200
            val beepCount = 6
            val totalMs = beepCount * beepMs + (beepCount - 1) * gapMs
            val tone = ShortArray(rate * totalMs / 1000)
            for (i in tone.indices) {
                val positionInBurst = i % (rate * (beepMs + gapMs) / 1000)
                if (positionInBurst >= rate * beepMs / 1000) continue
                val edge = minOf(positionInBurst, rate * beepMs / 1000 - 1 - positionInBurst)
                val ramp = minOf(1.0, edge / (rate * 0.005))
                tone[i] = (12000.0 * ramp * kotlin.math.sin(2.0 * Math.PI * 880.0 * positionInBurst / rate)).toInt().toShort()
            }
            track.play()
            val written = track.write(tone, 0, tone.size, AudioTrack.WRITE_BLOCKING)
            Thread.sleep(totalMs.toLong() + 200L)
            val routed = track.routedDevice?.let { "${it.productName}/type=${it.type}" } ?: "none"
            return "CALL_INCALL_MUSIC_TX: wrote $written/${tone.size} samples; route=$routed; $uplinkDetail; $details"
        } catch (e: Exception) {
            Log.e(TAG, "Uplink tone failed", e)
            return "CALL_TX: ${e.javaClass.simpleName}: ${e.cause?.message ?: e.message}"
        } finally {
            try { track?.stop() } catch (_: Exception) {}
            track?.release()
        }
    }

    override fun captureFiveSeconds(): String {
        val uid = Os.getuid()
        if (uid != 2000) return "Unexpected service UID: $uid (expected shell UID 2000)"
        try {
            val audioManager = shellContext.getSystemService(AudioManager::class.java)
                ?: return "CALL_REDIRECT: AudioManager unavailable"
            if (!isPstnInterceptable(audioManager)) return "CALL_REDIRECT: unsupported; mode=${audioManager.mode}"
            val rate = 16_000
            val record = createDownlinkRecord(rate)
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                record.release()
                return "CALL_REDIRECT: AudioRecord state=${record.state}"
            }
            return captureRecord(record, "CALL_REDIRECT_VOICE_DOWNLINK", uid)
        } catch (e: Exception) {
            Log.e(TAG, "Call-redirection capture failed", e)
            return "CALL_REDIRECT: ${e.javaClass.simpleName}: ${e.cause?.message ?: e.message}"
        }
    }

    private fun captureRecord(record: AudioRecord, source: String, uid: Int): String {
        val output = File("/data/local/tmp/voicecall.pcm")
        var samples = 0L
        var sumSquares = 0.0
        var peak = 0
        val buffer = ShortArray(1024)
        try {
            FileOutputStream(output, false).use { stream ->
                record.startRecording()
                if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    return "$source did not enter recording state"
                }
                val deadline = System.nanoTime() + 5_000_000_000L
                while (System.nanoTime() < deadline) {
                    val count = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
                    if (count < 0) return "$source read failed: $count"
                    for (i in 0 until count) {
                        val sample = buffer[i].toInt()
                        peak = maxOf(peak, kotlin.math.abs(sample))
                        sumSquares += sample.toDouble() * sample
                        stream.write(sample and 0xff)
                        stream.write((sample shr 8) and 0xff)
                    }
                    samples += count
                }
                stream.fd.sync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "$source capture failed", e)
            return "$source ${e.javaClass.simpleName}: ${e.message}"
        } finally {
            try { record.stop() } catch (_: Exception) {}
            record.release()
        }
        val rms = if (samples == 0L) 0.0 else sqrt(sumSquares / samples)
        return "uid=$uid source=$source samples=$samples bytes=${output.length()} peak=$peak rms=${"%.2f".format(rms)} file=${output.absolutePath}"
    }

    // ---- Plumbing ----

    private fun exec(vararg command: String): String = try {
        val process = ProcessBuilder(*command).redirectErrorStream(true).start()
        val text = process.inputStream.bufferedReader().readText()
        process.waitFor(5, TimeUnit.SECONDS)
        text
    } catch (e: Exception) {
        Log.e(TAG, "exec ${command.joinToString(" ")} failed", e)
        ""
    }

    /** The real com.android.shell package context, so UID 2000 and package attribution agree. */
    private fun createShellPackageContext(): Context {
        val activityThreadClass = Class.forName("android.app.ActivityThread")
        val thread = activityThreadClass.getDeclaredMethod("currentActivityThread")
            .apply { isAccessible = true }
            .invoke(null) ?: activityThreadClass.getDeclaredMethod("systemMain")
            .apply { isAccessible = true }
            .invoke(null)
        val systemContext = activityThreadClass.getDeclaredMethod("getSystemContext")
            .apply { isAccessible = true }
            .invoke(thread) as Context
        val shellPackageContext = systemContext.createPackageContext("com.android.shell", 0)
        return object : ContextWrapper(shellPackageContext) {
            override fun getPackageName() = "com.android.shell"
            override fun getOpPackageName() = "com.android.shell"
            override fun getAttributionSource(): AttributionSource =
                AttributionSource.Builder(Os.getuid())
                    .setPackageName("com.android.shell")
                    .build()
        }
    }

    override fun destroy() {
        stopCallAudio()
        System.exit(0)
    }

    companion object {
        private const val TAG = "VoiceCallProbe"
    }
}
