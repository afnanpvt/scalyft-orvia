import 'package:intl/intl.dart';

/// Human-readable time and duration strings. Every function takes `now`
/// explicitly so tests do not depend on the clock.
abstract final class Fmt {
  /// "just now", "5 min ago", "3 h ago", "Yesterday", "12 Oct".
  static String ago(DateTime then, {required DateTime now}) {
    final d = now.difference(then);
    if (d.isNegative || d.inSeconds < 45) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes < 1 ? 1 : d.inMinutes} min ago';
    if (d.inHours < 24 && _sameDay(then, now)) return '${d.inHours} h ago';
    if (_sameDay(then, now.subtract(const Duration(days: 1)))) return 'Yesterday';
    if (d.inDays < 7) return DateFormat('EEEE').format(then);
    return DateFormat(then.year == now.year ? 'd MMM' : 'd MMM y').format(then);
  }

  /// "10:30 am"
  static String clock(DateTime t) => DateFormat('h:mm a').format(t).toLowerCase();

  /// "Today, 10:30 am" / "Tomorrow, 10:30 am" / "Mon 12 Oct, 10:30 am"
  static String slot(DateTime t, {required DateTime now}) {
    if (_sameDay(t, now)) return 'Today, ${clock(t)}';
    if (_sameDay(t, now.add(const Duration(days: 1)))) return 'Tomorrow, ${clock(t)}';
    if (_sameDay(t, now.subtract(const Duration(days: 1)))) return 'Yesterday, ${clock(t)}';
    final fmt = t.year == now.year ? 'EEE d MMM' : 'EEE d MMM y';
    return '${DateFormat(fmt).format(t)}, ${clock(t)}';
  }

  /// 134 -> "2m 14s", 45 -> "45s", 3700 -> "1h 1m".
  static String duration(int? seconds) {
    if (seconds == null || seconds < 0) return '-';
    if (seconds < 60) return '${seconds}s';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    if (h > 0) return '${h}h ${m}m';
    return s == 0 ? '${m}m' : '${m}m ${s}s';
  }

  /// Talk time left, as the owner thinks of it: "42 min", "1 h 05 min".
  static String minutesLeft(int seconds) {
    if (seconds <= 0) return '0 min';
    final m = seconds ~/ 60;
    if (m < 60) return '$m min';
    return '${m ~/ 60} h ${(m % 60).toString().padLeft(2, '0')} min';
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
