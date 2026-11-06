package com.scalyft.orvia.gemini;

import com.scalyft.orvia.gemini.IVoiceCallAudioCallback;

interface IVoiceCallProbe {
    String captureFiveSeconds() = 1;
    String injectShortTone() = 2;
    String startCallAudio(IVoiceCallAudioCallback callback) = 3;
    void writeCallAudio(in byte[] pcm16) = 4;
    void stopCallAudio() = 5;
    /** 0 idle, 1 ringing, 2 off hook (TelephonyManager.CALL_STATE_*). */
    int callState() = 6;
    /** Best effort: the number of the ringing or active call, or empty. */
    String currentCallNumber() = 7;
    boolean answerRingingCall() = 8;
    boolean endCall() = 9;
    /** Number of the newest call-log entry dated after sinceMillis, or empty. */
    String callLogNumberSince(long sinceMillis) = 10;
    /** Drops queued uplink audio, for when the caller interrupts. */
    void flushCallAudio() = 11;
    /** Dials a number (outreach). False if the number is not dial-able. */
    boolean placeCall(String number) = 12;
    /** PreciseCallState of the foreground call: 1 active, 3 dialing, 4 alerting, 0 idle, -1 unknown. */
    int foregroundCallState() = 13;
    void destroy() = 16777114;
}
