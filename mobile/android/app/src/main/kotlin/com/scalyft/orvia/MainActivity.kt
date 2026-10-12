package com.scalyft.orvia

import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity because local_auth shows the biometric prompt as a fragment.
class MainActivity : FlutterFragmentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Ignore taps while another window overlays this one (tapjacking), so
        // an overlay cannot trick the owner into confirming "turn forwarding on".
        window.decorView.filterTouchesWhenObscured = true
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, TelephonyChannel.NAME)
            .setMethodCallHandler(TelephonyChannel(this))
    }
}
