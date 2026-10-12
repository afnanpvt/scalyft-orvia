package com.scalyft.orvia

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.view.WindowManager
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * The phone-side half of Orvia: send the carrier codes that turn call
 * forwarding on and off, and report what the carrier answered.
 *
 * Deliberately small. It does not observe calls, read the call log or touch
 * audio. Every code is validated by [MmiCode] before it goes anywhere.
 */
class TelephonyChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {

    companion object {
        const val NAME = "com.scalyft.orvia/telephony"
        const val USSD_TIMEOUT_MS = 30_000L
    }

    private val main = Handler(Looper.getMainLooper())

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "capabilities" -> result.success(capabilities())
            "listSims" -> result.success(listSims())
            "sendUssd" -> sendUssd(call, result)
            "dialCode" -> dialCode(call, result)
            "setSecureWindow" -> {
                val enabled = call.argument<Boolean>("enabled") ?: false
                activity.runOnUiThread {
                    if (enabled) {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                }
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun granted(permission: String) =
        activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun telephonyManager(): TelephonyManager? =
        activity.getSystemService(TelephonyManager::class.java)

    private fun capabilities(): Map<String, Any?> {
        val hasTelephony = activity.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
        val tm = telephonyManager()
        return mapOf(
            "sdkInt" to Build.VERSION.SDK_INT,
            "hasTelephony" to hasTelephony,
            "canSendUssd" to (hasTelephony && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O),
            "callPhoneGranted" to granted(Manifest.permission.CALL_PHONE),
            "readPhoneStateGranted" to granted(Manifest.permission.READ_PHONE_STATE),
            "simReady" to (tm?.simState == TelephonyManager.SIM_STATE_READY),
            "operatorName" to (tm?.networkOperatorName?.takeIf { it.isNotBlank() }),
        )
    }

    /** Needs READ_PHONE_STATE; without it the list is empty and the app uses the default SIM. */
    private fun listSims(): List<Map<String, Any?>> {
        if (!granted(Manifest.permission.READ_PHONE_STATE)) return emptyList()
        return try {
            val sm = activity.getSystemService(SubscriptionManager::class.java)
            val defaultVoice = SubscriptionManager.getDefaultVoiceSubscriptionId()
            sm?.activeSubscriptionInfoList.orEmpty().map {
                mapOf(
                    "subscriptionId" to it.subscriptionId,
                    "slotIndex" to it.simSlotIndex,
                    "displayName" to it.displayName?.toString(),
                    "carrierName" to it.carrierName?.toString(),
                    "isDefaultVoice" to (it.subscriptionId == defaultVoice),
                )
            }
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    /**
     * Sends [code] as a USSD request and waits for the carrier's answer.
     * Replies exactly once: { status: ok | failed | timeout | no_permission |
     * unsupported | invalid, response?, failureCode? }.
     */
    private fun sendUssd(call: MethodCall, result: MethodChannel.Result) {
        val code = call.argument<String>("code")
        if (!MmiCode.isValid(code)) {
            result.success(mapOf("status" to "invalid"))
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.success(mapOf("status" to "unsupported"))
            return
        }
        if (!granted(Manifest.permission.CALL_PHONE)) {
            result.success(mapOf("status" to "no_permission"))
            return
        }

        var replied = false
        fun reply(payload: Map<String, Any?>) {
            main.post {
                if (replied) return@post
                replied = true
                result.success(payload)
            }
        }

        val subId = call.argument<Int>("subscriptionId")
        val base = telephonyManager()
        if (base == null) {
            reply(mapOf("status" to "unsupported"))
            return
        }
        val tm = if (subId != null && subId >= 0) base.createForSubscriptionId(subId) else base

        val timeout = Runnable { reply(mapOf("status" to "timeout")) }
        main.postDelayed(timeout, USSD_TIMEOUT_MS)

        try {
            tm.sendUssdRequest(
                code!!,
                object : TelephonyManager.UssdResponseCallback() {
                    override fun onReceiveUssdResponse(
                        telephonyManager: TelephonyManager,
                        request: String,
                        response: CharSequence,
                    ) {
                        main.removeCallbacks(timeout)
                        reply(mapOf("status" to "ok", "response" to response.toString()))
                    }

                    override fun onReceiveUssdResponseFailed(
                        telephonyManager: TelephonyManager,
                        request: String,
                        failureCode: Int,
                    ) {
                        main.removeCallbacks(timeout)
                        reply(mapOf("status" to "failed", "failureCode" to failureCode))
                    }
                },
                main,
            )
        } catch (e: SecurityException) {
            main.removeCallbacks(timeout)
            reply(mapOf("status" to "no_permission"))
        } catch (e: Exception) {
            main.removeCallbacks(timeout)
            reply(mapOf("status" to "failed", "failureCode" to -1))
        }
    }

    /**
     * Hands the code to the Phone app. Needed on 4G/5G voice (IMS) networks,
     * where sendUssdRequest cannot carry call forwarding codes but the Phone
     * app can.
     *  - auto = false: opens the dialer with the code typed in; the owner taps call.
     *  - auto = true:  sends it directly (needs CALL_PHONE); the Phone app shows
     *                  the carrier's answer in its own dialog.
     * subscriptionId picks the SIM where Android allows it (API 30+).
     */
    private fun dialCode(call: MethodCall, result: MethodChannel.Result) {
        val code = call.argument<String>("code")
        if (!MmiCode.isValid(code)) {
            result.success(false)
            return
        }
        val auto = call.argument<Boolean>("auto") ?: false
        val subId = call.argument<Int>("subscriptionId")
        val uri = Uri.fromParts("tel", code, null) // encodes '#' as %23
        val action = if (auto && granted(Manifest.permission.CALL_PHONE)) Intent.ACTION_CALL else Intent.ACTION_DIAL
        val intent = Intent(action, uri)
        phoneAccountFor(subId)?.let { intent.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it) }
        try {
            activity.startActivity(intent)
            result.success(true)
        } catch (e: Exception) {
            result.success(false)
        }
    }

    /** The calling account for a SIM, or null to let Android choose. */
    private fun phoneAccountFor(subId: Int?): PhoneAccountHandle? {
        if (subId == null || subId < 0 || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        if (!granted(Manifest.permission.READ_PHONE_STATE)) return null
        val telecom = activity.getSystemService(TelecomManager::class.java) ?: return null
        val tm = telephonyManager() ?: return null
        return try {
            telecom.callCapablePhoneAccounts.firstOrNull { tm.getSubscriptionId(it) == subId }
        } catch (e: SecurityException) {
            null
        }
    }
}
