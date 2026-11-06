package com.scalyft.orvia.gemini

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import rikka.shizuku.Shizuku
import rikka.shizuku.Shizuku.UserServiceArgs

/** One shared connection to the shell-UID [VoiceCallProbeUserService]. */
object ShizukuBridge {

    /** Bump whenever the AIDL or the service code changes, so Shizuku restarts it. */
    private const val SERVICE_VERSION = 14
    const val PERMISSION_REQUEST_CODE = 4312

    enum class Status { OFFLINE, NO_PERMISSION, READY }

    @Volatile var service: IVoiceCallProbe? = null
        private set

    private val main = Handler(Looper.getMainLooper())
    private var args: UserServiceArgs? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = binder?.takeIf { it.pingBinder() }?.let { IVoiceCallProbe.Stub.asInterface(it) }
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    fun status(): Status = when {
        !Shizuku.pingBinder() -> Status.OFFLINE
        Shizuku.isPreV11() || Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED -> Status.NO_PERMISSION
        else -> Status.READY
    }

    fun requestPermission() {
        if (Shizuku.pingBinder() && Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
            Shizuku.requestPermission(PERMISSION_REQUEST_CODE)
        }
    }

    /**
     * Binds if needed and waits up to [timeoutMs] for the service. Must not be called on
     * the main thread. Null when Shizuku is not running or not granted.
     */
    fun await(context: Context, timeoutMs: Long = 10_000): IVoiceCallProbe? {
        service?.let { if (it.asBinder().isBinderAlive) return it }
        service = null
        if (status() != Status.READY) return null
        main.post {
            try {
                val a = args ?: UserServiceArgs(ComponentName(context.applicationContext, VoiceCallProbeUserService::class.java))
                    .processNameSuffix("voice_call_probe")
                    .tag("voice-call-probe")
                    .daemon(true)
                    .version(SERVICE_VERSION)
                    .also { args = it }
                Shizuku.bindUserService(a, connection)
            } catch (_: Exception) {}
        }
        val until = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < until) {
            service?.let { return it }
            Thread.sleep(100)
        }
        return service
    }
}
