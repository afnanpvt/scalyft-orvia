import 'package:flutter/foundation.dart';

import 'json.dart';

// ── Calls ──────────────────────────────────────────────────────────────────

enum CallStatus {
  inProgress('in_progress'),
  completed('completed'),
  missed('missed'),
  failed('failed'),
  transferred('transferred');

  const CallStatus(this.wire);
  final String wire;

  static CallStatus parse(Object? raw) =>
      values.firstWhere((v) => v.wire == raw, orElse: () => CallStatus.completed);
}

enum CallOutcome {
  appointmentBooked('appointment_booked'),
  leadCaptured('lead_captured'),
  infoGiven('info_given'),
  transferred('transferred'),
  missed('missed');

  const CallOutcome(this.wire);
  final String wire;

  static CallOutcome? parse(Object? raw) {
    for (final v in values) {
      if (v.wire == raw) return v;
    }
    return null;
  }
}

@immutable
class TranscriptTurn {
  const TranscriptTurn({required this.fromAssistant, required this.text});

  factory TranscriptTurn.fromJson(Json j) => TranscriptTurn(
        fromAssistant: j['role'] != 'user',
        text: str(j['content']) ?? '',
      );

  final bool fromAssistant;
  final String text;
}

@immutable
class CallRecord {
  const CallRecord({
    required this.id,
    required this.status,
    required this.createdAt,
    this.callerPhone,
    this.outcome,
    this.summary,
    this.startedAt,
    this.endedAt,
    this.durationSecs,
    this.recordingUrl,
    this.transcript = const [],
    this.transcriptReady = false,
    this.aiFailureReason,
    this.isTestCall = false,
  });

  factory CallRecord.fromJson(Json j) {
    final extracted = jsonMap(j['extracted_data']);
    final turns = j['transcript'];
    return CallRecord(
      id: str(j['id']) ?? '',
      status: CallStatus.parse(j['status']),
      createdAt: time(j['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      callerPhone: str(j['caller_phone']),
      outcome: CallOutcome.parse(j['outcome']),
      summary: str(j['summary']),
      startedAt: time(j['started_at']),
      endedAt: time(j['ended_at']),
      durationSecs: integer(j['duration_secs']),
      recordingUrl: str(j['recording_url']),
      transcript: turns is List
          ? turns.whereType<Map<dynamic, dynamic>>().map((t) => TranscriptTurn.fromJson(jsonMap(t))).toList()
          : const [],
      transcriptReady: j['transcript_status'] == 'complete',
      aiFailureReason: str(j['ai_failure_reason']),
      // vapi-events / migration 015: browser test calls carry no number and
      // are tagged source=web. Demo rows are tagged demo_seed.
      isTestCall: extracted['source'] == 'web' || extracted['demo_seed'] == 'true',
    );
  }

  final String id;
  final CallStatus status;
  final DateTime createdAt;
  final String? callerPhone;
  final CallOutcome? outcome;
  final String? summary;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final int? durationSecs;
  final String? recordingUrl;
  final List<TranscriptTurn> transcript;
  final bool transcriptReady;
  final String? aiFailureReason;
  final bool isTestCall;

  bool get wasMissed => status == CallStatus.missed || status == CallStatus.failed;
}

// ── Appointments ───────────────────────────────────────────────────────────

enum AppointmentStatus {
  confirmed('confirmed'),
  completed('completed'),
  cancelled('cancelled'),
  noShow('no_show'),
  rescheduled('rescheduled');

  const AppointmentStatus(this.wire);
  final String wire;

  static AppointmentStatus parse(Object? raw) =>
      values.firstWhere((v) => v.wire == raw, orElse: () => AppointmentStatus.confirmed);
}

@immutable
class Appointment {
  const Appointment({
    required this.id,
    required this.customerName,
    required this.customerPhone,
    required this.start,
    required this.status,
    this.end,
    this.serviceType,
    this.notes,
    this.callId,
  });

  factory Appointment.fromJson(Json j) => Appointment(
        id: str(j['id']) ?? '',
        customerName: str(j['customer_name']) ?? 'Unknown',
        customerPhone: str(j['customer_phone']) ?? '',
        start: time(j['scheduled_start']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        end: time(j['scheduled_end']),
        status: AppointmentStatus.parse(j['status']),
        serviceType: str(j['service_type']),
        notes: str(j['notes']),
        callId: str(j['call_id']),
      );

  final String id;
  final String customerName;
  final String customerPhone;
  final DateTime start;
  final DateTime? end;
  final AppointmentStatus status;
  final String? serviceType;
  final String? notes;
  final String? callId;

  bool get isOpen => status == AppointmentStatus.confirmed || status == AppointmentStatus.rescheduled;
}

// ── Follow-ups ─────────────────────────────────────────────────────────────

enum FollowUpKind {
  missedCallback('missed_callback'),
  partialBooking('partial_booking');

  const FollowUpKind(this.wire);
  final String wire;

  static FollowUpKind parse(Object? raw) =>
      values.firstWhere((v) => v.wire == raw, orElse: () => FollowUpKind.missedCallback);
}

@immutable
class FollowUp {
  const FollowUp({
    required this.id,
    required this.kind,
    required this.priority,
    required this.createdAt,
    this.callerPhone,
    this.callerName,
    this.serviceNeeded,
    this.callId,
  });

  factory FollowUp.fromJson(Json j) => FollowUp(
        id: str(j['id']) ?? '',
        kind: FollowUpKind.parse(j['queue_type']),
        priority: integer(j['priority']) ?? 5,
        createdAt: time(j['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        callerPhone: str(j['caller_phone']),
        callerName: str(j['caller_name']),
        serviceNeeded: str(j['service_needed']),
        callId: str(j['call_id']),
      );

  final String id;
  final FollowUpKind kind;
  final int priority; // 1 = most urgent
  final DateTime createdAt;
  final String? callerPhone;
  final String? callerName;
  final String? serviceNeeded;
  final String? callId;

  bool get isUrgent => priority <= 2;
}

// ── Leads ──────────────────────────────────────────────────────────────────

enum LeadStatus {
  newLead('new'),
  contacted('contacted'),
  booked('booked'),
  closed('closed'),
  lost('lost');

  const LeadStatus(this.wire);
  final String wire;

  static LeadStatus parse(Object? raw) =>
      values.firstWhere((v) => v.wire == raw, orElse: () => LeadStatus.newLead);
}

enum LeadUrgency {
  emergency('emergency'),
  urgent('urgent'),
  routine('routine'),
  inquiry('inquiry');

  const LeadUrgency(this.wire);
  final String wire;

  static LeadUrgency parse(Object? raw) =>
      values.firstWhere((v) => v.wire == raw, orElse: () => LeadUrgency.routine);
}

@immutable
class Lead {
  const Lead({
    required this.id,
    required this.phone,
    required this.status,
    required this.urgency,
    required this.createdAt,
    this.name,
    this.serviceNeeded,
    this.notes,
  });

  factory Lead.fromJson(Json j) => Lead(
        id: str(j['id']) ?? '',
        phone: str(j['phone']) ?? '',
        status: LeadStatus.parse(j['status']),
        urgency: LeadUrgency.parse(j['urgency']),
        createdAt: time(j['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        name: str(j['name']),
        serviceNeeded: str(j['service_needed']),
        notes: str(j['notes']),
      );

  final String id;
  final String phone;
  final LeadStatus status;
  final LeadUrgency urgency;
  final DateTime createdAt;
  final String? name;
  final String? serviceNeeded;
  final String? notes;

  bool get isOpen => status == LeadStatus.newLead || status == LeadStatus.contacted;
}

// ── Operational events ("needs attention") ─────────────────────────────────

enum Severity { critical, warning, info }

@immutable
class OpEvent {
  const OpEvent({
    required this.id,
    required this.type,
    required this.severity,
    required this.createdAt,
    this.callId,
    this.payload = const {},
  });

  factory OpEvent.fromJson(Json j) => OpEvent(
        id: str(j['id']) ?? '',
        type: str(j['event_type']) ?? 'unknown',
        severity: enumByName(Severity.values, j['severity'], Severity.warning),
        createdAt: time(j['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        callId: str(j['call_id']),
        payload: jsonMap(j['payload']),
      );

  final String id;
  final String type;
  final Severity severity;
  final DateTime createdAt;
  final String? callId;
  final Json payload;

  /// The one-line explanation shown to the owner.
  String get title => switch (type) {
        'ai_failure' => 'Orvia hit a problem on a call',
        'partial_booking' => 'A caller wanted to book but did not finish',
        'concurrent_call' => 'Two calls came in at once',
        'transfer_unknown' => 'A call transfer could not be confirmed',
        _ => 'Something needs a look',
      };
}

// ── Overview (home screen) ─────────────────────────────────────────────────

@immutable
class LiveCall {
  const LiveCall({required this.id, this.callerPhone, this.startedAt});

  factory LiveCall.fromJson(Json j) => LiveCall(
        id: str(j['id']) ?? '',
        callerPhone: str(j['caller_phone']),
        startedAt: time(j['started_at']),
      );

  final String id;
  final String? callerPhone;
  final DateTime? startedAt;
}

enum BusinessStatus {
  active,
  inactive,
  onboarding;

  static BusinessStatus parse(Object? raw) =>
      values.firstWhere((v) => v.name == raw, orElse: () => BusinessStatus.onboarding);
}

@immutable
class Overview {
  const Overview({
    required this.businessId,
    required this.businessName,
    required this.status,
    required this.secondsRemaining,
    required this.allowOverage,
    required this.callsToday,
    required this.missedToday,
    required this.appointmentsToday,
    required this.leadsToday,
    required this.upcomingAppointments,
    required this.pendingFollowUps,
    required this.unresolvedEvents,
    this.aiNumber,
    this.phoneDisplay,
    this.lastCallAt,
    this.liveCall,
    this.timezone = 'UTC',
  });

  factory Overview.fromJson(Json j) {
    final b = jsonMap(j['business']);
    final t = jsonMap(j['today']);
    final live = j['live_call'];
    return Overview(
      businessId: str(b['id']) ?? '',
      businessName: str(b['name']) ?? 'Your business',
      status: BusinessStatus.parse(b['status']),
      timezone: str(b['timezone']) ?? 'UTC',
      secondsRemaining: integer(b['seconds_remaining']) ?? 0,
      allowOverage: boolean(b['allow_overage']),
      aiNumber: str(b['ai_number']),
      phoneDisplay: str(b['phone_display']),
      callsToday: integer(t['calls']) ?? 0,
      missedToday: integer(t['missed']) ?? 0,
      appointmentsToday: integer(t['appointments']) ?? 0,
      leadsToday: integer(t['leads']) ?? 0,
      upcomingAppointments: integer(j['upcoming_appointments']) ?? 0,
      pendingFollowUps: integer(j['pending_followups']) ?? 0,
      unresolvedEvents: integer(j['unresolved_events']) ?? 0,
      lastCallAt: time(j['last_call_at']),
      liveCall: live is Map ? LiveCall.fromJson(jsonMap(live)) : null,
    );
  }

  final String businessId;
  final String businessName;
  final BusinessStatus status;
  final String timezone;
  final int secondsRemaining;
  final bool allowOverage;
  final String? aiNumber;
  final String? phoneDisplay;
  final int callsToday;
  final int missedToday;
  final int appointmentsToday;
  final int leadsToday;
  final int upcomingAppointments;
  final int pendingFollowUps;
  final int unresolvedEvents;
  final DateTime? lastCallAt;
  final LiveCall? liveCall;

  /// Orvia answers only while the account is active and has minutes (or may
  /// run into overage).
  bool get canAnswer => status == BusinessStatus.active && (secondsRemaining > 0 || allowOverage);

  bool get lowOnMinutes => secondsRemaining > 0 && secondsRemaining <= 1800;

  /// The number to forward calls to: the dedicated column, falling back to the
  /// display number when that is a complete international number.
  String? get forwardTarget => aiNumber ?? phoneDisplay;
}

// ── Business settings the app may edit ─────────────────────────────────────

@immutable
class BusinessSettings {
  const BusinessSettings({this.greeting, this.transferNumber, this.notificationPhone});

  factory BusinessSettings.fromJson(Json j) => BusinessSettings(
        greeting: str(j['greeting']),
        transferNumber: str(j['transfer_number']),
        notificationPhone: str(j['notification_phone']),
      );

  final String? greeting;
  final String? transferNumber;
  final String? notificationPhone;
}
