# Flutter's own consumer rules cover the engine and plugins. Keep only what we
# reach by reflection-free name from the Dart side (nothing today), so every
# class here can be renamed and shrunk.
#
# local_auth and flutter_secure_storage ship their own consumer rules.

# Assistant flavor: Shizuku instantiates the UserService by class name.
-keep class com.scalyft.orvia.gemini.** { *; }

# OkHttp (used by Gemini phone assistant for WebSocket)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
