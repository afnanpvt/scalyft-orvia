import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/log.dart';
import '../data/orvia_api.dart';
import '../telephony/forwarding_state.dart';

/// A random id for this install, created once. It names the install on the
/// server (push token, forwarding summary). It is not tied to the hardware or
/// to the person, and a reinstall gets a new one.
abstract final class Installation {
  static const _key = 'installation.id.v1';

  static Future<String> id(SharedPreferences prefs, {Random? random}) async {
    final existing = prefs.getString(_key);
    if (existing != null && RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(existing)) return existing;
    final r = random ?? Random.secure();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    final fresh = List.generate(32, (_) => alphabet[r.nextInt(alphabet.length)]).join();
    await prefs.setString(_key, fresh);
    return fresh;
  }
}

/// Tells the backend this install exists and what its forwarding looks like.
/// Best effort: failing to register must never get in the owner's way.
class DeviceRegistrar {
  DeviceRegistrar({
    required this._api,
    required this._installationId,
    required this._appVersion,
    this._pushToken,
  });

  final OrviaApi _api;
  final String _installationId;
  final String _appVersion;
  final Future<String?> Function()? _pushToken;

  Future<void> sync(ForwardingState forwarding) async {
    try {
      final token = await _pushToken?.call();
      await _api.registerDevice(
        installationId: _installationId,
        pushToken: token,
        appVersion: _appVersion,
        forwarding: forwarding.toServerSummary(),
      );
    } catch (e) {
      Log.w('device registration failed ${e.runtimeType}');
    }
  }

  Future<void> unregister() async {
    try {
      await _api.unregisterDevice(_installationId);
    } catch (e) {
      Log.w('device unregister failed ${e.runtimeType}');
    }
  }
}
