import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/phone.dart';
import '../core/safe_notifier.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';

/// The three AI settings an owner can change from the phone.
class SettingsController extends ChangeNotifier with SafeNotifier {
  SettingsController(this._api);

  final OrviaApi _api;

  BusinessSettings? settings;
  bool loading = false;
  bool saving = false;
  String? error;

  static const maxGreeting = 500;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      settings = await _api.settings();
    } catch (e) {
      error = friendlyError(e);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Null when fine, otherwise a sentence for the form field.
  static String? validateGreeting(String? v) {
    if ((v ?? '').trim().length > maxGreeting) return 'Keep it under $maxGreeting characters.';
    return null;
  }

  /// Empty is allowed (clears the setting).
  static String? validatePhone(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    if (Phone.toE164(s) == null) return 'Use the full number with country code, like +91 98765 43210.';
    return null;
  }

  /// Sends only what the owner changed. A value saved earlier from the
  /// dashboard in some other format is left alone unless they edit it, so
  /// saving never clears or rewrites a setting by accident.
  Future<bool> save({required String greeting, required String transferNumber, required String notificationPhone}) async {
    String orig(String? v) => (v ?? '').trim();
    final current = settings;
    final patch = <String, String?>{};

    if (greeting.trim() != orig(current?.greeting)) {
      final problem = validateGreeting(greeting);
      if (problem != null) return _reject(problem);
      patch['greeting'] = greeting.trim().isEmpty ? null : greeting.trim();
    }
    if (transferNumber.trim() != orig(current?.transferNumber)) {
      final problem = validatePhone(transferNumber);
      if (problem != null) return _reject(problem);
      patch['transfer_number'] = Phone.toE164(transferNumber);
    }
    if (notificationPhone.trim() != orig(current?.notificationPhone)) {
      final problem = validatePhone(notificationPhone);
      if (problem != null) return _reject(problem);
      patch['notification_phone'] = Phone.toE164(notificationPhone);
    }
    if (patch.isEmpty) return true;

    saving = true;
    error = null;
    notifyListeners();
    try {
      await _api.patchSettings(patch);
      settings = BusinessSettings(
        greeting: patch.containsKey('greeting') ? patch['greeting'] : current?.greeting,
        transferNumber: patch.containsKey('transfer_number') ? patch['transfer_number'] : current?.transferNumber,
        notificationPhone: patch.containsKey('notification_phone') ? patch['notification_phone'] : current?.notificationPhone,
      );
      return true;
    } catch (e) {
      error = friendlyError(e);
      return false;
    } finally {
      saving = false;
      notifyListeners();
    }
  }

  bool _reject(String message) {
    error = message;
    notifyListeners();
    return false;
  }
}
