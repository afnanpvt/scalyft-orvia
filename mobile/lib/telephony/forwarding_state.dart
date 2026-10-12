import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/log.dart';
import 'forwarding.dart';

enum ForwardingPhase {
  /// Nothing has been set up on this phone.
  notSetUp,

  /// The codes went out, but no real call has reached Orvia yet.
  activeUnverified,

  /// A real forwarded call has been seen after activation.
  activeVerified,

  /// Turned off on purpose. Calls ring normally.
  paused,
}

/// How the codes reach the carrier on this phone.
enum ForwardingRoute {
  /// The app sends them and reads the carrier's reply.
  direct,

  /// The network will not take them from an app (common on 4G/5G voice
  /// networks such as Jio), so they go through the Phone app, which shows the
  /// carrier's reply itself. Learned the first time the direct route fails.
  phoneApp,
}

@immutable
class ForwardingState {
  const ForwardingState({
    this.phase = ForwardingPhase.notSetUp,
    this.plan = const ForwardingPlan(),
    this.destination,
    this.simSubscriptionId,
    this.simLabel,
    this.activatedAt,
    this.verifiedAt,
    this.changedAt,
    this.route = ForwardingRoute.direct,
  });

  factory ForwardingState.fromJson(Map<String, Object?> j) {
    DateTime? t(Object? v) => v is String ? DateTime.tryParse(v) : null;
    final plan = j['plan'];
    return ForwardingState(
      phase: ForwardingPhase.values.firstWhere((p) => p.name == j['phase'], orElse: () => ForwardingPhase.notSetUp),
      plan: plan is Map ? ForwardingPlan.fromJson(plan.map((k, v) => MapEntry(k.toString(), v))) : const ForwardingPlan(),
      destination: j['destination'] as String?,
      simSubscriptionId: (j['simSubscriptionId'] as num?)?.toInt(),
      simLabel: j['simLabel'] as String?,
      activatedAt: t(j['activatedAt']),
      verifiedAt: t(j['verifiedAt']),
      changedAt: t(j['changedAt']),
      route: ForwardingRoute.values.firstWhere((r) => r.name == j['route'], orElse: () => ForwardingRoute.direct),
    );
  }

  final ForwardingPhase phase;
  final ForwardingPlan plan;
  final String? destination;
  final int? simSubscriptionId;
  final String? simLabel;
  final DateTime? activatedAt;
  final DateTime? verifiedAt;
  final DateTime? changedAt;
  final ForwardingRoute route;

  bool get isOn => phase == ForwardingPhase.activeUnverified || phase == ForwardingPhase.activeVerified;

  ForwardingState copyWith({
    ForwardingPhase? phase,
    ForwardingPlan? plan,
    String? destination,
    int? Function()? simSubscriptionId,
    String? Function()? simLabel,
    DateTime? Function()? activatedAt,
    DateTime? Function()? verifiedAt,
    DateTime? changedAt,
    ForwardingRoute? route,
  }) =>
      ForwardingState(
        phase: phase ?? this.phase,
        plan: plan ?? this.plan,
        destination: destination ?? this.destination,
        simSubscriptionId: simSubscriptionId != null ? simSubscriptionId() : this.simSubscriptionId,
        simLabel: simLabel != null ? simLabel() : this.simLabel,
        activatedAt: activatedAt != null ? activatedAt() : this.activatedAt,
        verifiedAt: verifiedAt != null ? verifiedAt() : this.verifiedAt,
        changedAt: changedAt ?? this.changedAt,
        route: route ?? this.route,
      );

  Map<String, Object?> toJson() => {
        'phase': phase.name,
        'plan': plan.toJson(),
        'destination': destination,
        'simSubscriptionId': simSubscriptionId,
        'simLabel': simLabel,
        'activatedAt': activatedAt?.toUtc().toIso8601String(),
        'verifiedAt': verifiedAt?.toUtc().toIso8601String(),
        'changedAt': changedAt?.toUtc().toIso8601String(),
        'route': route.name,
      };

  /// What is safe to tell the server: no phone numbers, just the shape of the
  /// setup. Informational only on the server side.
  Map<String, Object?> toServerSummary() => {
        'phase': phase.name,
        'mode': plan.mode.name,
        'ring_seconds': plan.ringSeconds,
        'kinds': plan.kinds.map((k) => k.name).toList(),
        'sim': simLabel,
        'route': route.name,
        'activated_at': activatedAt?.toUtc().toIso8601String(),
        'verified_at': verifiedAt?.toUtc().toIso8601String(),
      };
}

/// Where the forwarding state lives between launches.
abstract class ForwardingStore {
  Future<ForwardingState> read();
  Future<void> write(ForwardingState state);
  Future<void> clear();
}

/// Per-account, so a phone handed to someone else never starts out looking
/// "verified".
class PrefsForwardingStore implements ForwardingStore {
  PrefsForwardingStore(this._prefs, {required String userId}) : _key = 'forwarding.v1.$userId';

  final SharedPreferences _prefs;
  final String _key;

  @override
  Future<ForwardingState> read() async {
    final raw = _prefs.getString(_key);
    if (raw == null) return const ForwardingState();
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return ForwardingState.fromJson(decoded.map((k, v) => MapEntry(k.toString(), v)));
      }
    } catch (e) {
      Log.w('forwarding state unreadable, starting fresh');
    }
    return const ForwardingState();
  }

  @override
  Future<void> write(ForwardingState state) => _prefs.setString(_key, jsonEncode(state.toJson()));

  @override
  Future<void> clear() => _prefs.remove(_key);
}

class MemoryForwardingStore implements ForwardingStore {
  ForwardingState _state = const ForwardingState();

  @override
  Future<ForwardingState> read() async => _state;

  @override
  Future<void> write(ForwardingState state) async => _state = state;

  @override
  Future<void> clear() async => _state = const ForwardingState();
}
