import 'dart:async';

import 'package:orvia/data/auth_repository.dart';
import 'package:orvia/data/models/models.dart';
import 'package:orvia/platform/app_lock.dart';
import 'package:orvia/platform/notifier.dart';
import 'package:orvia/platform/permissions.dart';

import 'fake_carrier.dart';

class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.users = const {}});

  /// email -> password
  final Map<String, String> users;
  Profile? profileValue;
  Object? signInError;
  String? _uid;
  final _ctrl = StreamController<String?>.broadcast();
  final resets = <String>[];
  final passwordChanges = <String>[];
  bool mustChangeCleared = false;
  Object? profileError;

  @override
  String? get currentUserId => _uid;

  @override
  Stream<String?> userIdChanges() async* {
    yield _uid;
    yield* _ctrl.stream;
  }

  @override
  Future<void> signIn({required String email, required String password}) async {
    if (signInError != null) throw signInError!;
    if (users[email.trim()] != password) throw const FormatException('bad credentials');
    _uid = 'user-1';
    _ctrl.add(_uid);
  }

  @override
  Future<void> signOut() async {
    _uid = null;
    _ctrl.add(null);
  }

  @override
  Future<void> sendPasswordReset(String email) async => resets.add(email);

  @override
  Future<void> changePassword(String newPassword) async => passwordChanges.add(newPassword);

  @override
  Future<Profile?> profile() async {
    if (profileError != null) throw profileError!;
    return profileValue;
  }

  @override
  Future<void> clearMustChangePassword() async {
    mustChangeCleared = true;
    final p = profileValue;
    if (p != null) {
      profileValue = Profile(
        id: p.id,
        email: p.email,
        businessId: p.businessId,
        role: p.role,
        mustChangePassword: false,
        fullName: p.fullName,
      );
    }
  }

  Future<void> close() => _ctrl.close();
}

Profile makeProfile({bool mustChange = false}) => Profile(
      id: 'user-1',
      email: 'owner@smile.test',
      businessId: 'biz-1',
      role: UserRole.owner,
      mustChangePassword: mustChange,
      fullName: 'Dr. Rao',
    );

class FakePermissionGateway implements PermissionGateway {
  FakePermissionGateway(this.gateway);

  final FakeTelephonyGateway gateway;
  bool grantPhone = true;
  bool grantNotifications = true;
  bool permanentlyDenied = false;
  int phoneRequests = 0;
  int settingsOpened = 0;
  bool notifGranted = false;
  int notificationRequests = 0;

  @override
  Future<bool> requestPhone() async {
    phoneRequests++;
    if (grantPhone) {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true, readPhoneStateGranted: true);
    }
    return grantPhone;
  }

  @override
  Future<bool> notificationsGranted() async => notifGranted;

  @override
  Future<bool> requestNotifications() async {
    notificationRequests++;
    notifGranted = grantNotifications;
    return grantNotifications;
  }

  @override
  Future<void> openSettings() async => settingsOpened++;

  @override
  Future<bool> phoneBlockedForever() async => permanentlyDenied;
}

class FakeDeviceAuth implements DeviceAuth {
  bool supported = true;
  bool succeeds = true;
  int prompts = 0;
  Completer<bool>? hold;

  @override
  Future<bool> isSupported() async => supported;

  @override
  Future<bool> authenticate({required String reason}) async {
    prompts++;
    if (hold != null) return hold!.future;
    return succeeds;
  }
}

class RecordingNotifier implements Notifier {
  final shown = <CallRecord>[];
  // Lives as long as the test.
  // ignore: close_sinks
  final taps = StreamController<String>.broadcast();
  var cleared = 0;

  @override
  Future<void> init() async {}

  @override
  Future<void> showCallHandled(CallRecord call, {required DateTime now}) async => shown.add(call);

  @override
  Stream<String> get openedCalls => taps.stream;

  @override
  Future<void> clearAll() async => cleared++;
}
