import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'log.dart';

/// True when the server is saying "you are not signed in" rather than "that
/// failed": a session that expired or was revoked, or a request that went out
/// with only the public key. Reading your own profile is always allowed for a
/// signed-in owner, so a refusal there means the session is gone.
bool isSessionGone(Object error) {
  if (error is AuthException) {
    final m = error.message.toLowerCase();
    return error.statusCode == '401' || m.contains('refresh token') || m.contains('jwt') || m.contains('session');
  }
  if (error is PostgrestException) {
    return const {'42501', 'PGRST301', 'PGRST303'}.contains(error.code);
  }
  return false;
}

/// Turns any thrown object into one short sentence for the owner. Unknown
/// errors never show their raw text: server messages can contain internals.
String friendlyError(Object error) {
  if (error is AuthException) {
    final m = error.message.toLowerCase();
    if (m.contains('invalid login') || m.contains('invalid credentials')) {
      return 'Wrong email or password.';
    }
    if (m.contains('email not confirmed')) return 'Confirm your email first, then sign in.';
    if (m.contains('rate limit') || m.contains('too many')) {
      return 'Too many attempts. Wait a minute and try again.';
    }
    if (m.contains('same password') || m.contains('different from the old')) {
      return 'Choose a password you have not used before.';
    }
    if (m.contains('weak') || (m.contains('password') && m.contains('characters'))) {
      return 'That password is too weak. Use at least 8 characters.';
    }
    if (error.statusCode == '429') return 'Too many attempts. Wait a minute and try again.';
    return 'Could not sign you in. Try again.';
  }

  if (error is PostgrestException) {
    switch (error.code) {
      case '42501':
        return 'You do not have permission to do that.';
      case 'PGRST301':
      case 'PGRST303':
        return 'Your session expired. Sign in again.';
    }
    Log.w('postgrest ${error.code}');
    return 'Something went wrong on our side. Try again in a moment.';
  }

  if (error is SocketException || error is TimeoutException || error is HttpException) {
    return 'No connection. Check your internet and try again.';
  }
  final name = error.runtimeType.toString();
  if (name == 'ClientException' || name == '_ClientSocketException') {
    return 'No connection. Check your internet and try again.';
  }

  Log.w('unmapped error ${error.runtimeType}');
  return 'Something went wrong. Try again.';
}
