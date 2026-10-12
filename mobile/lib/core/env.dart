import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Build-time configuration, supplied with
/// `--dart-define-from-file=env.json` (see env.example.json). Nothing here is
/// a secret: the anon key is public by design and is only useful because the
/// database enforces row-level security.
@immutable
class Env {
  const Env({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    this.allowInsecureLocal = false,
    this.isRelease = kReleaseMode,
  });

  factory Env.fromEnvironment() => const Env(
        supabaseUrl: String.fromEnvironment('SUPABASE_URL'),
        supabaseAnonKey: String.fromEnvironment('SUPABASE_ANON_KEY'),
        allowInsecureLocal: bool.fromEnvironment('ALLOW_INSECURE_LOCAL'),
      );

  final String supabaseUrl;
  final String supabaseAnonKey;

  /// Lets a debug build talk plain HTTP to the emulator's host loopback, for
  /// the local end-to-end backend. Ignored in release builds.
  final bool allowInsecureLocal;
  final bool isRelease;

  static const _loopbackHosts = {'10.0.2.2', 'localhost', '127.0.0.1'};

  /// Every problem with this configuration, empty when it is safe to start.
  List<String> problems() {
    final out = <String>[];

    final uri = Uri.tryParse(supabaseUrl.trim());
    if (supabaseUrl.trim().isEmpty) {
      out.add('SUPABASE_URL is not set.');
    } else if (uri == null || !uri.hasAuthority || uri.host.isEmpty) {
      out.add('SUPABASE_URL is not a valid URL.');
    } else if (uri.scheme == 'https') {
      // fine
    } else if (uri.scheme == 'http' &&
        allowInsecureLocal &&
        !isRelease &&
        _loopbackHosts.contains(uri.host)) {
      // debug-only loopback exception
    } else {
      out.add('SUPABASE_URL must use https.');
    }

    final key = supabaseAnonKey.trim();
    if (key.isEmpty) {
      out.add('SUPABASE_ANON_KEY is not set.');
    } else if (looksLikeSecretKey(key)) {
      out.add(
        'SUPABASE_ANON_KEY holds a secret/service-role key. Never put one in '
        'an app: anyone can unpack an APK. Use the anon (publishable) key.',
      );
    }
    return out;
  }

  /// Throws a [StateError] naming every problem, so a misconfigured build
  /// fails loudly at launch instead of shipping a hole.
  void requireValid() {
    final p = problems();
    if (p.isNotEmpty) {
      throw StateError('Invalid app configuration:\n- ${p.join('\n- ')}');
    }
  }

  /// True for the new-style `sb_secret_...` keys and for legacy JWT keys whose
  /// role claim is `service_role`.
  static bool looksLikeSecretKey(String key) {
    if (key.startsWith('sb_secret_')) return true;
    final parts = key.split('.');
    if (parts.length != 3) return false;
    try {
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(payload);
      return json is Map && json['role'] == 'service_role';
    } catch (_) {
      return false;
    }
  }
}
