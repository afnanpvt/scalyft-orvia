import 'package:flutter/foundation.dart';

import '../core/phone.dart';
import 'telephony_gateway.dart';

/// The GSM supplementary services Orvia uses (3GPP TS 22.030 / 22.082).
enum ForwardingKind {
  /// CFU: every call.
  unconditional('21', 'All calls'),

  /// CFB: when the line is busy.
  busy('67', 'When busy'),

  /// CFNRy: when you do not answer.
  noReply('61', 'When unanswered'),

  /// CFNRc: when the phone is off or out of coverage.
  unreachable('62', 'When unreachable'),

  /// Every forwarding service at once. Only ever erased, never set: it is how
  /// the Phone app route pauses Orvia in one step.
  everything('002', 'Of every kind');

  const ForwardingKind(this.code, this.label);

  /// The two-digit service code used in `**21*...#`.
  final String code;
  final String label;
}

enum ForwardingMode {
  /// Ring me first; Orvia picks up what I miss.
  whenUnanswered,

  /// Orvia answers everything.
  everyCall,
}

/// How the destination number is written inside the code. Some carriers
/// reject the leading `+`.
enum DestinationFormat { e164Plus, digitsOnly }

@immutable
class ForwardingPlan {
  const ForwardingPlan({
    this.mode = ForwardingMode.whenUnanswered,
    this.ringSeconds = defaultRingSeconds,
    this.includeBusy = true,
    this.includeUnreachable = true,
    this.format = DestinationFormat.e164Plus,
  });

  factory ForwardingPlan.fromJson(Map<String, Object?> j) => ForwardingPlan(
        mode: ForwardingMode.values.firstWhere((m) => m.name == j['mode'], orElse: () => ForwardingMode.whenUnanswered),
        ringSeconds: normalizeRing(j['ringSeconds'] is num ? (j['ringSeconds']! as num).toInt() : defaultRingSeconds),
        includeBusy: j['includeBusy'] != false,
        includeUnreachable: j['includeUnreachable'] != false,
        format: DestinationFormat.values.firstWhere((f) => f.name == j['format'], orElse: () => DestinationFormat.e164Plus),
      );

  static const defaultRingSeconds = 20;
  static const minRingSeconds = 5;
  static const maxRingSeconds = 30;

  /// Carriers accept 5 to 30 seconds in steps of 5.
  static int normalizeRing(int seconds) {
    final clamped = seconds.clamp(minRingSeconds, maxRingSeconds);
    return ((clamped / 5).round() * 5).clamp(minRingSeconds, maxRingSeconds);
  }

  final ForwardingMode mode;
  final int ringSeconds;
  final bool includeBusy;
  final bool includeUnreachable;
  final DestinationFormat format;

  /// The services this plan turns on.
  List<ForwardingKind> get kinds => switch (mode) {
        ForwardingMode.everyCall => const [ForwardingKind.unconditional],
        ForwardingMode.whenUnanswered => [
            ForwardingKind.noReply,
            if (includeBusy) ForwardingKind.busy,
            if (includeUnreachable) ForwardingKind.unreachable,
          ],
      };

  ForwardingPlan copyWith({
    ForwardingMode? mode,
    int? ringSeconds,
    bool? includeBusy,
    bool? includeUnreachable,
    DestinationFormat? format,
  }) =>
      ForwardingPlan(
        mode: mode ?? this.mode,
        ringSeconds: normalizeRing(ringSeconds ?? this.ringSeconds),
        includeBusy: includeBusy ?? this.includeBusy,
        includeUnreachable: includeUnreachable ?? this.includeUnreachable,
        format: format ?? this.format,
      );

  Map<String, Object?> toJson() => {
        'mode': mode.name,
        'ringSeconds': ringSeconds,
        'includeBusy': includeBusy,
        'includeUnreachable': includeUnreachable,
        'format': format.name,
      };

  @override
  bool operator ==(Object other) =>
      other is ForwardingPlan &&
      other.mode == mode &&
      other.ringSeconds == ringSeconds &&
      other.includeBusy == includeBusy &&
      other.includeUnreachable == includeUnreachable &&
      other.format == format;

  @override
  int get hashCode => Object.hash(mode, ringSeconds, includeBusy, includeUnreachable, format);
}

enum StepPurpose { activate, deactivate, query }

/// One carrier code to send, with enough context to explain it to the owner.
@immutable
class UssdStep {
  const UssdStep({required this.kind, required this.purpose, required this.code});

  final ForwardingKind kind;
  final StepPurpose purpose;
  final String code;

  String get description => switch (purpose) {
        StepPurpose.deactivate when kind == ForwardingKind.everything => 'Turn off all call forwarding',
        StepPurpose.activate => 'Turn on forwarding ${kind.label.toLowerCase()}',
        StepPurpose.deactivate => 'Turn off forwarding ${kind.label.toLowerCase()}',
        StepPurpose.query => 'Check forwarding ${kind.label.toLowerCase()}',
      };
}

/// Builds carrier codes. An interface so a carrier that deviates from the
/// standard can get its own implementation without touching the service.
abstract class UssdCodeBook {
  /// [destination] must already be validated E.164.
  List<UssdStep> activate(String destination, ForwardingPlan plan);

  /// Erase (turn off and unregister) the given services.
  List<UssdStep> deactivate(Iterable<ForwardingKind> kinds);

  List<UssdStep> query(Iterable<ForwardingKind> kinds);

  /// Erase every forwarding service with one code.
  List<UssdStep> eraseAll();
}

/// The standard GSM codes. They work on essentially every GSM/LTE carrier;
/// a few deviate (see docs/ANDROID.md), which is what the interface is for.
class Gsm3gppCodeBook implements UssdCodeBook {
  const Gsm3gppCodeBook();

  @override
  List<UssdStep> activate(String destination, ForwardingPlan plan) {
    final e164 = Phone.toE164(destination);
    if (e164 == null) {
      throw ArgumentError.value(destination, 'destination', 'not an international phone number');
    }
    final dialed = plan.format == DestinationFormat.e164Plus ? e164 : e164.substring(1);
    return [
      for (final kind in plan.kinds)
        UssdStep(
          kind: kind,
          purpose: StepPurpose.activate,
          // Only the no-reply service has a ring timer; the others reject it.
          code: kind == ForwardingKind.noReply
              ? '**${kind.code}*$dialed**${plan.ringSeconds}#'
              : '**${kind.code}*$dialed#',
        ),
    ];
  }

  @override
  List<UssdStep> deactivate(Iterable<ForwardingKind> kinds) => [
        for (final kind in kinds)
          UssdStep(kind: kind, purpose: StepPurpose.deactivate, code: '##${kind.code}#'),
      ];

  @override
  List<UssdStep> query(Iterable<ForwardingKind> kinds) => [
        for (final kind in kinds)
          UssdStep(kind: kind, purpose: StepPurpose.query, code: '*#${kind.code}#'),
      ];

  @override
  List<UssdStep> eraseAll() => const [
        UssdStep(kind: ForwardingKind.everything, purpose: StepPurpose.deactivate, code: '##002#'),
      ];
}

// ── Reading the carrier's answer ───────────────────────────────────────────

enum StepOutcome {
  /// The carrier confirmed it.
  success,

  /// The request was delivered but the reply is not something we can classify.
  unconfirmed,

  /// Rejected, unsupported, or no answer.
  failure,
}

/// What a query told us about one service.
enum ForwardingReading { active, inactive, unknown }

@immutable
class StepResult {
  const StepResult({
    required this.step,
    required this.result,
    required this.outcome,
    this.reading = ForwardingReading.unknown,
  });

  final UssdStep step;
  final UssdResult result;
  final StepOutcome outcome;
  final ForwardingReading reading;

  String get detail {
    final text = result.response?.trim();
    if (text != null && text.isNotEmpty) return text;
    return switch (result.status) {
      UssdStatus.ok => 'The carrier accepted it without a message.',
      UssdStatus.timeout => 'The carrier did not answer in time.',
      UssdStatus.noPermission => 'Phone permission is off.',
      UssdStatus.unsupported => 'This phone cannot send the code from an app.',
      UssdStatus.invalid => 'The code was not valid.',
      UssdStatus.failed => 'The carrier rejected it'
          '${result.failureCode == null ? '' : ' (code ${result.failureCode})'}.',
    };
  }
}

/// Classifies carrier text. Carriers word these differently, mostly in
/// English even on regional networks, so this is a set of phrases checked in
/// a fixed order: failure, then "off", then "on".
abstract final class UssdInterpreter {
  static const _failure = [
    'invalid mmi', 'connection problem', 'not allowed', 'not supported', 'not available',
    'unable to', 'failed', 'failure', 'error', 'denied', 'barred', 'not subscribed',
    'not provisioned', 'unknown application', 'try again', 'temporarily',
  ];

  static const _off = [
    'deactivated', 'erased', 'erasure', 'unregistered', 'deregistered', 'not active', 'inactive',
    'not registered', 'not forwarded', 'disabled', 'cancelled', 'canceled', 'no forwarding',
    'forwarding is off', 'not enabled',
  ];

  static const _on = ['activated', 'registered', 'forwarded to', 'forward to', 'enabled', 'active', 'success'];

  static StepResult interpret(UssdStep step, UssdResult result, {String? destination}) {
    if (result.status != UssdStatus.ok) {
      return StepResult(step: step, result: result, outcome: StepOutcome.failure);
    }

    final text = (result.response ?? '').toLowerCase().trim();
    if (text.isEmpty) {
      // Delivered, nothing said. For a query that tells us nothing.
      return StepResult(
        step: step,
        result: result,
        outcome: step.purpose == StepPurpose.query ? StepOutcome.unconfirmed : StepOutcome.success,
      );
    }

    if (_failure.any(text.contains)) {
      return StepResult(step: step, result: result, outcome: StepOutcome.failure);
    }

    final reading = _read(text, destination);
    final outcome = switch (step.purpose) {
      StepPurpose.activate => reading == ForwardingReading.active ? StepOutcome.success : StepOutcome.unconfirmed,
      StepPurpose.deactivate => reading == ForwardingReading.inactive ? StepOutcome.success : StepOutcome.unconfirmed,
      StepPurpose.query => reading == ForwardingReading.unknown ? StepOutcome.unconfirmed : StepOutcome.success,
    };
    return StepResult(step: step, result: result, outcome: outcome, reading: reading);
  }

  static ForwardingReading _read(String text, String? destination) {
    if (_off.any(text.contains)) return ForwardingReading.inactive;
    if (_on.any(text.contains)) return ForwardingReading.active;
    // A reply that simply quotes the number we asked for means it is set.
    final digits = (destination ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 7) {
      final tail = digits.substring(digits.length - 7);
      if (text.replaceAll(RegExp(r'\D'), '').contains(tail)) return ForwardingReading.active;
    }
    return ForwardingReading.unknown;
  }
}
