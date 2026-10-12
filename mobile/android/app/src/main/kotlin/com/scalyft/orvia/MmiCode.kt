package com.scalyft.orvia

/**
 * The only strings the native layer will hand to the telephony stack.
 *
 * Call forwarding is configured with GSM supplementary-service codes
 * (3GPP TS 22.030), e.g. `**21*+919876543210#` or `##002#`. A valid code
 * starts with `*` or `#`, ends with `#`, and contains only `* # 0-9 +`.
 *
 * Anything else (a plain phone number, letters, spaces, commas that would be
 * dialed as pauses) is refused, so a bug or a hostile caller on the Dart side
 * can never turn this into "place an arbitrary call".
 */
object MmiCode {
    private const val MAX_LENGTH = 64
    private val SHAPE = Regex("^[*#][*#0-9+]*#$")

    fun isValid(code: String?): Boolean {
        if (code == null || code.length < 3 || code.length > MAX_LENGTH) return false
        return SHAPE.matches(code)
    }
}
