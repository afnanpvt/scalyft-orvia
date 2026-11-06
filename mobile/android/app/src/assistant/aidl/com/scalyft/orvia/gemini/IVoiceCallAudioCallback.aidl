package com.scalyft.orvia.gemini;

oneway interface IVoiceCallAudioCallback {
    void onPcmChunk(in byte[] pcm16);
    void onError(String message);
}
