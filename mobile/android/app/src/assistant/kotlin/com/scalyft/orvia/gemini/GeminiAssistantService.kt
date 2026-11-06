package com.scalyft.orvia.gemini

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Foreground service (microphone type) that owns a [GeminiLiveSession]. */
class GeminiAssistantService : Service() {

    companion object {
        const val ACTION_START = "com.scalyft.orvia.gemini.TALK_START"
        const val ACTION_STOP = "com.scalyft.orvia.gemini.TALK_STOP"
        const val CHANNEL_ID = "gemini_assistant"
        const val NOTIF_ID = 2001
        var running = false
            private set
    }

    private var session: GeminiLiveSession? = null
    private var callAudioBridge: IVoiceCallProbe? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            else -> {
                val binder = intent?.extras?.getBinder(GeminiPhoneChannel.EXTRA_AUDIO_BRIDGE)
                callAudioBridge = binder?.let { IVoiceCallProbe.Stub.asInterface(it) }
                // In a call the audio comes through Shizuku, not the mic, so it must not claim the
                // microphone type: on Android 14+ that throws without the mic permission.
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        val type = if (callAudioBridge != null) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                            else ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                        startForeground(NOTIF_ID, notification(), type)
                    } else {
                        startForeground(NOTIF_ID, notification())
                    }
                } catch (e: Exception) {
                    android.util.Log.e("GeminiPhone", "Talk now could not start", e)
                    stopSelf()
                    return START_NOT_STICKY
                }
                session?.stop()
                session = GeminiLiveSession(this, callAudioBridge).also { it.start() }
                running = true
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        session?.stop()
        session = null
        try { callAudioBridge?.stopCallAudio() } catch (_: Exception) {}
        callAudioBridge = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Gemini Assistant", NotificationManager.IMPORTANCE_LOW)
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Gemini Assistant")
            .setContentText("Listening")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }
}
