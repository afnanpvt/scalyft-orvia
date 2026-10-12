import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/env.dart';
import 'data/auth_repository.dart';
import 'data/orvia_api.dart';
import 'data/secure_session_storage.dart';
import 'data/supabase_orvia_api.dart';
import 'platform/app_lock.dart';
import 'platform/notifier.dart';
import 'platform/permissions.dart';
import 'telephony/method_channel_gateway.dart';
import 'telephony/telephony_gateway.dart';

class _NoDeviceAuth implements DeviceAuth {
  const _NoDeviceAuth();

  @override
  Future<bool> isSupported() async => false;

  @override
  Future<bool> authenticate({required String reason}) async => true;
}

/// Everything the app needs from the outside world. The real app builds one
/// with [AppDependencies.production]; tests build one from fakes. Nothing
/// below this line reaches for a global.
@immutable
class AppDependencies {
  const AppDependencies({
    required this.auth,
    required this.api,
    required this.telephony,
    required this.permissions,
    required this.notifier,
    required this.deviceAuth,
    required this.prefs,
    required this.appVersion,
    this.now = DateTime.now,
    this.pushToken,
    this.blockScreenshots = false,
  });

  final AuthRepository auth;
  final OrviaApi api;
  final TelephonyGateway telephony;
  final PermissionGateway permissions;
  final Notifier notifier;
  final DeviceAuth deviceAuth;
  final SharedPreferences prefs;
  final String appVersion;
  final DateTime Function() now;

  /// Returns this install's push token, or null until push is configured.
  final Future<String?> Function()? pushToken;

  /// Hide the app from screenshots and the recents screen. On in release.
  final bool blockScreenshots;

  static Future<AppDependencies> production(Env env) async {
    env.requireValid();

    await Supabase.initialize(
      url: env.supabaseUrl.trim(),
      publishableKey: env.supabaseAnonKey.trim(),
      authOptions: FlutterAuthClientOptions(
        localStorage: SecureSessionStorage(),
        // No deep links: a link must never be able to hand the app a session.
        detectSessionInUri: false,
      ),
    );
    final client = Supabase.instance.client;
    final prefs = await SharedPreferences.getInstance();
    final info = await PackageInfo.fromPlatform();

    return AppDependencies(
      auth: SupabaseAuthRepository(client),
      api: SupabaseOrviaApi(client),
      telephony: MethodChannelTelephonyGateway(),
      permissions: const SystemPermissionGateway(),
      notifier: LocalNotifier(),
      // E2E_NO_APP_LOCK lets automated test builds run without a biometric
      // prompt. It is ignored in release builds.
      deviceAuth: (const bool.fromEnvironment('E2E_NO_APP_LOCK') && !kReleaseMode)
          ? const _NoDeviceAuth()
          : LocalAuthDeviceAuth(),
      prefs: prefs,
      appVersion: '${info.version}+${info.buildNumber}',
      blockScreenshots: kReleaseMode,
    );
  }
}
