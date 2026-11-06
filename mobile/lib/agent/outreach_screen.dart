import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/format.dart';
import '../core/phone.dart';
import '../theme/palette.dart';
import '../widgets/common.dart';
import 'outreach.dart';

/// Outreach tab: numbers the owner typed, a Call button each, and how each call
/// went. One call at a time, always started by a tap.
class OutreachScreen extends StatefulWidget {
  const OutreachScreen({super.key, this.store});

  /// Injected in tests; the real app opens shared preferences.
  final OutreachStore? store;

  @override
  State<OutreachScreen> createState() => _OutreachScreenState();
}

class _OutreachScreenState extends State<OutreachScreen> {
  OutreachStore? _store;
  List<OutreachContact> _contacts = const [];
  OutreachOffer _offer = OutreachOffer.fallback;
  List<OutreachCallRecord> _calls = const [];
  OutreachStatus _status = const OutreachStatus(phase: 'idle');
  Timer? _poll;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(milliseconds: 1500), (_) => _refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final store = widget.store ?? await OutreachStore.open();
    if (!mounted) return;
    setState(() {
      _store = store;
      _contacts = store.contacts();
      _offer = store.offer();
    });
    await _refresh(withCalls: true);
  }

  Future<void> _refresh({bool withCalls = false}) async {
    try {
      final status = await Outreach.status();
      // Reload results whenever a call finishes, and whenever the phase moved on while
      // this page was not polling (app in the background during the whole call).
      final finished = _status.busy && !status.busy;
      final moved = status.phase != _status.phase;
      final calls = (withCalls || finished || moved) ? await Outreach.calls() : null;
      if (!mounted) return;
      setState(() {
        _status = status;
        if (calls != null) _calls = calls;
      });
      if (finished && status.error != null && mounted) showMessage(context, status.error!);
    } on PlatformException catch (_) {}
  }

  OutreachCallRecord? _lastCall(String contactId) {
    for (final c in _calls) {
      if (c.contactId == contactId) return c;
    }
    return null;
  }

  bool _doNotCall(String contactId) => _calls.any((c) => c.contactId == contactId && c.outcome == 'do_not_call');

  Future<void> _call(OutreachContact contact) async {
    setState(() => _starting = true);
    try {
      await Outreach.call(contact, _offer);
      await _refresh();
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? 'Could not start the call');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _addContact() async {
    final contact = await showDialog<OutreachContact>(context: context, builder: (_) => const _ContactDialog());
    if (contact == null || _store == null) return;
    final next = [..._contacts, contact];
    await _store!.saveContacts(next);
    if (mounted) setState(() => _contacts = next);
  }

  Future<void> _removeContact(OutreachContact contact) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this number?'),
        content: Text(Phone.display(contact.number)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (sure != true || _store == null) return;
    final next = _contacts.where((c) => c.id != contact.id).toList();
    await _store!.saveContacts(next);
    if (mounted) setState(() => _contacts = next);
  }

  Future<void> _editOffer() async {
    final offer = await showModalBottomSheet<OutreachOffer>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _OfferSheet(offer: _offer),
    );
    if (offer == null || _store == null) return;
    await _store!.saveOffer(offer);
    if (mounted) setState(() => _offer = offer);
  }

  @override
  Widget build(BuildContext context) {
    final busy = _status.busy || _starting;
    OutreachContact? current;
    for (final c in _contacts) {
      if (c.id == _status.contactId) current = c;
    }
    return RefreshIndicator(
      onRefresh: () => _refresh(withCalls: true),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          if (_status.busy)
            _OutreachLiveBanner(
              status: _status,
              who: current == null
                  ? 'Calling'
                  : (current.label.isEmpty ? Phone.display(current.number) : current.label),
              onTakeOver: Outreach.takeOver,
              onHangUp: Outreach.hangUp,
            ),
          const SectionTitle('Your offer'),
          Sheet(
            children: [
              LedgerRow(
                onTap: _editOffer,
                leading: const IconDisc(Icons.campaign_outlined),
                title: Text(_offer.company, style: context.text.titleSmall),
                subtitle: Text(
                  _offer.pitch,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall,
                ),
                trailing: const Icon(Icons.edit_outlined),
              ),
            ],
          ),
          SectionTitle(
            'Numbers to call',
            trailing: TextButton.icon(
              onPressed: _addContact,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add'),
            ),
          ),
          if (_contacts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text(
                'Add a number to try a test call. Numbers stay on this phone.',
                style: context.text.bodySmall,
              ),
            )
          else
            Sheet(
              children: [
                for (final c in _contacts)
                  _ContactRow(
                    contact: c,
                    last: _lastCall(c.id),
                    doNotCall: _doNotCall(c.id),
                    canCall: !busy,
                    onCall: () => _call(c),
                    onOpen: () => _showHistory(c),
                    onRemove: () => _removeContact(c),
                  ),
              ],
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 0),
            child: Text(
              'Test tool. The agent says it is an AI at the start of every call. Before calling people who '
              'have not agreed to it, check the rules where they live.',
              style: context.text.bodySmall?.copyWith(color: context.c.muted),
            ),
          ),
        ],
      ),
    );
  }

  void _showHistory(OutreachContact contact) {
    final calls = _calls.where((c) => c.contactId == contact.id).toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(kGutter, 0, kGutter, 32),
          children: [
            Text(contact.label.isEmpty ? Phone.display(contact.number) : contact.label, style: ctx.text.titleLarge),
            Text(Phone.display(contact.number), style: ctx.text.bodySmall),
            const SizedBox(height: 16),
            if (calls.isEmpty) Text('Not called yet.', style: ctx.text.bodySmall),
            for (final call in calls) _CallHistoryEntry(call),
          ],
        ),
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.contact,
    required this.last,
    required this.doNotCall,
    required this.canCall,
    required this.onCall,
    required this.onOpen,
    required this.onRemove,
  });

  final OutreachContact contact;
  final OutreachCallRecord? last;
  final bool doNotCall;
  final bool canCall;
  final VoidCallback onCall;
  final VoidCallback onOpen;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final title = contact.label.isEmpty ? Phone.display(contact.number) : contact.label;
    return InkWell(
      onLongPress: onRemove,
      child: LedgerRow(
        onTap: onOpen,
        leading: const IconDisc(Icons.person_outline_rounded),
        title: Text(title, style: context.text.titleSmall),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (contact.label.isNotEmpty) Text(Phone.display(contact.number), style: context.text.bodySmall),
            if (last != null) ...[
              const SizedBox(height: 6),
              Builder(
                builder: (context) {
                  final (label, tone) = outcomeLabel(last!.outcome);
                  return Pill(label, tone: tone);
                },
              ),
            ],
          ],
        ),
        trailing: doNotCall
            ? const Pill('Do not call', tone: Tone.bad)
            : FilledButton.tonal(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                ),
                onPressed: canCall ? onCall : null,
                child: const Text('Call'),
              ),
      ),
    );
  }
}

class _CallHistoryEntry extends StatelessWidget {
  const _CallHistoryEntry(this.call);

  final OutreachCallRecord call;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = outcomeLabel(call.outcome);
    final meeting = call.meeting;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Pill(label, tone: tone),
              const SizedBox(width: 8),
              Text(
                '${Fmt.ago(call.startedAt, now: DateTime.now())} · ${Fmt.duration(call.duration.inSeconds)}',
                style: context.text.labelSmall?.copyWith(color: context.c.muted),
              ),
            ],
          ),
          if (call.error != null) ...[
            const SizedBox(height: 6),
            Text(call.error!, style: context.text.bodySmall?.copyWith(color: context.c.badInk)),
          ],
          if (meeting != null) ...[
            const SizedBox(height: 10),
            Text('Meeting', style: context.text.titleSmall),
            Text(
              [
                meeting['when'],
                meeting['name'],
                meeting['contact'],
                meeting['notes'],
              ].where((s) => (s ?? '').isNotEmpty).join(' · '),
              style: context.text.bodyMedium,
            ),
          ],
          if (call.notes.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Notes', style: context.text.titleSmall),
            for (final n in call.notes) Text('• $n', style: context.text.bodyMedium),
          ],
          if (call.turns.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Conversation', style: context.text.titleSmall),
            const SizedBox(height: 4),
            for (final t in call.turns)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.fromThem ? 'Them' : 'Agent',
                      style: context.text.labelSmall?.copyWith(color: context.c.muted, fontWeight: FontWeight.w600),
                    ),
                    Text(t.text, style: context.text.bodyMedium),
                  ],
                ),
              ),
          ],
          Divider(color: context.c.line),
        ],
      ),
    );
  }
}

class _OutreachLiveBanner extends StatelessWidget {
  const _OutreachLiveBanner({
    required this.status,
    required this.who,
    required this.onTakeOver,
    required this.onHangUp,
  });

  final OutreachStatus status;
  final String who;
  final VoidCallback onTakeOver;
  final VoidCallback onHangUp;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final text = switch (status.phase) {
      'dialing' => 'Ringing. The agent starts when they pick up.',
      'talking' => 'The agent is talking.',
      'taken_over' => 'You are on the call.',
      _ => '',
    };
    return Container(
      margin: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.goodSoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.goodInk.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.phone_forwarded_rounded, color: c.goodInk, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(who, style: context.text.titleSmall?.copyWith(color: c.goodInk)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(text, style: context.text.bodySmall?.copyWith(color: c.goodInk)),
          const SizedBox(height: 12),
          Row(
            children: [
              if (status.phase == 'talking') ...[
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onTakeOver,
                    icon: const Icon(Icons.record_voice_over_rounded, size: 18),
                    label: const Text('Take over'),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onHangUp,
                  icon: const Icon(Icons.call_end_rounded, size: 18),
                  label: const Text('Hang up'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ContactDialog extends StatefulWidget {
  const _ContactDialog();

  @override
  State<_ContactDialog> createState() => _ContactDialogState();
}

class _ContactDialogState extends State<_ContactDialog> {
  final _number = TextEditingController();
  final _name = TextEditingController();
  final _business = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _number.dispose();
    _name.dispose();
    _business.dispose();
    super.dispose();
  }

  void _save() {
    final digits = _number.text.replaceAll(RegExp(r'[\s()-]'), '');
    if (!RegExp(r'^\+?[0-9]{5,15}$').hasMatch(digits)) {
      setState(() => _error = 'Enter a number with country code, like +14155550100');
      return;
    }
    Navigator.pop(
      context,
      OutreachContact(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        number: digits,
        name: _name.text.trim(),
        business: _business.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add a number'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _number,
            keyboardType: TextInputType.phone,
            autofocus: true,
            decoration: InputDecoration(labelText: 'Phone number', errorText: _error),
          ),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Name (optional)'),
          ),
          TextField(
            controller: _business,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Business (optional)'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: _save, child: const Text('Add')),
      ],
    );
  }
}

class _OfferSheet extends StatefulWidget {
  const _OfferSheet({required this.offer});

  final OutreachOffer offer;

  @override
  State<_OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends State<_OfferSheet> {
  late final _company = TextEditingController(text: widget.offer.company);
  late final _pitch = TextEditingController(text: widget.offer.pitch);
  late final _availability = TextEditingController(text: widget.offer.availability);

  @override
  void dispose() {
    _company.dispose();
    _pitch.dispose();
    _availability.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(kGutter, 0, kGutter, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your offer', style: context.text.titleLarge),
            const SizedBox(height: 4),
            Text('What the agent says it is calling about.', style: context.text.bodySmall),
            const SizedBox(height: 16),
            TextField(
              controller: _company,
              decoration: const InputDecoration(labelText: 'Company'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pitch,
              minLines: 4,
              maxLines: 10,
              decoration: const InputDecoration(labelText: 'What you offer', alignLabelWithHint: true),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _availability,
              decoration: const InputDecoration(labelText: 'When you can meet'),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                TextButton(
                  onPressed: () {
                    _company.text = OutreachOffer.fallback.company;
                    _pitch.text = OutreachOffer.fallback.pitch;
                    _availability.text = OutreachOffer.fallback.availability;
                  },
                  child: const Text('Reset'),
                ),
                const Spacer(),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(120, 44)),
                  onPressed: () => Navigator.pop(
                    context,
                    OutreachOffer(
                      company: _company.text.trim(),
                      pitch: _pitch.text.trim(),
                      availability: _availability.text.trim(),
                    ),
                  ),
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
