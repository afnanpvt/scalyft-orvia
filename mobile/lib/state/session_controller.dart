import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/log.dart';
import '../core/safe_notifier.dart';
import '../data/auth_repository.dart';

enum SessionStage {
  /// Reading the stored session.
  starting,
  signedOut,

  /// Signed in on a temporary password: must choose a real one first.
  mustChangePassword,

  /// Signed in but the account is not attached to a business.
  noBusiness,
  ready,
}

/// Whether the owner is signed in, and what they must do before using the app.
class SessionController extends ChangeNotifier with SafeNotifier {
  SessionController(this._auth, {this.onSignedOut});

  final AuthRepository _auth;

  /// Runs when the owner signs out or the session ends, to wipe local state.
  final Future<void> Function()? onSignedOut;

  SessionStage stage = SessionStage.starting;
  Profile? profile;
  bool busy = false;
  String? error;

  StreamSubscription<String?>? _sub;
  String? _lastUserId;

  Future<void> start() async {
    _sub = _auth.userIdChanges().listen(_onUser, onError: (Object e) {
      Log.w('auth stream error ${e.runtimeType}');
    });
  }

  Future<void> _onUser(String? userId) async {
    if (userId == null) {
      final hadUser = _lastUserId != null;
      _lastUserId = null;
      profile = null;
      stage = SessionStage.signedOut;
      notifyListeners();
      if (hadUser) await onSignedOut?.call();
      return;
    }
    if (userId == _lastUserId && stage == SessionStage.ready) return; // token refresh
    _lastUserId = userId;
    await _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final p = await _auth.profile();
      profile = p;
      if (p == null) {
        stage = SessionStage.noBusiness;
      } else if (p.mustChangePassword) {
        stage = SessionStage.mustChangePassword;
      } else {
        stage = SessionStage.ready;
      }
      error = null;
    } catch (e) {
      if (isSessionGone(e)) {
        // The saved session is no longer valid (expired, revoked, or the server
        // forgot it). A retry cannot fix that: go back to sign in.
        Log.w('saved session rejected, signing out');
        await signOut();
        return;
      }
      // Signed in but the profile did not load (network). Keep the user on a
      // retryable screen rather than showing a wrong stage.
      error = friendlyError(e);
      stage = SessionStage.noBusiness;
    }
    notifyListeners();
  }

  Future<void> retryProfile() async {
    busy = true;
    notifyListeners();
    await _loadProfile();
    busy = false;
    notifyListeners();
  }

  Future<bool> signIn(String email, String password) async {
    final problem = validateCredentials(email, password);
    if (problem != null) {
      error = problem;
      notifyListeners();
      return false;
    }
    busy = true;
    error = null;
    notifyListeners();
    try {
      await _auth.signIn(email: email, password: password);
      return true;
    } catch (e) {
      error = friendlyError(e);
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    busy = true;
    notifyListeners();
    try {
      await _auth.signOut();
    } catch (e) {
      Log.w('sign out error ${e.runtimeType}');
    } finally {
      // Even if the network call failed, the local session is gone.
      busy = false;
    }
  }

  /// Sends the reset link. Always reports success so the screen cannot be used
  /// to find out which emails have accounts.
  Future<bool> sendReset(String email) async {
    if (!_looksLikeEmail(email)) {
      error = 'Enter the email you sign in with.';
      notifyListeners();
      return false;
    }
    busy = true;
    error = null;
    notifyListeners();
    try {
      await _auth.sendPasswordReset(email);
      return true;
    } catch (e) {
      error = friendlyError(e);
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> changePassword(String newPassword) async {
    final problem = passwordProblem(newPassword, email: profile?.email);
    if (problem != null) {
      error = problem;
      notifyListeners();
      return false;
    }
    busy = true;
    error = null;
    notifyListeners();
    try {
      await _auth.changePassword(newPassword);
      await _auth.clearMustChangePassword();
      await _loadProfile();
      return true;
    } catch (e) {
      error = friendlyError(e);
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  void clearError() {
    if (error == null) return;
    error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    super.dispose();
  }

  // ── validation (static so it is unit tested) ─────────────────────────────

  static bool _looksLikeEmail(String s) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(s.trim());

  static String? validateCredentials(String email, String password) {
    if (!_looksLikeEmail(email)) return 'Enter the email you sign in with.';
    if (password.isEmpty) return 'Enter your password.';
    return null;
  }

  static const _commonPasswords = {
    'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui',
    'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1', 'orvia123', 'abcd1234',
  };

  /// Null when acceptable. Server rules still apply on top.
  static String? passwordProblem(String password, {String? email}) {
    if (password.length < 8) return 'Use at least 8 characters.';
    if (password.length > 72) return 'That password is too long. Use 72 characters or fewer.';
    if (password.trim().isEmpty) return 'A password cannot be only spaces.';
    if (RegExp(r'^(.)\1+$').hasMatch(password)) return 'Choose something less repetitive.';
    if (_commonPasswords.contains(password.toLowerCase())) return 'That password is too common. Pick another.';
    final local = email?.split('@').first.toLowerCase();
    if (local != null && local.length >= 4 && password.toLowerCase().contains(local)) {
      return 'Do not use your email in your password.';
    }
    return null;
  }
}
