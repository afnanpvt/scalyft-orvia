import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/phone.dart';
import '../../data/models/models.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';

/// How a call is shown: an icon, a tone and a short word for what happened.
@immutable
class CallVisual {
  const CallVisual(this.icon, this.tone, this.label);

  final IconData icon;
  final Tone tone;
  final String label;

  static CallVisual of(CallRecord call) {
    if (call.status == CallStatus.inProgress) {
      return const CallVisual(Icons.graphic_eq_rounded, Tone.good, 'On the call now');
    }
    if (call.status == CallStatus.failed) {
      return const CallVisual(Icons.error_outline_rounded, Tone.warn, 'Needs a look');
    }
    if (call.status == CallStatus.missed) {
      return const CallVisual(Icons.phone_missed_rounded, Tone.bad, 'Missed');
    }
    return switch (call.outcome) {
      CallOutcome.appointmentBooked => const CallVisual(Icons.event_available_rounded, Tone.good, 'Booked'),
      CallOutcome.leadCaptured => const CallVisual(Icons.person_add_alt_1_rounded, Tone.good, 'Details taken'),
      CallOutcome.transferred => const CallVisual(Icons.phone_forwarded_rounded, Tone.neutral, 'Transferred'),
      CallOutcome.missed => const CallVisual(Icons.phone_missed_rounded, Tone.bad, 'Missed'),
      CallOutcome.infoGiven || null => const CallVisual(Icons.chat_bubble_outline_rounded, Tone.neutral, 'Answered'),
    };
  }
}

String callTitle(CallRecord call) => call.isTestCall ? 'Test call' : Phone.display(call.callerPhone);

class CallTile extends StatelessWidget {
  const CallTile({super.key, required this.call, required this.now, required this.onTap});

  final CallRecord call;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = CallVisual.of(call);
    final summary = call.summary?.trim();
    final text = context.text;
    final c = context.c;
    final when = Fmt.ago(call.createdAt, now: now);

    return LedgerRow(
      onTap: onTap,
      semanticLabel: '${callTitle(call)}, ${v.label}, $when',
      leading: IconDisc(v.icon, tone: v.tone),
      title: Row(
        children: [
          Expanded(
            child: Text(callTitle(call), style: text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          Text(when, style: text.labelSmall),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The pill already says what happened; only repeat it as text when
          // there is a real summary to show instead.
          if (summary != null && summary.isNotEmpty) ...[
            Text(
              summary,
              style: text.bodySmall?.copyWith(color: c.muted),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              Pill(v.label, tone: v.tone),
              if (call.durationSecs != null) ...[
                const SizedBox(width: 8),
                Text(Fmt.duration(call.durationSecs), style: text.labelSmall),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
