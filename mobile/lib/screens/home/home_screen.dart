import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_dependencies.dart';
import '../../core/format.dart';
import '../../data/auth_repository.dart';
import '../../data/models/models.dart';
import '../../state/home_controller.dart';
import '../../state/phone_setup_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import '../../widgets/phone_line.dart';
import '../calls/call_detail_screen.dart';
import '../calls/call_tile.dart';
import '../phone/phone_setup_screen.dart';
import 'hero_model.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onOpenTab});

  /// Switches the bottom navigation (index into the shell's tabs).
  final ValueChanged<int> onOpenTab;

  static String greeting(DateTime now) {
    final h = now.hour;
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  static const _titles = {'dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'sir'};

  /// The name to greet by: the first word that is not a title ("Dr. Rao" gives
  /// "Rao"; "Asha Rao" gives "Asha").
  static String firstName(String? fullName) {
    final words = (fullName ?? '').trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '';
    final plain = words.where((w) => !_titles.contains(w.toLowerCase().replaceAll('.', ''))).toList();
    return plain.isEmpty ? words.first : plain.first;
  }

  @override
  Widget build(BuildContext context) {
    final home = context.watch<HomeController>();
    final phone = context.watch<PhoneSetupController>();
    final profile = context.read<Profile>();
    final now = context.read<AppDependencies>().now();
    final o = home.overview;
    final first = firstName(profile.fullName);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => home.refresh(silent: true),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      first.isEmpty ? greeting(now) : '${greeting(now)}, $first',
                      style: context.text.headlineMedium,
                    ),
                    if (o != null) ...[
                      const SizedBox(height: 2),
                      Text(o.businessName, style: context.text.bodyMedium?.copyWith(color: context.c.muted)),
                    ],
                  ],
                ),
              ),
              if (home.error != null && o != null) ErrorBanner(home.error!, onRetry: home.refresh),
              const SizedBox(height: 18),
              if (home.loading && o == null)
                const _HeroSkeleton()
              else if (o == null)
                _NoData(error: home.error, onRetry: home.refresh)
              else ...[
                _Hero(model: HeroModel.from(forwarding: phone.state, overview: o), phone: phone),
                _Stats(o: o),
                _Attention(home: home, onOpenTab: onOpenTab),
                _Minutes(o: o),
                SectionTitle(
                  'Recent calls',
                  trailing: home.recentCalls.isEmpty ? null : TextButton(onPressed: () => onOpenTab(1), child: const Text('See all')),
                ),
                if (home.recentCalls.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: kGutter),
                    child: Text(
                      'Calls Orvia answers will appear here.',
                      style: context.text.bodyMedium?.copyWith(color: context.c.muted),
                    ),
                  )
                else
                  Sheet(
                    children: [
                      for (final call in home.recentCalls)
                        CallTile(
                          call: call,
                          now: now,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(builder: (_) => CallDetailScreen(initial: call)),
                          ),
                        ),
                    ],
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroSkeleton extends StatelessWidget {
  const _HeroSkeleton();

  @override
  Widget build(BuildContext context) => Container(
        height: 220,
        margin: const EdgeInsets.symmetric(horizontal: kGutter),
        decoration: BoxDecoration(color: context.c.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: context.c.line)),
        child: const Center(child: CircularProgressIndicator()),
      );
}

class _NoData extends StatelessWidget {
  const _NoData({required this.error, required this.onRetry});

  final String? error;
  final Future<void> Function({bool silent}) onRetry;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 380,
        child: EmptyState(
          icon: Icons.wifi_off_rounded,
          title: 'Could not load your business',
          message: error ?? 'Pull down to try again.',
          action: OutlinedButton(onPressed: () => onRetry(), child: const Text('Try again')),
        ),
      );
}

class _Hero extends StatelessWidget {
  const _Hero({required this.model, required this.phone});

  final HeroModel model;
  final PhoneSetupController phone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final on = model.line == LineState.covering || model.line == LineState.live;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: kGutter),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: on ? c.good.withValues(alpha: 0.5) : c.line, width: on ? 1.5 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PhoneLine(state: model.line),
          const SizedBox(height: 16),
          Semantics(header: true, child: Text(model.title, style: context.text.titleLarge)),
          const SizedBox(height: 6),
          Text(model.subtitle, style: context.text.bodyMedium?.copyWith(color: c.muted)),
          if (phone.error != null) ...[
            const SizedBox(height: 10),
            Text(phone.error!, style: context.text.bodyMedium?.copyWith(color: c.bad)),
          ],
          if (model.primary != null || model.secondary != null) const SizedBox(height: 18),
          if (model.primary != null)
            FilledButton(
              onPressed: phone.busy ? null : () => _run(context, model.primary!),
              child: phone.busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : Text(model.primaryLabel!),
            ),
          if (model.secondary != null) ...[
            if (model.primary != null) const SizedBox(height: 8),
            model.primary == null
                ? OutlinedButton(
                    onPressed: phone.busy ? null : () => _run(context, model.secondary!),
                    child: Text(model.secondaryLabel!),
                  )
                : TextButton(
                    onPressed: phone.busy ? null : () => _run(context, model.secondary!),
                    child: Text(model.secondaryLabel!),
                  ),
          ],
        ],
      ),
    );
  }

  Future<void> _run(BuildContext context, HeroAction action) async {
    switch (action) {
      case HeroAction.connect:
      case HeroAction.openDetails:
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PhoneSetupScreen()));
      case HeroAction.pause:
        final sure = await confirmPause(context);
        if (sure != true || !context.mounted) return;
        final report = await phone.pause();
        if (!context.mounted) return;
        if (report != null && report.needsPhoneApp) {
          // The Phone app has to send it; the connection screen walks through it.
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PhoneSetupScreen()));
        } else if (report != null && (report.suggestManual || report.blocked)) {
          showMessage(context, 'Could not switch forwarding off from here. Open Details for the manual steps.');
        } else if (report != null) {
          showMessage(context, 'Orvia is paused. Calls ring normally.');
        }
      case HeroAction.resume:
        final report = await phone.resume();
        if (!context.mounted) return;
        if (report != null && report.needsPhoneApp) {
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PhoneSetupScreen()));
        } else if (report != null && !report.allFailed) {
          showMessage(context, 'Orvia is covering your phone again.');
        } else if (report != null) {
          showMessage(context, 'Could not switch forwarding on. Open Details for the manual steps.');
        }
      case HeroAction.checkTestCall:
        final ok = await phone.checkForTestCall();
        if (!context.mounted) return;
        showMessage(
          context,
          ok ? 'Test call received. Orvia is working.' : 'No test call yet. Call this phone from another number and let it ring.',
        );
    }
  }
}

Future<bool?> confirmPause(BuildContext context) => showModalBottomSheet<bool>(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(kGutter, 4, kGutter, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Pause Orvia?', style: ctx.text.titleLarge),
            const SizedBox(height: 8),
            Text(
              'Calls you miss will go unanswered again until you turn Orvia back on.',
              style: ctx.text.bodyMedium?.copyWith(color: ctx.c.muted),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Pause Orvia')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep it on')),
          ],
        ),
      ),
    );

class _Stats extends StatelessWidget {
  const _Stats({required this.o});

  final Overview o;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget cell(String value, String label, {Color? color}) => Expanded(
          child: Semantics(
            label: '$value $label',
            child: ExcludeSemantics(
              child: Column(
                children: [
                  Text(value, style: context.text.displayMedium?.copyWith(color: color)),
                  const SizedBox(height: 4),
                  Text(label, style: context.text.labelSmall),
                ],
              ),
            ),
          ),
        );
    final divider = SizedBox(height: 44, child: VerticalDivider(color: c.line, width: 1));

    return Padding(
      padding: const EdgeInsets.fromLTRB(kGutter, 28, kGutter, 0),
      child: Row(
        children: [
          cell('${o.callsToday}', 'calls today'),
          divider,
          cell('${o.appointmentsToday}', 'booked'),
          divider,
          cell('${o.missedToday}', 'missed', color: o.missedToday > 0 ? c.bad : null),
        ],
      ),
    );
  }
}

class _Attention extends StatelessWidget {
  const _Attention({required this.home, required this.onOpenTab});

  final HomeController home;
  final ValueChanged<int> onOpenTab;

  @override
  Widget build(BuildContext context) {
    final o = home.overview!;
    final events = home.events;
    if (events.isEmpty && o.pendingFollowUps == 0) return const SizedBox.shrink();

    final rows = <Widget>[
      if (o.pendingFollowUps > 0)
        LedgerRow(
          onTap: () => onOpenTab(3),
          leading: const IconDisc(Icons.reply_rounded, tone: Tone.warn),
          title: Text(
            o.pendingFollowUps == 1 ? '1 person to call back' : '${o.pendingFollowUps} people to call back',
            style: context.text.titleSmall,
          ),
          subtitle: Text('Missed calls and unfinished bookings', style: context.text.bodySmall),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      for (final e in events.take(3))
        LedgerRow(
          leading: IconDisc(
            e.severity == Severity.critical ? Icons.error_rounded : Icons.info_outline_rounded,
            tone: e.severity == Severity.critical ? Tone.bad : Tone.warn,
          ),
          title: Text(e.title, style: context.text.titleSmall),
          subtitle: Text(Fmt.ago(e.createdAt, now: DateTime.now()), style: context.text.bodySmall),
          trailing: TextButton(onPressed: () => home.resolveEvent(e), child: const Text('Dismiss')),
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionTitle('Needs your attention'),
        Sheet(children: rows),
      ],
    );
  }
}

class _Minutes extends StatelessWidget {
  const _Minutes({required this.o});

  final Overview o;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final low = o.lowOnMinutes || !o.canAnswer;
    return Padding(
      padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 0),
      child: Row(
        children: [
          Icon(Icons.timer_outlined, size: 18, color: low ? c.warn : c.muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              o.secondsRemaining <= 0 && o.allowOverage
                  ? 'Out of included minutes. Calls continue as overage.'
                  : '${Fmt.minutesLeft(o.secondsRemaining)} of call time left',
              style: context.text.bodyMedium?.copyWith(color: low ? c.warnInk : c.muted),
            ),
          ),
        ],
      ),
    );
  }
}
