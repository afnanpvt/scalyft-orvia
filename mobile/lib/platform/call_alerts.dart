import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/log.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';
import 'notifier.dart';
import 'permissions.dart';

/// Turns "a call finished" into one notification, exactly once per call.
///
/// Which calls were already announced is remembered by id rather than by a
/// timestamp: a call is created when it starts and finishes later, so a
/// "newer than" cursor would either skip it or announce it twice.
class CallAlerts {
  CallAlerts({
    required this._api,
    required this._notifier,
    required this._prefs,
    required String userId,
    DateTime Function()? now,
  })  : _key = 'alerts.seen.v1.$userId',
        _enabledKey = 'alerts.enabled.$userId',
        _askedKey = 'alerts.asked.$userId',
        _now = now ?? DateTime.now;

  static const _maxRemembered = 200;
  static const _window = Duration(hours: 24);

  final OrviaApi _api;
  final Notifier _notifier;
  final SharedPreferences _prefs;
  final String _key;
  final String _enabledKey;
  final String _askedKey;
  final DateTime Function() _now;

  bool _busy = false;

  bool get enabled => _prefs.getBool(_enabledKey) ?? true;
  Future<void> setEnabled(bool value) => _prefs.setBool(_enabledKey, value);

  /// Alerts are on by default, but Android 13+ shows nothing until the owner
  /// allows notifications. Asks once, the first time this owner is signed in
  /// on this phone; after that the Settings switch is the way back.
  Future<bool> askPermissionOnce(PermissionGateway permissions) async {
    if (await permissions.notificationsGranted()) return true;
    if (!enabled || (_prefs.getBool(_askedKey) ?? false)) return false;
    await _prefs.setBool(_askedKey, true);
    return permissions.requestNotifications();
  }

  Set<String> _seen() {
    final raw = _prefs.getString(_key);
    if (raw == null) return {};
    try {
      return (jsonDecode(raw) as List<dynamic>).whereType<String>().toSet();
    } catch (_) {
      return {};
    }
  }

  Future<void> _remember(Set<String> ids) {
    final list = ids.toList();
    final trimmed = list.length > _maxRemembered ? list.sublist(list.length - _maxRemembered) : list;
    return _prefs.setString(_key, jsonEncode(trimmed));
  }

  /// Announces finished calls not yet announced. The first run on a device
  /// only records what already exists, so installing the app never replays a
  /// backlog. Returns how many notifications were shown.
  Future<int> check() async {
    if (_busy) return 0;
    _busy = true;
    try {
      final firstRun = !_prefs.containsKey(_key);
      final calls = await _api.callsSince(_now().subtract(_window));
      final seen = _seen();
      var shown = 0;

      final fresh = calls.where((c) => c.status != CallStatus.inProgress && !seen.contains(c.id)).toList()
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

      for (final call in fresh) {
        if (!firstRun && enabled) {
          await _notifier.showCallHandled(call, now: _now());
          shown++;
        }
        seen.add(call.id);
      }
      if (fresh.isNotEmpty || firstRun) await _remember(seen);
      return shown;
    } catch (e) {
      Log.w('call alert check failed ${e.runtimeType}');
      return 0;
    } finally {
      _busy = false;
    }
  }

  Future<void> forget() => _prefs.remove(_key);
}
