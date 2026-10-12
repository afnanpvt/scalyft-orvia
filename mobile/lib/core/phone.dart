/// Phone number helpers. Numbers matter here for two reasons: the AI line goes
/// into a carrier code that the phone will execute, and caller numbers are
/// personal data that should not end up in logs.
abstract final class Phone {
  /// Canonical E.164 (`+` and 7 to 15 digits, first digit non-zero), or null.
  ///
  /// Accepts spaces, dashes, dots and brackets as separators and a leading `00`
  /// in place of `+`. A number without a country code is ambiguous, so it is
  /// rejected rather than guessed.
  static String? toE164(String? raw) {
    if (raw == null) return null;
    var s = raw.trim();
    if (s.isEmpty || s.length > 32) return null;

    // Only a plain space as a separator: a newline or tab in a number that
    // ends up inside a carrier code is never legitimate.
    if (!RegExp(r'^[0-9+ ().\-]+$').hasMatch(s)) return null;
    s = s.replaceAll(RegExp(r'[ ().\-]'), '');

    if (s.startsWith('00')) {
      s = '+${s.substring(2)}';
    }
    if (!s.startsWith('+')) return null;
    // A '+' anywhere else is malformed.
    if (s.indexOf('+', 1) != -1) return null;
    if (!RegExp(r'^\+[1-9][0-9]{6,14}$').hasMatch(s)) return null;
    return s;
  }

  /// `+91 98765 43210` for Indian mobiles, `+1 (415) 555-0100` for NANP,
  /// otherwise the number with a space after the country code guess.
  static String display(String? raw) {
    final e164 = toE164(raw);
    if (e164 == null) return (raw == null || raw.trim().isEmpty) ? 'Unknown caller' : raw.trim();
    final d = e164.substring(1);
    if (d.startsWith('91') && d.length == 12) {
      return '+91 ${d.substring(2, 7)} ${d.substring(7)}';
    }
    if (d.startsWith('1') && d.length == 11) {
      return '+1 (${d.substring(1, 4)}) ${d.substring(4, 7)}-${d.substring(7)}';
    }
    return e164;
  }

  /// Last four digits only, for logs and notification previews.
  static String mask(String? raw) {
    final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'unknown';
    if (digits.length <= 4) return '••••';
    return '••••${digits.substring(digits.length - 4)}';
  }

  /// Digits for a `tel:` URI. Never interpolate a raw string into a URI.
  static Uri telUri(String raw) {
    final e164 = toE164(raw);
    final digits = e164 ?? raw.replaceAll(RegExp(r'[^0-9+]'), '');
    return Uri(scheme: 'tel', path: digits);
  }
}
