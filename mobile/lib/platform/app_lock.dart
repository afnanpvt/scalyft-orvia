import 'package:flutter/widgets.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/log.dart';
import '../core/safe_notifier.dart';

/// The phone's own screen-lock check (PIN, pattern, fingerprint, face).
abstract class DeviceAuth {
  /// True when the phone has a screen lock set up at all.
  Future<bool> isSupported();

  /// Shows the system prompt. False on cancel or failure.
  Future<bool> authenticate({required String reason});
}

class LocalAuthDeviceAuth implements DeviceAuth {
  LocalAuthDeviceAuth([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> isSupported() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> authenticate({required String reason}) async {
    try {
      // Biometric or the phone's PIN/pattern; the owner's own lock decides.
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } catch (e) {
      Log.w('device auth error ${e.runtimeType}');
      return false;
    }
  }
}

enum LockTimeout {
  immediately(Duration.zero, 'Right away'),
  thirtySeconds(Duration(seconds: 30), 'After 30 seconds'),
  oneMinute(Duration(minutes: 1), 'After 1 minute'),
  fiveMinutes(Duration(minutes: 5), 'After 5 minutes');

  const LockTimeout(this.after, this.label);
  final Duration after;
  final String label;
}

/// Locks the app behind the phone's screen lock after it has been in the
/// background for a while. Call data includes names, numbers and what people
/// said on the phone, so a stolen unlocked phone should not open it.
class AppLockController extends ChangeNotifier with SafeNotifier, WidgetsBindingObserver {
  AppLockController({
    required this._prefs,
    required this._auth,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  static const _kEnabled = 'applock.enabled';
  static const _kTimeout = 'applock.timeout';

  final SharedPreferences _prefs;
  final DeviceAuth _auth;
  final DateTime Function() _now;

  bool enabled = false;
  bool supported = false;
  LockTimeout timeout = LockTimeout.thirtySeconds;

  /// True while the lock screen should cover the app.
  bool locked = false;
  bool authenticating = false;

  DateTime? _backgroundedAt;
  int _suspended = 0;

  /// Reads settings and, on a fresh install with a screen lock, turns the lock
  /// on by default. Starts locked when it is enabled.
  Future<void> init() async {
    supported = await _auth.isSupported();
    final stored = _prefs.getBool(_kEnabled);
    enabled = supported && (stored ?? true);
    timeout = LockTimeout.values.firstWhere(
      (t) => t.name == _prefs.getString(_kTimeout),
      orElse: () => LockTimeout.thirtySeconds,
    );
    locked = enabled;
    notifyListeners();
  }

  void attach() => WidgetsBinding.instance.addObserver(this);
  void detach() => WidgetsBinding.instance.removeObserver(this);

  @override
  void dispose() {
    detach();
    super.dispose();
  }

  Future<bool> unlock() async {
    if (!locked) return true;
    if (authenticating) return false;
    authenticating = true;
    notifyListeners();
    try {
      final ok = await _auth.authenticate(reason: 'Unlock Orvia');
      if (ok) {
        locked = false;
        _backgroundedAt = null;
      }
      return ok;
    } finally {
      authenticating = false;
      notifyListeners();
    }
  }

  /// Turning the lock on or off needs a successful check, so a borrowed
  /// unlocked phone cannot quietly disable it.
  Future<bool> setEnabled(bool value) async {
    if (value == enabled) return true;
    if (value && !supported) return false;
    final ok = await _auth.authenticate(reason: value ? 'Turn on app lock' : 'Turn off app lock');
    if (!ok) return false;
    enabled = value;
    locked = false;
    await _prefs.setBool(_kEnabled, value);
    notifyListeners();
    return true;
  }

  Future<void> setTimeout(LockTimeout value) async {
    timeout = value;
    await _prefs.setString(_kTimeout, value.name);
    notifyListeners();
  }

  /// Runs [action] without the lock reacting to the app being paused. System
  /// dialogs (the phone permission prompt, the dialer) pause the app too.
  Future<T> whileAway<T>(Future<T> Function() action) async {
    _suspended++;
    try {
      return await action();
    } finally {
      _suspended--;
      _backgroundedAt = null;
    }
  }

  /// A fresh password sign-in already proved who is holding the phone.
  void unlockAfterSignIn() {
    if (!locked) return;
    locked = false;
    _backgroundedAt = null;
    notifyListeners();
  }

  /// Locks immediately, e.g. on sign-out.
  void lockNow() {
    if (!enabled) return;
    locked = true;
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!enabled || _suspended > 0 || authenticating) return;
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _backgroundedAt ??= _now();
      case AppLifecycleState.resumed:
        final since = _backgroundedAt;
        _backgroundedAt = null;
        if (since != null && _now().difference(since) >= timeout.after) {
          locked = true;
          notifyListeners();
        }
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }
}
