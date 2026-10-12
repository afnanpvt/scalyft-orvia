import 'package:permission_handler/permission_handler.dart';

/// Runtime permissions the app asks for, behind an interface so tests do not
/// need a phone.
abstract class PermissionGateway {
  /// CALL_PHONE (needed to send the carrier codes) and READ_PHONE_STATE
  /// (optional, to tell the SIMs apart). Android shows one "phone" prompt for
  /// both. True when the app can now send the codes; callers confirm with the
  /// telephony capabilities, which are the source of truth.
  Future<bool> requestPhone();

  Future<bool> notificationsGranted();
  Future<bool> requestNotifications();

  /// Opens this app's page in system settings, for a permission the owner
  /// denied permanently.
  Future<void> openSettings();

  /// True when Android will no longer show the prompt, so the only way to
  /// grant it is the system settings page.
  Future<bool> phoneBlockedForever();
}

class SystemPermissionGateway implements PermissionGateway {
  const SystemPermissionGateway();

  @override
  Future<bool> requestPhone() async => (await Permission.phone.request()).isGranted;

  @override
  Future<bool> notificationsGranted() async => (await Permission.notification.status).isGranted;

  @override
  Future<bool> requestNotifications() async => (await Permission.notification.request()).isGranted;

  @override
  Future<void> openSettings() async {
    await openAppSettings();
  }

  @override
  Future<bool> phoneBlockedForever() async => (await Permission.phone.status).isPermanentlyDenied;
}
