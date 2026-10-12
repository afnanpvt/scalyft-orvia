import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/phone.dart';
import '../../state/phone_setup_controller.dart';
import '../../telephony/forwarding.dart';
import '../../telephony/forwarding_state.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import '../../widgets/phone_line.dart';

/// Connect the owner's SIM to Orvia, check it, pause it, or do it by hand.
class PhoneSetupScreen extends StatelessWidget {
  const PhoneSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.watch<PhoneSetupController>();
    final c = context.c;
    final on = p.state.isOn;
    final plan = p.plan;

    final line = switch (p.state.phase) {
      ForwardingPhase.notSetUp => LineState.notSetUp,
      ForwardingPhase.paused => LineState.paused,
      ForwardingPhase.activeUnverified ||
      ForwardingPhase.activeVerified => LineState.covering,
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Phone connection')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter),
            child: PhoneLine(state: line),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 0),
            child: Text(switch (p.state.phase) {
              ForwardingPhase.notSetUp => 'Not connected yet',
              ForwardingPhase.paused => 'Paused',
              ForwardingPhase.activeUnverified => 'On, waiting for a test call',
              ForwardingPhase.activeVerified => 'Connected and working',
            }, style: context.text.headlineSmall),
          ),
          if (p.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(kGutter, 10, kGutter, 0),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  p.error!,
                  style: context.text.bodyMedium?.copyWith(color: c.bad),
                ),
              ),
            ),

          // ── the number ──
          const SectionTitle('Your Orvia number'),
          if (p.targetProblem != null)
            _Note(tone: Tone.warn, text: p.targetProblem!)
          else
            Sheet(
              children: [
                LedgerRow(
                  leading: const IconDisc(
                    Icons.graphic_eq_rounded,
                    tone: Tone.good,
                  ),
                  title: Text(
                    Phone.display(p.target),
                    style: context.text.titleMedium,
                  ),
                  subtitle: Text(
                    'Calls are sent here',
                    style: context.text.bodySmall,
                  ),
                  trailing: IconButton(
                    tooltip: 'Copy number',
                    icon: const Icon(Icons.copy_rounded, size: 20),
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: p.target!));
                      if (context.mounted) {
                        showMessage(context, 'Number copied');
                      }
                    },
                  ),
                ),
              ],
            ),

          // ── how ──
          const SectionTitle('When should Orvia answer?'),
          _ModeOption(
            selected: plan.mode == ForwardingMode.whenUnanswered,
            title: 'When I cannot answer',
            body: 'Your phone rings first. Orvia picks up calls you miss.',
            badge: 'Recommended',
            onTap: () => p.updatePlan(
              plan.copyWith(mode: ForwardingMode.whenUnanswered),
            ),
          ),
          const SizedBox(height: 10),
          _ModeOption(
            selected: plan.mode == ForwardingMode.everyCall,
            title: 'Every call',
            body: 'Orvia answers every call and your phone does not ring.',
            onTap: () =>
                p.updatePlan(plan.copyWith(mode: ForwardingMode.everyCall)),
          ),
          if (plan.mode == ForwardingMode.whenUnanswered) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Ring for', style: context.text.titleSmall),
                  ),
                  Text(
                    '${plan.ringSeconds} seconds',
                    style: context.text.titleSmall,
                  ),
                ],
              ),
            ),
            Semantics(
              label:
                  'Ring for ${plan.ringSeconds} seconds before Orvia answers',
              child: Slider(
                value: plan.ringSeconds.toDouble(),
                min: ForwardingPlan.minRingSeconds.toDouble(),
                max: ForwardingPlan.maxRingSeconds.toDouble(),
                divisions: 5,
                label: '${plan.ringSeconds}s',
                activeColor: c.ink,
                onChanged: p.busy
                    ? null
                    : (v) =>
                          p.updatePlan(plan.copyWith(ringSeconds: v.round())),
              ),
            ),
            SwitchListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: kGutter),
              title: const Text('Also when I am on another call'),
              value: plan.includeBusy,
              onChanged: p.busy
                  ? null
                  : (v) => p.updatePlan(plan.copyWith(includeBusy: v)),
            ),
            SwitchListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: kGutter),
              title: const Text('Also when my phone is off or has no signal'),
              value: plan.includeUnreachable,
              onChanged: p.busy
                  ? null
                  : (v) => p.updatePlan(plan.copyWith(includeUnreachable: v)),
            ),
          ],

          // ── SIM ──
          if (p.sims.length > 1) ...[
            const SectionTitle('Which SIM?'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Wrap(
                spacing: 8,
                children: [
                  for (final sim in p.sims)
                    ChoiceChip(
                      label: Text(sim.label),
                      selected:
                          p.selectedSim?.subscriptionId == sim.subscriptionId,
                      onSelected: p.busy ? null : (_) => p.selectSim(sim),
                    ),
                ],
              ),
            ),
          ],

          // ── permission and device ──
          if (!p.caps.hasTelephony)
            const _Note(
              tone: Tone.warn,
              text: 'This device has no phone service, so it cannot forward calls. You can still read calls and bookings here.',
            )
          else if (!p.caps.simReady)
            const _Note(
              tone: Tone.warn,
              text: 'No SIM card is ready. Insert your SIM, then come back.',
            )
          else if (p.needsPermission) ...[
            const SectionTitle('Allow phone access'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text(
                'Orvia needs this to send the forwarding codes to your carrier. It never listens to your calls, and it does not read your contacts or messages.',
                style: context.text.bodyMedium?.copyWith(color: c.muted),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(kGutter, 14, kGutter, 0),
              child: p.permissionBlockedForever
                  ? OutlinedButton(
                      onPressed: p.openPermissionSettings,
                      child: const Text('Open app settings'),
                    )
                  : FilledButton(
                      onPressed: p.busy ? null : p.requestPermission,
                      child: const Text('Allow phone access'),
                    ),
            ),
          ],

          // ── act ──
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter),
            child: Column(
              children: [
                FilledButton(
                  onPressed: (p.busy || p.target == null || !p.canAutomate)
                      ? null
                      : p.turnOn,
                  child: p.busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        )
                      : Text(on ? 'Update forwarding' : 'Turn on forwarding'),
                ),
                if (on || p.state.phase == ForwardingPhase.paused) ...[
                  const SizedBox(height: 10),
                  if (on)
                    OutlinedButton(
                      onPressed: p.busy ? null : p.pause,
                      child: const Text('Pause Orvia'),
                    )
                  else
                    OutlinedButton(
                      onPressed: p.busy ? null : p.resume,
                      child: const Text('Turn Orvia back on'),
                    ),
                ],
              ],
            ),
          ),

          if (p.task != null) _PhoneAppCard(p: p, task: p.task!),

          if (p.task == null && p.lastReport != null && p.lastReport!.steps.isNotEmpty)
            _Results(report: p.lastReport!.steps),

          // ── test ──
          if (p.state.phase == ForwardingPhase.activeUnverified)
            const _TestCard(),

          // ── status ──
          if (p.canAutomate && p.state.phase != ForwardingPhase.notSetUp)
            _StatusCard(p: p),

          // ── manual ──
          _Manual(p: p, forceOpen: p.lastReport?.suggestManual ?? false),

          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 28, kGutter, 0),
            child: Text(
              'Your carrier decides what forwarded calls cost, and some charge for forwarding to a number outside your country. Ask them before relying on it.',
              style: context.text.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.tone, required this.text});

  final Tone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = tone == Tone.warn
        ? (c.warnSoft, c.warnInk)
        : (c.badSoft, c.badInk);
    return Container(
      margin: const EdgeInsets.fromLTRB(kGutter, 16, kGutter, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: context.text.bodyMedium?.copyWith(color: fg)),
    );
  }
}

class _ModeOption extends StatelessWidget {
  const _ModeOption({
    required this.selected,
    required this.title,
    required this.body,
    required this.onTap,
    this.badge,
  });

  final bool selected;
  final String title;
  final String body;
  final String? badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selected,
      button: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: kGutter),
        child: Material(
          color: c.surface,
          // Outline follows the theme fade (see Sheet).
          animationDuration: Duration.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(
              color: selected ? c.ink : c.line,
              width: selected ? 1.5 : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Icon(
                      selected
                          ? Icons.radio_button_checked_rounded
                          : Icons.radio_button_unchecked_rounded,
                      color: selected ? c.ink : c.muted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                title,
                                style: context.text.titleSmall,
                              ),
                            ),
                            if (badge != null) ...[
                              const SizedBox(width: 8),
                              Pill(badge!, tone: Tone.good),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          body,
                          style: context.text.bodySmall?.copyWith(
                            color: c.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.report});

  final List<StepResult> report;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('What your carrier said'),
        Sheet(
          children: [
            for (final r in report)
              LedgerRow(
                leading: IconDisc(
                  switch (r.outcome) {
                    StepOutcome.success => Icons.check_rounded,
                    StepOutcome.unconfirmed => Icons.help_outline_rounded,
                    StepOutcome.failure => Icons.close_rounded,
                  },
                  tone: switch (r.outcome) {
                    StepOutcome.success => Tone.good,
                    StepOutcome.unconfirmed => Tone.warn,
                    StepOutcome.failure => Tone.bad,
                  },
                  size: 34,
                ),
                title: Text(r.step.description, style: context.text.titleSmall),
                subtitle: Text(
                  r.detail,
                  style: context.text.bodySmall?.copyWith(color: c.muted),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _TestCard extends StatelessWidget {
  const _TestCard();

  @override
  Widget build(BuildContext context) {
    final p = context.read<PhoneSetupController>();
    final c = context.c;
    return Container(
      margin: const EdgeInsets.fromLTRB(kGutter, 24, kGutter, 0),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: c.goodSoft,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Test it once',
            style: context.text.titleMedium?.copyWith(color: c.goodInk),
          ),
          const SizedBox(height: 6),
          Text(
            'Ring this phone from another number and do not answer. After a few rings Orvia picks up. This card turns green when the call arrives.',
            style: context.text.bodyMedium?.copyWith(color: c.goodInk),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: c.goodInk,
              side: BorderSide(color: c.goodInk.withValues(alpha: 0.4)),
            ),
            onPressed: () async {
              final ok = await p.checkForTestCall();
              if (context.mounted) {
                showMessage(
                  context,
                  ok
                      ? 'Test call received. Orvia is working.'
                      : 'No call yet. Try again in a moment.',
                );
              }
            },
            child: const Text('I made a test call'),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.p});

  final PhoneSetupController p;

  @override
  Widget build(BuildContext context) {
    final s = p.lastStatus;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('Check with your carrier'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: kGutter),
          child: Text(
            'Asks your carrier what is switched on right now. Useful after changing SIM or phone.',
            style: context.text.bodySmall,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(kGutter, 12, kGutter, 0),
          child: OutlinedButton(
            onPressed: p.busy ? null : p.checkStatus,
            child: const Text('Check now'),
          ),
        ),
        if (s != null && !s.needsPhoneApp)
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 12, kGutter, 0),
            child: Text(
              s.diverged
                  ? (s.allInactive
                        ? 'Forwarding was off at your carrier, so the app now shows it as paused. Turn it on again to cover your calls.'
                        : 'Forwarding is on at your carrier, so the app now shows it as on.')
                  : s.allActive
                  ? 'Your carrier confirms forwarding is on.'
                  : s.allInactive
                  ? 'Your carrier says forwarding is off.'
                  : 'Your carrier gave an unclear answer. The raw replies are below.',
              style: context.text.bodyMedium,
            ),
          ),
        if (s != null && !s.definitive) _Results(report: s.steps),
      ],
    );
  }
}

class _Manual extends StatefulWidget {
  const _Manual({required this.p, required this.forceOpen});

  final PhoneSetupController p;
  final bool forceOpen;

  @override
  State<_Manual> createState() => _ManualState();
}

class _ManualState extends State<_Manual> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final open = _open || widget.forceOpen;
    if (p.target == null) return const SizedBox.shrink();
    final c = context.c;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        SectionTitle(
          'Set it up by hand',
          trailing: TextButton(
            onPressed: () => setState(() => _open = !open),
            child: Text(open ? 'Hide' : 'Show'),
          ),
        ),
        if (open) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter),
            child: Text(
              'If your phone will not let the app do this, open the dialer, type each code and press call. Wait for your carrier to confirm before the next one.',
              style: context.text.bodyMedium?.copyWith(color: c.muted),
            ),
          ),
          const SizedBox(height: 12),
          Sheet(
            children: [
              for (final step in p.manualSteps) _CodeRow(step: step, p: p),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 16, kGutter, 0),
            child: Text('To turn it off', style: context.text.titleSmall),
          ),
          const SizedBox(height: 8),
          Sheet(
            children: [
              for (final step in p.manualOffSteps) _CodeRow(step: step, p: p),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 16, kGutter, 0),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: p.busy ? null : () => p.recordManual(on: true),
                    child: const Text('I turned it on'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: p.busy ? null : () => p.recordManual(on: false),
                    child: const Text('I turned it off'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Write the number without +'),
              subtitle: const Text(
                'Some carriers reject the plus sign. Turn this on if the codes fail.',
              ),
              value: p.plan.format == DestinationFormat.digitsOnly,
              onChanged: (v) => p.updatePlan(
                p.plan.copyWith(
                  format: v
                      ? DestinationFormat.digitsOnly
                      : DestinationFormat.e164Plus,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CodeRow extends StatelessWidget {
  const _CodeRow({required this.step, required this.p});

  final UssdStep step;
  final PhoneSetupController p;

  @override
  Widget build(BuildContext context) {
    return LedgerRow(
      title: SelectableText(
        step.code,
        style: context.text.titleSmall?.copyWith(letterSpacing: 0.4),
      ),
      subtitle: Text(step.description, style: context.text.bodySmall),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'Copy code',
            icon: const Icon(Icons.copy_rounded, size: 20),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: step.code));
              if (context.mounted) showMessage(context, 'Code copied');
            },
          ),
          IconButton(
            tooltip: 'Open dialer with this code',
            icon: const Icon(Icons.dialpad_rounded, size: 20),
            onPressed: () async {
              final ok = await p.openDialer(step);
              if (!ok && context.mounted) {
                showMessage(context, 'Could not open the dialer.');
              }
            },
          ),
        ],
      ),
    );
  }
}

/// Sends the codes through the Phone app one at a time. The Phone app shows
/// the carrier's reply; the owner tells us what it said.
class _PhoneAppCard extends StatelessWidget {
  const _PhoneAppCard({required this.p, required this.task});

  final PhoneSetupController p;
  final PhoneAppTask task;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final total = task.steps.length;
    final query = task.purpose == StepPurpose.query;
    final title = switch (task.purpose) {
      StepPurpose.activate => 'Finish in your Phone app',
      StepPurpose.deactivate => 'Pause in your Phone app',
      StepPurpose.query => 'Check in your Phone app',
    };
    final intro = query
        ? 'Your carrier answers this in the Phone app. Send the code and read the reply on screen.'
        : 'Your network only accepts these codes from the Phone app. Send ${total == 1 ? 'it' : 'each one'}, then read your carrier\'s reply on screen.';

    return Container(
      margin: const EdgeInsets.fromLTRB(kGutter, 24, kGutter, 0),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.ink, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleMedium),
          const SizedBox(height: 6),
          Text(intro, style: context.text.bodyMedium?.copyWith(color: c.muted)),
          const SizedBox(height: 14),
          for (var i = 0; i < total; i++) _TaskStepRow(step: task.steps[i], state: _stateOf(i)),
          const SizedBox(height: 12),
          ..._actions(context),
        ],
      ),
    );
  }

  _StepState _stateOf(int i) => i < task.index
      ? _StepState.done
      : i == task.index
          ? (task.failed ? _StepState.failed : _StepState.current)
          : _StepState.waiting;

  List<Widget> _actions(BuildContext context) {
    final c = context.c;
    final total = task.steps.length;
    final n = task.index + 1;
    final sendLabel = total == 1 ? 'Send code' : 'Send code $n of $total';

    if (task.sent) {
      final query = task.purpose == StepPurpose.query;
      return [
        Text(
          query ? 'Read your carrier\'s reply, then come back here.' : 'Did your phone say it worked?',
          style: context.text.titleSmall,
        ),
        const SizedBox(height: 10),
        if (query)
          FilledButton(onPressed: () => p.confirmTaskStep(worked: true), child: const Text('Done'))
        else
          Row(
            children: [
              Expanded(
                child: FilledButton(onPressed: () => p.confirmTaskStep(worked: true), child: const Text('Yes, it worked')),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(onPressed: () => p.confirmTaskStep(worked: false), child: const Text('No')),
              ),
            ],
          ),
        TextButton(onPressed: p.sendTaskStep, child: const Text('Send it again')),
      ];
    }

    return [
      if (task.failed) ...[
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.warnSoft, borderRadius: BorderRadius.circular(12)),
          child: Text(
            'Your carrier refused it. Turn on "Write the number without +" under Set it up by hand and send again. '
            'If it still fails, ask your carrier to allow call forwarding to this number.',
            style: context.text.bodyMedium?.copyWith(color: c.warnInk),
          ),
        ),
        const SizedBox(height: 12),
      ],
      FilledButton.icon(
        onPressed: p.sendTaskStep,
        icon: const Icon(Icons.call_rounded, size: 20),
        label: Text(task.failed ? 'Send again' : sendLabel),
      ),
      Align(
        alignment: Alignment.center,
        child: TextButton(onPressed: p.cancelTask, child: const Text('Cancel')),
      ),
    ];
  }
}

enum _StepState { done, current, failed, waiting }

class _TaskStepRow extends StatelessWidget {
  const _TaskStepRow({required this.step, required this.state});

  final UssdStep step;
  final _StepState state;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (icon, color) = switch (state) {
      _StepState.done => (Icons.check_circle_rounded, c.good),
      _StepState.current => (Icons.radio_button_checked_rounded, c.ink),
      _StepState.failed => (Icons.error_rounded, c.bad),
      _StepState.waiting => (Icons.radio_button_unchecked_rounded, c.muted),
    };
    final dim = state == _StepState.waiting;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 20, color: color)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(step.description, style: context.text.titleSmall?.copyWith(color: dim ? c.muted : c.ink)),
                Text(step.code, style: context.text.bodySmall?.copyWith(letterSpacing: 0.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
