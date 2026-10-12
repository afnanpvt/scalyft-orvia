/// Tolerant JSON readers. The server's rows can carry nulls or newer columns;
/// a model must never throw because of a field it does not need.
typedef Json = Map<String, dynamic>;

String? str(Object? v) => v is String ? v : v?.toString();

int? integer(Object? v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v);
  return null;
}

bool boolean(Object? v, {bool fallback = false}) {
  if (v is bool) return v;
  if (v is String) return v == 'true';
  return fallback;
}

DateTime? time(Object? v) {
  if (v is! String || v.isEmpty) return null;
  return DateTime.tryParse(v)?.toLocal();
}

Json jsonMap(Object? v) {
  if (v is Map) return v.map((k, value) => MapEntry(k.toString(), value));
  return <String, dynamic>{};
}

/// Maps a server string onto an enum value, or [fallback] when the server sent
/// something this build does not know about yet.
T enumByName<T extends Enum>(List<T> values, Object? raw, T fallback, {Map<String, T> aliases = const {}}) {
  final s = raw is String ? raw : '';
  if (aliases.containsKey(s)) return aliases[s]!;
  for (final v in values) {
    if (v.name == s) return v;
  }
  return fallback;
}
