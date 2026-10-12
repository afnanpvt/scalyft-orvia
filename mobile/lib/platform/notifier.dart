import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../core/format.dart';
import '../core/log.dart';
import '../core/phone.dart';
import '../data/models/models.dart';

/// Tells the owner a call was handled. An interface so tests can watch what
/// would have been shown.
abstract class Notifier {
  Future<void> init();

  /// [call] is a finished call (completed, missed or failed).
  Future<void> showCallHandled(CallRecord call, {required DateTime now});

  /// Ids of calls whose notification the owner tapped, including the one that
  /// launched the app.
  Stream<String> get openedCalls;

  /// Removes every notification this app has shown. Used on sign-out so the
  /// next person on the phone does not see the previous account's callers.
  Future<void> clearAll();
}

class NoopNotifier implements Notifier {
  const NoopNotifier();

  @override
  Future<void> init() async {}

  @override
  Future<void> showCallHandled(CallRecord call, {required DateTime now}) async {}

  @override
  Stream<String> get openedCalls => const Stream.empty();

  @override
  Future<void> clearAll() async {}
}

/// Call ids are UUIDs. A tap payload that is anything else is ignored rather
/// than passed on to a query.
final _uuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');

@visibleForTesting
String? callIdFromPayload(String? payload) {
  const prefix = 'call:';
  if (payload == null || !payload.startsWith(prefix)) return null;
  final id = payload.substring(prefix.length);
  return _uuid.hasMatch(id) ? id.toLowerCase() : null;
}

/// What to say for a finished call. Pure, so it is tested without a phone.
@immutable
class CallAlert {
  const CallAlert({required this.title, required this.body});

  factory CallAlert.from(CallRecord call, {required DateTime now}) {
    final who = Phone.display(call.callerPhone);
    final outcome = switch (call.outcome) {
      CallOutcome.appointmentBooked => 'Booked an appointment',
      CallOutcome.leadCaptured => 'Took their details',
      CallOutcome.transferred => 'Transferred the call',
      CallOutcome.missed => 'Could not reach Orvia',
      CallOutcome.infoGiven || null => null,
    };

    if (call.status == CallStatus.failed) {
      return CallAlert(title: 'A call needs a look', body: '$who. Orvia hit a problem. Tap to review.');
    }
    if (call.status == CallStatus.missed) {
      return CallAlert(title: 'Missed call', body: '$who called and nobody picked up.');
    }
    final summary = call.summary?.trim();
    final detail = outcome ?? (summary != null && summary.isNotEmpty ? summary : 'Orvia answered');
    return CallAlert(title: 'Orvia handled a call from $who', body: detail);
  }

  final String title;
  final String body;
}

class LocalNotifier implements Notifier {
  LocalNotifier({FlutterLocalNotificationsPlugin? plugin}) : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  // Broadcast with a replay of the launch tap: the app may be launched by a
  // tap before anyone is signed in and listening.
  final _opened = StreamController<String>.broadcast();
  String? _launchCallId;
  bool _ready = false;

  void _onTap(NotificationResponse r) {
    final id = callIdFromPayload(r.payload);
    if (id != null) _opened.add(id);
  }

  @override
  Stream<String> get openedCalls async* {
    final launch = _launchCallId;
    if (launch != null) {
      _launchCallId = null;
      yield launch;
    }
    yield* _opened.stream;
  }

  /// Monochrome status-bar icon, res/drawable/ic_stat_orvia.xml.
  static const _icon = 'ic_stat_orvia';

  static const _channel = AndroidNotificationChannel(
    'calls',
    'Calls handled',
    description: 'When Orvia answers, books or misses a call.',
    importance: Importance.high,
  );

  @override
  Future<void> init() async {
    if (_ready) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(android: AndroidInitializationSettings(_icon)),
        onDidReceiveNotificationResponse: _onTap,
      );
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp ?? false) {
        _launchCallId = callIdFromPayload(launch!.notificationResponse?.payload);
      }
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_channel);
      _ready = true;
    } catch (e) {
      Log.e('notifications unavailable', e);
    }
  }

  @override
  Future<void> showCallHandled(CallRecord call, {required DateTime now}) async {
    if (!_ready) return;
    final alert = CallAlert.from(call, now: now);
    try {
      await _plugin.show(
        // Stable per call so a repeat update replaces instead of stacking.
        id: call.id.hashCode & 0x7fffffff,
        title: alert.title,
        body: alert.body,
        // Only the id: everything shown on the detail screen is fetched again
        // under the signed-in owner's permissions.
        payload: 'call:${call.id}',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            _channel.id,
            _channel.name,
            channelDescription: _channel.description,
            icon: _icon,
            importance: Importance.high,
            priority: Priority.high,
            // Caller numbers and summaries are personal data: hide the text on
            // a locked screen.
            visibility: NotificationVisibility.private,
            category: AndroidNotificationCategory.message,
            when: call.createdAt.millisecondsSinceEpoch,
            subText: Fmt.clock(call.createdAt),
          ),
        ),
      );
    } catch (e) {
      Log.e('could not show notification', e);
    }
  }

  @override
  Future<void> clearAll() async {
    if (!_ready) return;
    try {
      await _plugin.cancelAll();
    } catch (e) {
      Log.e('could not clear notifications', e);
    }
  }
}
