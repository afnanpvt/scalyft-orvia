import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'models/json.dart';

enum UserRole {
  owner,
  admin,
  staff;

  static UserRole parse(Object? raw) => values.firstWhere((v) => v.name == raw, orElse: () => UserRole.staff);
}

@immutable
class Profile {
  const Profile({
    required this.id,
    required this.email,
    required this.businessId,
    required this.role,
    required this.mustChangePassword,
    this.fullName,
  });

  factory Profile.fromJson(Json j) => Profile(
        id: str(j['id']) ?? '',
        email: str(j['email']) ?? '',
        businessId: str(j['business_id']) ?? '',
        role: UserRole.parse(j['role']),
        mustChangePassword: boolean(j['must_change_password']),
        fullName: str(j['full_name']),
      );

  final String id;
  final String email;
  final String businessId;
  final UserRole role;
  final bool mustChangePassword;
  final String? fullName;
}

/// Sign-in and account operations. The session itself lives in Supabase's
/// client (persisted by [SecureSessionStorage]); this is the app's view of it.
abstract class AuthRepository {
  /// Emits the user id when signed in, null when signed out. Emits the current
  /// state first.
  Stream<String?> userIdChanges();

  String? get currentUserId;

  Future<void> signIn({required String email, required String password});
  Future<void> signOut();

  /// Sends the reset link. The same call succeeds whether or not the address
  /// exists, so the screen can never be used to discover accounts.
  Future<void> sendPasswordReset(String email);

  Future<void> changePassword(String newPassword);

  /// The signed-in user's profile row, or null if they have none (an account
  /// that was never attached to a business).
  Future<Profile?> profile();

  Future<void> clearMustChangePassword();
}

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);

  final SupabaseClient _client;
  GoTrueClient get _auth => _client.auth;

  @override
  String? get currentUserId => _auth.currentUser?.id;

  @override
  Stream<String?> userIdChanges() async* {
    yield currentUserId;
    await for (final change in _auth.onAuthStateChange) {
      final event = change.event;
      if (event == AuthChangeEvent.signedOut) {
        yield null;
      } else if (event == AuthChangeEvent.passwordRecovery || event == AuthChangeEvent.mfaChallengeVerified) {
        continue;
      } else {
        // signedIn, initialSession, tokenRefreshed, userUpdated, and any event
        // a newer SDK adds: the session says who is signed in.
        yield change.session?.user.id;
      }
    }
  }

  @override
  Future<void> signIn({required String email, required String password}) async {
    await _auth.signInWithPassword(email: email.trim(), password: password);
  }

  @override
  Future<void> signOut() => _auth.signOut();

  @override
  Future<void> sendPasswordReset(String email) async {
    try {
      await _auth.resetPasswordForEmail(email.trim());
    } on AuthException catch (e) {
      // Only surface rate limiting. Anything else (unknown address, SMTP hiccup)
      // must look identical to success.
      if (e.statusCode == '429') rethrow;
    }
  }

  @override
  Future<void> changePassword(String newPassword) async {
    await _auth.updateUser(UserAttributes(password: newPassword));
  }

  @override
  Future<Profile?> profile() async {
    final id = currentUserId;
    if (id == null) return null;
    final row = await _client
        .from('users')
        .select('id,email,business_id,role,full_name,must_change_password')
        .eq('id', id)
        .maybeSingle();
    return row == null ? null : Profile.fromJson(jsonMap(row));
  }

  @override
  Future<void> clearMustChangePassword() async {
    final id = currentUserId;
    if (id == null) return;
    await _client.from('users').update({'must_change_password': false}).eq('id', id);
  }
}
