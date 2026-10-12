import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app_dependencies.dart';
import '../../core/format.dart';
import '../../core/phone.dart';
import '../../data/models/models.dart';
import '../../state/followups_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';

enum _Section { callbacks, leads }

class FollowUpsScreen extends StatefulWidget {
  const FollowUpsScreen({super.key});

  @override
  State<FollowUpsScreen> createState() => _FollowUpsScreenState();
}

class _FollowUpsScreenState extends State<FollowUpsScreen> {
  _Section _section = _Section.callbacks;

  @override
  Widget build(BuildContext context) {
    final c = context.watch<FollowUpsController>();

    if (c.actionError != null) {
      final message = c.actionError!;
      c.clearActionError();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) showMessage(context, message);
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Follow up')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 6),
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(c.callbacks.isEmpty ? 'Call back' : 'Call back (${c.callbacks.length})'),
                  selected: _section == _Section.callbacks,
                  onSelected: (_) => setState(() => _section = _Section.callbacks),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(c.leads.isEmpty ? 'Leads' : 'Leads (${c.leads.length})'),
                  selected: _section == _Section.leads,
                  onSelected: (_) => setState(() => _section = _Section.leads),
                ),
              ],
            ),
          ),
          if (c.error != null && (c.callbacks.isNotEmpty || c.leads.isNotEmpty))
            ErrorBanner(c.error!, onRetry: c.refresh),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => c.refresh(silent: true),
              child: _section == _Section.callbacks ? _callbacks(context, c) : _leads(context, c),
            ),
          ),
        ],
      ),
    );
  }

  Widget _empty(BuildContext context, FollowUpsController c, IconData icon, String title, String message) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: 420,
          child: c.error != null
              ? EmptyState(
                  icon: Icons.wifi_off_rounded,
                  title: 'Could not load this list',
                  message: c.error!,
                  action: OutlinedButton(onPressed: c.refresh, child: const Text('Try again')),
                )
              : EmptyState(icon: icon, title: title, message: message),
        ),
      ],
    );
  }

  Widget _callbacks(BuildContext context, FollowUpsController c) {
    if (c.loading && c.callbacks.isEmpty) return ListView(children: const [SkeletonList(rows: 4)]);
    if (c.callbacks.isEmpty) {
      return _empty(context, c, Icons.check_circle_outline_rounded, 'Nobody is waiting on you',
          'When a caller could not be helped, they appear here so you can ring them back.');
    }
    final now = context.read<AppDependencies>().now();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(top: 8, bottom: 32),
      children: [
        Sheet(children: [
          for (final f in c.callbacks)
            LedgerRow(
              leading: IconDisc(
                f.kind == FollowUpKind.missedCallback ? Icons.phone_missed_rounded : Icons.event_busy_rounded,
                tone: f.isUrgent ? Tone.bad : Tone.warn,
              ),
              title: Text(
                f.callerName?.trim().isNotEmpty == true ? f.callerName! : Phone.display(f.callerPhone),
                style: context.text.titleSmall,
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      f.kind == FollowUpKind.missedCallback
                          ? 'Missed call, ${Fmt.ago(f.createdAt, now: now)}'
                          : 'Wanted to book${f.serviceNeeded == null ? '' : ' ${f.serviceNeeded}'}, ${Fmt.ago(f.createdAt, now: now)}',
                      style: context.text.bodySmall,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (Phone.toE164(f.callerPhone) != null)
                          FilledButton.icon(
                            style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 16)),
                            onPressed: () => _dial(context, f.callerPhone!),
                            icon: const Icon(Icons.call_rounded, size: 18),
                            label: const Text('Call'),
                          ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 16)),
                          onPressed: () => c.markHandled(f),
                          child: const Text('Done'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              trailing: f.isUrgent ? const Pill('Urgent', tone: Tone.bad) : null,
            ),
        ]),
      ],
    );
  }

  Widget _leads(BuildContext context, FollowUpsController c) {
    if (c.loading && c.leads.isEmpty) return ListView(children: const [SkeletonList(rows: 4)]);
    if (c.leads.isEmpty) {
      return _empty(context, c, Icons.person_search_outlined, 'No open leads',
          'People who gave Orvia their details but have not booked yet appear here.');
    }
    final now = context.read<AppDependencies>().now();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(top: 8, bottom: 32),
      children: [
        Sheet(children: [
          for (final l in c.leads)
            LedgerRow(
              leading: IconDisc(
                Icons.person_outline_rounded,
                tone: l.urgency == LeadUrgency.emergency || l.urgency == LeadUrgency.urgent ? Tone.bad : Tone.neutral,
              ),
              title: Text(l.name?.trim().isNotEmpty == true ? l.name! : Phone.display(l.phone), style: context.text.titleSmall),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      [if (l.serviceNeeded != null) l.serviceNeeded!, Fmt.ago(l.createdAt, now: now)].join(', '),
                      style: context.text.bodySmall,
                    ),
                    const SizedBox(height: 6),
                    Wrap(spacing: 8, children: [
                      Pill(l.status == LeadStatus.newLead ? 'New' : 'Contacted', tone: l.status == LeadStatus.newLead ? Tone.warn : Tone.neutral),
                      if (l.urgency == LeadUrgency.emergency || l.urgency == LeadUrgency.urgent)
                        Pill(l.urgency == LeadUrgency.emergency ? 'Emergency' : 'Urgent', tone: Tone.bad),
                    ]),
                  ],
                ),
              ),
              // A status, or null for "call them".
              trailing: PopupMenuButton<_LeadAction>(
                tooltip: 'Lead actions',
                icon: Icon(Icons.more_horiz_rounded, color: context.c.muted),
                onSelected: (a) => a.status == null ? _dial(context, l.phone) : c.setLeadStatus(l, a.status!),
                itemBuilder: (_) => [
                  if (Phone.toE164(l.phone) != null) const PopupMenuItem(value: _LeadAction(null), child: Text('Call')),
                  if (l.status == LeadStatus.newLead)
                    const PopupMenuItem(value: _LeadAction(LeadStatus.contacted), child: Text('Mark as contacted')),
                  const PopupMenuItem(value: _LeadAction(LeadStatus.booked), child: Text('Mark as booked')),
                  const PopupMenuItem(value: _LeadAction(LeadStatus.closed), child: Text('Mark as closed')),
                  const PopupMenuItem(value: _LeadAction(LeadStatus.lost), child: Text('Mark as lost')),
                ],
              ),
            ),
        ]),
      ],
    );
  }

  Future<void> _dial(BuildContext context, String number) async {
    final ok = await launchUrl(Phone.telUri(number));
    if (!ok && context.mounted) showMessage(context, 'No phone app available to place the call.');
  }
}

@immutable
class _LeadAction {
  const _LeadAction(this.status);

  final LeadStatus? status;
}
