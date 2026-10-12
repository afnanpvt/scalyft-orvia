import 'package:flutter/foundation.dart';

/// Logging that cannot leak what matters. Release builds print nothing; debug
/// builds print with phone numbers, emails and tokens redacted.
abstract final class Log {
  static void d(String message) => _emit('D', message);
  static void w(String message) => _emit('W', message);
  static void e(String message, [Object? error]) =>
      _emit('E', error == null ? message : '$message: ${error.runtimeType}');

  static void _emit(String level, String message) {
    if (kReleaseMode) return;
    debugPrint('[orvia $level] ${redact(message)}');
  }

  static final _jwt = RegExp(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}');
  static final _bearer = RegExp(r'(bearer\s+)[A-Za-z0-9._\-]{12,}', caseSensitive: false);
  static final _email = RegExp(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}');
  static final _longDigits = RegExp(r'\+?\d[\d\s().\-]{7,}\d');
  static final _skKey = RegExp(r'\b(sb_(?:publishable|secret)_|sk-)[A-Za-z0-9_\-]{8,}');

  /// Replaces tokens, emails and phone-number-like runs.
  static String redact(String input) {
    var s = input;
    s = s.replaceAll(_jwt, '«token»');
    s = s.replaceAllMapped(_bearer, (m) => '${m[1]}«token»');
    s = s.replaceAll(_skKey, '«key»');
    s = s.replaceAll(_email, '«email»');
    s = s.replaceAllMapped(_longDigits, (m) {
      final digits = m[0]!.replaceAll(RegExp(r'\D'), '');
      return digits.length >= 7 ? '«number»' : m[0]!;
    });
    return s;
  }
}
