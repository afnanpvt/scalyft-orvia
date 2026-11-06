package com.scalyft.orvia

import android.app.Activity
import com.scalyft.orvia.gemini.GeminiPhoneChannel
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** Assistant flavor: the call agent's method channel. */
object FlavorChannels {
    fun register(activity: Activity, messenger: BinaryMessenger) {
        MethodChannel(messenger, GeminiPhoneChannel.NAME)
            .setMethodCallHandler(GeminiPhoneChannel(activity))
    }
}
