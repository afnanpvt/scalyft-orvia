import 'dart:async';

import 'package:orvia/data/models/models.dart';
import 'package:orvia/data/orvia_api.dart';

/// An in-memory [OrviaApi]. Tests mutate its lists directly and can make any
/// call fail on demand.
class FakeOrviaApi implements OrviaApi {
  FakeOrviaApi({Overview? overview}) : overviewValue = overview ?? makeOverview();

  Overview? overviewValue;
  List<CallRecord> allCalls = [];
  List<Appointment> allAppointments = [];
  List<FollowUp> followUpList = [];
  List<Lead> leadList = [];
  List<OpEvent> eventList = [];
  BusinessSettings settingsValue = const BusinessSettings();

  /// Set to make the next call(s) throw. Cleared after one use unless [failAlways].
  Object? failNext;
  bool failAlways = false;

  /// Artificial latency so tests can interleave requests.
  Duration latency = Duration.zero;

  final registered = <Map<String, Object?>>[];
  final unregistered = <String>[];
  final patches = <Map<String, String?>>[];
  final log = <String>[];
  final _changes = StreamController<ChangedTable>.broadcast();

  void emit(ChangedTable t) => _changes.add(t);

  Future<T> _run<T>(String name, T Function() body) async {
    log.add(name);
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    final err = failNext;
    if (err != null) {
      if (!failAlways) failNext = null;
      throw err;
    }
    return body();
  }

  @override
  Future<Overview?> overview() => _run('overview', () => overviewValue);

  @override
  Future<List<CallRecord>> calls({DateTime? before, int limit = 20, CallFilter filter = CallFilter.all}) =>
      _run('calls', () {
        var list = allCalls.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        list = switch (filter) {
          CallFilter.all => list,
          CallFilter.missed => list.where((c) => c.wasMissed).toList(),
          CallFilter.booked => list.where((c) => c.outcome == CallOutcome.appointmentBooked).toList(),
          CallFilter.leads => list.where((c) => c.outcome == CallOutcome.leadCaptured).toList(),
        };
        if (before != null) list = list.where((c) => c.createdAt.isBefore(before)).toList();
        return list.take(limit).toList();
      });

  @override
  Future<CallRecord?> call(String id) =>
      _run('call', () => allCalls.where((c) => c.id == id).firstOrNull);

  @override
  Future<List<CallRecord>> callsSince(DateTime since) => _run(
        'callsSince',
        () => allCalls.where((c) => c.createdAt.isAfter(since) && !c.isTestCall).toList(),
      );

  @override
  Future<List<Appointment>> appointments(AppointmentRange range) => _run('appointments', () {
        final now = DateTime.now();
        final list = allAppointments
            .where((a) => range == AppointmentRange.upcoming ? !a.start.isBefore(now) : a.start.isBefore(now))
            .toList()
          ..sort((a, b) => range == AppointmentRange.upcoming ? a.start.compareTo(b.start) : b.start.compareTo(a.start));
        return list;
      });

  @override
  Future<void> setAppointmentStatus(String id, AppointmentStatus status) => _run('setAppointmentStatus', () {
        final i = allAppointments.indexWhere((a) => a.id == id);
        if (i < 0) throw StateError('no such appointment');
        final a = allAppointments[i];
        allAppointments[i] = Appointment(
          id: a.id,
          customerName: a.customerName,
          customerPhone: a.customerPhone,
          start: a.start,
          status: status,
          serviceType: a.serviceType,
        );
      });

  @override
  Future<List<FollowUp>> followUps() => _run('followUps', () => followUpList.toList());

  @override
  Future<void> markFollowUpHandled(String id) =>
      _run('markFollowUpHandled', () => followUpList.removeWhere((f) => f.id == id));

  @override
  Future<List<Lead>> leads() => _run('leads', () => leadList.where((l) => l.isOpen).toList());

  @override
  Future<void> setLeadStatus(String id, LeadStatus status) => _run('setLeadStatus', () {
        final i = leadList.indexWhere((l) => l.id == id);
        final l = leadList[i];
        leadList[i] = Lead(
          id: l.id,
          phone: l.phone,
          status: status,
          urgency: l.urgency,
          createdAt: l.createdAt,
          name: l.name,
          serviceNeeded: l.serviceNeeded,
        );
      });

  @override
  Future<List<OpEvent>> openEvents() => _run('openEvents', () => eventList.toList());

  @override
  Future<void> resolveEvent(String id) => _run('resolveEvent', () => eventList.removeWhere((e) => e.id == id));

  @override
  Future<BusinessSettings> settings() => _run('settings', () => settingsValue);

  @override
  Future<void> patchSettings(Map<String, String?> patch) => _run('patchSettings', () {
        patches.add(patch);
        settingsValue = BusinessSettings(
          greeting: patch.containsKey('greeting') ? patch['greeting'] : settingsValue.greeting,
          transferNumber: patch.containsKey('transfer_number') ? patch['transfer_number'] : settingsValue.transferNumber,
          notificationPhone:
              patch.containsKey('notification_phone') ? patch['notification_phone'] : settingsValue.notificationPhone,
        );
      });

  @override
  Future<void> registerDevice({
    required String installationId,
    required String? pushToken,
    required String appVersion,
    required Map<String, Object?> forwarding,
  }) =>
      _run('registerDevice', () => registered.add({
            'installationId': installationId,
            'pushToken': pushToken,
            'appVersion': appVersion,
            'forwarding': forwarding,
          }));

  @override
  Future<void> unregisterDevice(String installationId) => _run('unregisterDevice', () => unregistered.add(installationId));

  @override
  Stream<ChangedTable> changes() => _changes.stream;
}

Overview makeOverview({
  String? aiNumber = '+918040001000',
  int seconds = 3600,
  BusinessStatus status = BusinessStatus.active,
  int callsToday = 0,
  LiveCall? live,
}) =>
    Overview(
      businessId: 'biz-1',
      businessName: 'Smile Dental',
      status: status,
      secondsRemaining: seconds,
      allowOverage: false,
      aiNumber: aiNumber,
      callsToday: callsToday,
      missedToday: 0,
      appointmentsToday: 0,
      leadsToday: 0,
      upcomingAppointments: 0,
      pendingFollowUps: 0,
      unresolvedEvents: 0,
      liveCall: live,
    );

CallRecord makeCall(
  String id, {
  DateTime? at,
  CallStatus status = CallStatus.completed,
  CallOutcome? outcome = CallOutcome.infoGiven,
  String? phone = '+919876543210',
  String? summary = 'Asked about root canal pricing.',
  bool test = false,
}) =>
    CallRecord(
      id: id,
      status: status,
      createdAt: at ?? DateTime.now(),
      callerPhone: test ? null : phone,
      outcome: outcome,
      summary: summary,
      durationSecs: 94,
      isTestCall: test,
    );

Appointment makeAppointment(String id, {required DateTime start, AppointmentStatus status = AppointmentStatus.confirmed}) =>
    Appointment(id: id, customerName: 'Asha Rao', customerPhone: '+919800000001', start: start, status: status, serviceType: 'Cleaning');

FollowUp makeFollowUp(String id, {int priority = 5, FollowUpKind kind = FollowUpKind.missedCallback}) =>
    FollowUp(id: id, kind: kind, priority: priority, createdAt: DateTime.now(), callerPhone: '+919876543210');

Lead makeLead(String id, {LeadStatus status = LeadStatus.newLead}) =>
    Lead(id: id, phone: '+919800000003', status: status, urgency: LeadUrgency.routine, createdAt: DateTime.now(), name: 'Ravi');
