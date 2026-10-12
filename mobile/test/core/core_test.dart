import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/core/env.dart';
import 'package:orvia/core/format.dart';
import 'package:orvia/core/log.dart';
import 'package:orvia/core/phone.dart';

String _jwt(Map<String, Object?> payload) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'HS256'})}.${b64(payload)}.signature';
}

void main() {
  group('Env', () {
    final anon = _jwt({'role': 'anon'});

    test('accepts https and an anon key', () {
      expect(Env(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: anon, isRelease: true).problems(), isEmpty);
    });

    test('refuses a missing url and key', () {
      final p = const Env(supabaseUrl: '', supabaseAnonKey: '').problems();
      expect(p, hasLength(2));
    });

    test('refuses plain http in release even with the debug flag', () {
      final env = Env(
        supabaseUrl: 'http://10.0.2.2:54321',
        supabaseAnonKey: anon,
        allowInsecureLocal: true,
        isRelease: true,
      );
      expect(env.problems(), contains('SUPABASE_URL must use https.'));
    });

    test('allows loopback http only in debug and only with the flag', () {
      Env make({bool flag = true, bool release = false, String url = 'http://10.0.2.2:54321'}) =>
          Env(supabaseUrl: url, supabaseAnonKey: anon, allowInsecureLocal: flag, isRelease: release);
      expect(make().problems(), isEmpty);
      expect(make(flag: false).problems(), isNotEmpty);
      expect(make(url: 'http://evil.example.com').problems(), isNotEmpty);
      expect(make(url: 'http://localhost:54321').problems(), isEmpty);
    });

    test('refuses a service-role JWT', () {
      final env = Env(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: _jwt({'role': 'service_role'}));
      expect(env.problems().single, contains('secret'));
    });

    test('refuses a new-style secret key', () {
      const env = Env(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_secret_abcdefghijklmnop');
      expect(env.problems().single, contains('secret'));
      expect(Env.looksLikeSecretKey('sb_publishable_abcdefghijklmnop'), isFalse);
    });

    test('requireValid throws naming every problem', () {
      expect(() => const Env(supabaseUrl: '', supabaseAnonKey: '').requireValid(), throwsStateError);
    });

    test('a garbage key is not mistaken for a secret', () {
      expect(Env.looksLikeSecretKey('not-a-jwt'), isFalse);
      expect(Env.looksLikeSecretKey('a.b.c'), isFalse);
    });
  });

  group('Phone', () {
    test('normalizes common formats to E.164', () {
      expect(Phone.toE164('+91 98765 43210'), '+919876543210');
      expect(Phone.toE164('+1 (415) 555-0100'), '+14155550100');
      expect(Phone.toE164('0091-98765-43210'), '+919876543210');
      expect(Phone.toE164('+91.80.4000.1000'), '+918040001000');
    });

    test('rejects numbers without a country code instead of guessing', () {
      expect(Phone.toE164('9876543210'), isNull);
      expect(Phone.toE164('080 4000 1000'), isNull);
    });

    test('rejects anything that could inject into a carrier code', () {
      for (final bad in ['+91987#', '**21*+91#', '+9198;76', '+91 98 abc', '+91\n98765', '', '   ', null, '+0123456', '+1234']) {
        expect(Phone.toE164(bad), isNull, reason: '$bad');
      }
    });

    test('rejects a plus in the middle and absurd lengths', () {
      expect(Phone.toE164('+91+9876543210'), isNull);
      expect(Phone.toE164('+${'9' * 20}'), isNull);
      expect(Phone.toE164('+${'1' * 40}'), isNull);
    });

    test('displays Indian and US numbers readably', () {
      expect(Phone.display('+919876543210'), '+91 98765 43210');
      expect(Phone.display('+14155550100'), '+1 (415) 555-0100');
      expect(Phone.display(null), 'Unknown caller');
      expect(Phone.display('not a number'), 'not a number');
    });

    test('masks all but the last four digits', () {
      expect(Phone.mask('+919876543210'), '••••3210');
      expect(Phone.mask('123'), '••••');
      expect(Phone.mask(null), 'unknown');
    });

    test('telUri never lets a raw string into the URI', () {
      expect(Phone.telUri('+91 98765 43210').toString(), 'tel:+919876543210');
      expect(Phone.telUri('98765;rm').toString(), 'tel:98765');
    });
  });

  group('Log.redact', () {
    test('removes phone numbers, emails and tokens', () {
      final s = Log.redact(
        'user a.b@example.com called +91 98765 43210 with Bearer abcdefghijklmnopqrstuvwxyz '
        'and ${_jwt({'sub': 'x'})}',
      );
      expect(s, isNot(contains('example.com')));
      expect(s, isNot(contains('98765')));
      expect(s, isNot(contains('abcdefghijklmnop')));
      expect(s, isNot(contains('eyJ')));
    });

    test('leaves short numbers and ordinary text alone', () {
      expect(Log.redact('loaded 20 calls in 340 ms'), 'loaded 20 calls in 340 ms');
    });

    test('removes key-looking strings', () {
      expect(Log.redact('key sb_publishable_ABCDEFGH12345678'), contains('«key»'));
    });
  });

  group('Fmt', () {
    final now = DateTime(2026, 10, 8, 15, 0);

    test('ago', () {
      expect(Fmt.ago(now.subtract(const Duration(seconds: 10)), now: now), 'just now');
      expect(Fmt.ago(now.subtract(const Duration(minutes: 5)), now: now), '5 min ago');
      expect(Fmt.ago(now.subtract(const Duration(hours: 3)), now: now), '3 h ago');
      expect(Fmt.ago(DateTime(2026, 10, 7, 9), now: now), 'Yesterday');
      expect(Fmt.ago(DateTime(2026, 9, 1, 9), now: now), '1 Sep');
      expect(Fmt.ago(now.add(const Duration(minutes: 5)), now: now), 'just now');
    });

    test('slot', () {
      expect(Fmt.slot(DateTime(2026, 10, 8, 17, 30), now: now), 'Today, 5:30 pm');
      expect(Fmt.slot(DateTime(2026, 10, 9, 10), now: now), 'Tomorrow, 10:00 am');
    });

    test('duration and minutes left', () {
      expect(Fmt.duration(45), '45s');
      expect(Fmt.duration(134), '2m 14s');
      expect(Fmt.duration(120), '2m');
      expect(Fmt.duration(3700), '1h 1m');
      expect(Fmt.duration(null), '-');
      expect(Fmt.minutesLeft(0), '0 min');
      expect(Fmt.minutesLeft(-5), '0 min');
      expect(Fmt.minutesLeft(2520), '42 min');
      expect(Fmt.minutesLeft(3900), '1 h 05 min');
    });
  });
}
