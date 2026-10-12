import 'package:flutter/foundation.dart';

import '../../data/models/models.dart';
import '../../telephony/forwarding.dart';
import '../../telephony/forwarding_state.dart';
import '../../widgets/phone_line.dart';

enum HeroAction { connect, pause, resume, checkTestCall, openDetails }

/// What the home screen's top card says. Pure: the same inputs always give the
/// same card, which is how it is tested.
@immutable
class HeroModel {
  const HeroModel({
    required this.line,
    required this.title,
    required this.subtitle,
    this.primary,
    this.primaryLabel,
    this.secondary,
    this.secondaryLabel,
  });

  final LineState line;
  final String title;
  final String subtitle;
  final HeroAction? primary;
  final String? primaryLabel;
  final HeroAction? secondary;
  final String? secondaryLabel;

  static String describePlan(ForwardingPlan plan) => switch (plan.mode) {
        ForwardingMode.everyCall => 'Orvia answers every call that comes to this phone.',
        ForwardingMode.whenUnanswered =>
          'Calls you miss go to Orvia after ${plan.ringSeconds} seconds of ringing, and when you are busy or out of signal.',
      };

  static HeroModel from({required ForwardingState forwarding, required Overview? overview}) {
    final canAnswer = overview?.canAnswer ?? true;

    // A live call wins: it is the most important thing happening.
    final live = overview?.liveCall;
    if (live != null && forwarding.isOn) {
      return const HeroModel(
        line: LineState.live,
        title: 'Orvia is on a call',
        subtitle: 'It is talking to a caller right now. The summary appears here when it ends.',
        secondary: HeroAction.pause,
        secondaryLabel: 'Pause Orvia',
      );
    }

    switch (forwarding.phase) {
      case ForwardingPhase.notSetUp:
        return const HeroModel(
          line: LineState.notSetUp,
          title: 'Your phone is not connected',
          subtitle: 'Connect it so calls you cannot answer reach your receptionist instead of going unanswered.',
          primary: HeroAction.connect,
          primaryLabel: 'Connect your phone',
        );

      case ForwardingPhase.paused:
        return const HeroModel(
          line: LineState.paused,
          title: 'Orvia is paused',
          subtitle: 'Calls ring as normal and nothing is forwarded.',
          primary: HeroAction.resume,
          primaryLabel: 'Turn Orvia back on',
          secondary: HeroAction.openDetails,
          secondaryLabel: 'Details',
        );

      case ForwardingPhase.activeUnverified:
        return HeroModel(
          line: canAnswer ? LineState.covering : LineState.blocked,
          title: canAnswer ? 'Forwarding is on. Test it once' : blockedTitle(overview),
          subtitle: canAnswer
              ? 'Call this phone from another number and let it ring. Orvia should pick up and this card will turn green.'
              : blockedSubtitle(overview),
          primary: canAnswer ? HeroAction.checkTestCall : null,
          primaryLabel: canAnswer ? 'I made a test call' : null,
          secondary: HeroAction.pause,
          secondaryLabel: 'Pause Orvia',
        );

      case ForwardingPhase.activeVerified:
        if (!canAnswer) {
          return HeroModel(
            line: LineState.blocked,
            title: blockedTitle(overview),
            subtitle: blockedSubtitle(overview),
            secondary: HeroAction.pause,
            secondaryLabel: 'Pause Orvia',
          );
        }
        return HeroModel(
          line: LineState.covering,
          title: 'Orvia is covering your phone',
          subtitle: describePlan(forwarding.plan),
          primary: HeroAction.pause,
          primaryLabel: 'Pause Orvia',
          secondary: HeroAction.openDetails,
          secondaryLabel: 'Details',
        );
    }
  }

  static String blockedTitle(Overview? o) =>
      o?.status != BusinessStatus.active ? 'Orvia cannot answer yet' : 'Orvia is out of minutes';

  static String blockedSubtitle(Overview? o) => o?.status != BusinessStatus.active
      ? 'Your account is not active. Calls forwarded now go unanswered. Pause Orvia until it is.'
      : 'Calls forwarded now go unanswered. Top up on the Orvia dashboard, or pause Orvia so calls ring normally.';
}
