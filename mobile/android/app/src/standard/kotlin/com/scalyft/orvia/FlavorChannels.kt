package com.scalyft.orvia

import android.app.Activity
import io.flutter.plugin.common.BinaryMessenger

/** The public builds have no flavor-only channels. */
object FlavorChannels {
    fun register(activity: Activity, messenger: BinaryMessenger) {}
}
