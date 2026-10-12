import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app_dependencies.dart';
import '../../core/format.dart';
import '../../core/phone.dart';
import '../../data/models/models.dart';
import '../../data/orvia_api.dart';
import '../../state/appointments_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';

class AppointmentsScreen extends StatelessWidget {
  const AppointmentsScreen({super.key});

  /// "Today", "Tomorrow", "Mon 12 Oct".
  static String dayLabel(DateTime day, DateTime now) {
    bool same(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
    if (same(day, now)) return 'Today';
    if (same(day, now.add(const Duration(days: 1)))) return 'Tomorrow';
    if (same(day, now.subtract(const Duration(days: 1)))) return 'Yesterday';
    return DateFormat(day.year == now.year ? 'EEE d MMM' : 'EEE d MMM y').format(day);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AppointmentsController>();
    final now = context.read<AppDependencies>().now();

    // A rolled-back change tells the owner once.
    if (c.actionError != null) {
      final message = c.actionError!;
      c.clearActionError();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) showMessage(context, message);
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Bookings')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 6),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('Upcoming'),
                  selected: c.range == AppointmentRange.upcoming,
                  onSelected: (_) => c.setRange(AppointmentRange.upcoming),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Past'),
                  selected: c.range == AppointmentRange.past,
                  onSelected: (_) => c.setRange(AppointmentRange.past),
                ),
              ],
            ),
          ),
          if (c.error != null && c.items.isNotEmpty) ErrorBanner(c.error!, onRetry: c.refresh),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => c.refresh(silent: true),
              child: _body(context, c, now),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, AppointmentsController c, DateTime now) {
    if (c.loading && c.items.isEmpty) return ListView(children: const [SkeletonList(rows: 4)]);
    if (c.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 420,
            child: c.error != null
                ? EmptyState(
                    icon: Icons.wifi_off_rounded,
                    title: 'Could not load bookings',
                    message: c.error!,
                    action: OutlinedButton(onPressed: c.refresh, child: const Text('Try again')),
                  )
                : EmptyState(
                    icon: Icons.event_outlined,
                    title: c.range == AppointmentRange.upcoming ? 'No upcoming bookings' : 'No past bookings',
                    message: c.range == AppointmentRange.upcoming
                        ? 'When Orvia books someone in, it shows up here with the time and what they came for.'
                        : 'Bookings from before today appear here.',
                  ),
          ),
        ],
      );
    }

    // Group consecutive appointments by calendar day.
    final groups = <DateTime, List<Appointment>>{};
    for (final a in c.items) {
      final day = DateTime(a.start.year, a.start.month, a.start.day);
      groups.putIfAbsent(day, () => []).add(a);
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        for (final entry in groups.entries) ...[
          SectionTitle(dayLabel(entry.key, now), padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 8)),
          Sheet(children: [for (final a in entry.value) _AppointmentRow(a: a, controller: c)]),
        ],
      ],
    );
  }
}

class _AppointmentRow extends StatelessWidget {
  const _AppointmentRow({required this.a, required this.controller});

  final Appointment a;
  final AppointmentsController controller;

  Future<void> _confirmCancel(BuildContext context) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: Text('${a.customerName} will not be told automatically. You may want to call them.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep booking')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: ctx.c.bad),
            child: const Text('Cancel booking'),
          ),
        ],
      ),
    );
    if (sure == true) await controller.setStatus(a, AppointmentStatus.cancelled);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (label, tone) = switch (a.status) {
      AppointmentStatus.confirmed => ('Confirmed', Tone.good),
      AppointmentStatus.rescheduled => ('Rescheduled', Tone.warn),
      AppointmentStatus.completed => ('Done', Tone.neutral),
      AppointmentStatus.noShow => ('No-show', Tone.bad),
      AppointmentStatus.cancelled => ('Cancelled', Tone.bad),
    };
    final canCall = Phone.toE164(a.customerPhone) != null;

    return LedgerRow(
      semanticLabel: '${a.customerName}, ${Fmt.clock(a.start)}, $label',
      leading: SizedBox(
        width: 72,
        child: Text(
          Fmt.clock(a.start),
          maxLines: 1,
          softWrap: false,
          style: context.text.titleSmall?.copyWith(color: a.isOpen ? c.ink : c.muted),
        ),
      ),
      title: Text(a.customerName, style: context.text.titleSmall),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (a.serviceType != null) Text(a.serviceType!, style: context.text.bodySmall),
            Pill(label, tone: tone),
          ],
        ),
      ),
      trailing: PopupMenuButton<String>(
        tooltip: 'Booking actions',
        icon: Icon(Icons.more_horiz_rounded, color: c.muted),
        onSelected: (v) async {
          switch (v) {
            case 'call':
              final ok = await launchUrl(Phone.telUri(a.customerPhone));
              if (!ok && context.mounted) showMessage(context, 'No phone app available to place the call.');
            case 'done':
              await controller.setStatus(a, AppointmentStatus.completed);
            case 'noshow':
              await controller.setStatus(a, AppointmentStatus.noShow);
            case 'cancel':
              await _confirmCancel(context);
            case 'reopen':
              await controller.setStatus(a, AppointmentStatus.confirmed);
          }
        },
        itemBuilder: (_) => [
          if (canCall) const PopupMenuItem(value: 'call', child: Text('Call')),
          if (a.isOpen) ...const [
            PopupMenuItem(value: 'done', child: Text('Mark as done')),
            PopupMenuItem(value: 'noshow', child: Text('Mark as no-show')),
            PopupMenuItem(value: 'cancel', child: Text('Cancel booking')),
          ] else
            const PopupMenuItem(value: 'reopen', child: Text('Move back to confirmed')),
        ],
      ),
    );
  }
}
