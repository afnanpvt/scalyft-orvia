import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/format.dart';
import '../core/phone.dart';
import '../theme/palette.dart';
import '../widgets/common.dart';
import 'call_agent.dart';

/// The owner's on-phone call agent: on/off, what it needs, how it answers, and
/// the calls it took. Only reachable in the assistant build.
class CallAgentScreen extends StatefulWidget {
  const CallAgentScreen({super.key, this.defaultOwnerName, this.canLink = true, this.onSignIn, this.embedded = false});

  /// Used for the greeting until the owner types a name.
  final String? defaultOwnerName;

  /// False when nobody is signed in, so there is no dashboard to link to.
  final bool canLink;

  /// Set when signed out: offers signing in, which adds dashboard sync.
  final VoidCallback? onSignIn;

  /// Inside the agent home's tabs: no own app bar.
  final bool embedded;

  @override
  State<CallAgentScreen> createState() => _CallAgentScreenState();
}

class _CallAgentScreenState extends State<CallAgentScreen> with WidgetsBindingObserver {
  AgentStatus? _status;
  AgentConfig? _config;
  List<AgentCall> _calls = const [];
  Timer? _poll;
  int _ticks = 0;
  bool _busy = false;
  bool _linking = false;
  String? _linkError;
  String? _probeResult;
  List<String> _skip = const [];
  final _nameCtl = TextEditingController();
  final _keyCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    // Every second, so a live call's conversation reads as it happens.
    _poll = Timer.periodic(const Duration(seconds: 1), (_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _nameCtl.dispose();
    _keyCtl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh(withCalls: true);
  }

  Future<void> _load() async {
    var config = await CallAgent.config();
    if (config.ownerName.isEmpty && (widget.defaultOwnerName ?? '').trim().isNotEmpty) {
      await CallAgent.configure(ownerName: widget.defaultOwnerName!.trim().split(' ').first);
      config = await CallAgent.config();
    }
    _nameCtl.text = config.ownerName;
    final skip = await CallAgent.skipNumbers();
    if (mounted) {
      setState(() {
        _config = config;
        _skip = skip;
      });
    }
    if (!config.linked && widget.canLink) await _link(quiet: true);
    await _refresh(withCalls: true);
  }

  Future<void> _refresh({bool withCalls = false}) async {
    try {
      final status = await CallAgent.status();
      // The list changes after a call, so reload it every few polls too.
      final calls = (withCalls || ++_ticks % 5 == 0) ? await CallAgent.calls() : null;
      if (!mounted) return;
      setState(() {
        _status = status;
        if (calls != null) _calls = calls;
      });
    } on PlatformException catch (_) {}
  }

  Future<void> _link({bool quiet = false}) async {
    setState(() {
      _linking = true;
      _linkError = null;
    });
    final error = await CallAgent.link();
    final config = await CallAgent.config();
    if (!mounted) return;
    setState(() {
      _linking = false;
      _linkError = error;
      _config = config;
    });
    if (!quiet) showMessage(context, error ?? 'Linked. Calls will show in your dashboard.');
  }

  Future<void> _toggle(bool on) async {
    setState(() => _busy = true);
    try {
      final status = await CallAgent.setEnabled(on);
      if (mounted) setState(() => _status = status);
      if (on && status.shizuku != ShizukuState.ready && mounted) {
        showMessage(context, 'Allow Orvia Assistant in Shizuku so the agent can answer.');
      }
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? 'Could not change the agent');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setDelay(int secs) async {
    await CallAgent.configure(answerDelaySecs: secs);
    final config = await CallAgent.config();
    if (mounted) setState(() => _config = config);
  }

  Future<void> _saveName() async {
    await CallAgent.configure(ownerName: _nameCtl.text.trim());
    if (mounted) showMessage(context, 'Saved');
  }

  Future<void> _saveKey() async {
    await CallAgent.configure(apiKey: _keyCtl.text.trim());
    _keyCtl.clear();
    final config = await CallAgent.config();
    if (mounted) {
      setState(() => _config = config);
      showMessage(context, config.hasApiKey ? 'Key saved' : 'Using Orvia\'s Gemini access');
    }
  }

  Future<void> _batterySheet(AgentStatus status) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(kGutter, 0, kGutter, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Keep the agent running', style: ctx.text.titleLarge),
              const SizedBox(height: 16),
              _BatteryStep(
                number: 1,
                title: 'Battery optimization',
                body: status.batteryExempt ? 'Done' : 'Tap, then choose Allow.',
                done: status.batteryExempt,
                onTap: status.batteryExempt ? null : CallAgent.requestBatteryExemption,
              ),
              if (status.hasVendorPowerManager)
                const _BatteryStep(
                  number: 2,
                  title: 'vivo background power',
                  body: 'Tap, find Orvia Assistant and turn on "Allow high background power consumption".',
                  onTap: CallAgent.openVendorBatterySettings,
                ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () async {
                    await CallAgent.setBatteryAcknowledged(true);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                  child: const Text('I have done this'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    await _refresh();
  }

  Future<void> _askForKey() async {
    final key = await showDialog<String>(context: context, builder: (_) => const _KeyDialog());
    if (key == null || key.isEmpty) return;
    await CallAgent.configure(apiKey: key);
    final config = await CallAgent.config();
    if (mounted) setState(() => _config = config);
  }

  Future<void> _runProbe(Future<String> Function() probe) async {
    setState(() => _probeResult = 'Running…');
    try {
      final result = await probe();
      if (mounted) setState(() => _probeResult = result);
    } on PlatformException catch (e) {
      if (mounted) setState(() => _probeResult = e.message ?? e.code);
    }
  }

  Future<void> _toggleTalk() async {
    try {
      if (_status?.talking == true) {
        await CallAgent.stopTalk();
      } else {
        await CallAgent.startTalk();
      }
      await _refresh();
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? e.code);
    }
  }

  Future<void> _takeOver() async {
    try {
      await CallAgent.takeOverCall();
      if (mounted) showMessage(context, 'You are on the call now. The agent stepped out.');
      await _refresh();
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? e.code);
    }
  }

  Future<void> _answerOwner(OwnerAnswer answer, String text) async {
    try {
      await CallAgent.answerOwner(answer, text: text);
      if (mounted) {
        showMessage(context, switch (answer) {
          OwnerAnswer.join => 'Connecting you. The agent will step out.',
          OwnerAnswer.busy => 'The agent will tell them you are busy.',
          OwnerAnswer.reply => 'The agent will pass that on.',
        });
      }
      await _refresh();
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? e.code);
    }
  }

  Future<void> _addSkipNumber() async {
    final number = await showDialog<String>(context: context, builder: (_) => const _SkipNumberDialog());
    if (number == null || number.isEmpty) return;
    final next = [..._skip.where((n) => n != number), number];
    await CallAgent.setSkipNumbers(next);
    if (mounted) setState(() => _skip = next);
  }

  Future<void> _removeSkipNumber(String number) async {
    final next = _skip.where((n) => n != number).toList();
    await CallAgent.setSkipNumbers(next);
    if (mounted) setState(() => _skip = next);
  }

  Future<void> _hangUp() async {
    try {
      await CallAgent.hangUpCall();
      await _refresh();
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? e.code);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final config = _config;
    final c = context.c;
    final on = status?.enabled == true;
    final ready = status?.shizuku == ShizukuState.ready;
    final (label, tone) = switch ((on, ready)) {
      (false, _) => ('Off', Tone.neutral),
      (true, false) => ('Needs Shizuku', Tone.warn),
      (true, true) => ('On', Tone.good),
    };
    final pending = _calls.where((x) => !x.uploaded).length;

    final body = RefreshIndicator(
      onRefresh: () async {
        await CallAgent.sync();
        await _refresh(withCalls: true);
      },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          if (status?.onCall == true)
            _LiveCallBanner(status: status!, onTakeOver: _takeOver, onHangUp: _hangUp, onAnswerOwner: _answerOwner),
          Sheet(
            margin: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 0),
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 6),
                secondary: IconDisc(Icons.support_agent_rounded, tone: on && ready ? Tone.good : Tone.neutral),
                title: Text('Answer my calls', style: context.text.titleMedium),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Pill(label, tone: tone),
                      const SizedBox(height: 6),
                      Text(
                        on ? (status?.state ?? '') : 'Calls ring normally. Turn on to let the AI pick up.',
                        style: context.text.bodySmall,
                      ),
                    ],
                  ),
                ),
                value: on,
                onChanged: status == null || _busy ? null : _toggle,
              ),
            ],
          ),
          if (status != null) ..._setup(status, config),
          const SectionTitle('How it answers'),
          Sheet(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(kGutter, 14, kGutter, 6),
                child: TextField(
                  controller: _nameCtl,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'Your name',
                    helperText: 'The agent says it is your assistant',
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.check_rounded),
                      onPressed: _saveName,
                      tooltip: 'Save name',
                    ),
                  ),
                  onSubmitted: (_) => _saveName(),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(kGutter, 10, kGutter, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pick up after', style: context.text.titleSmall),
                    const SizedBox(height: 4),
                    Text(
                      'Time you get to answer first. Carriers often send calls to voicemail after about 25 sec.',
                      style: context.text.bodySmall,
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final s in const [0, 5, 10, 20])
                          ChoiceChip(
                            label: Text(s == 0 ? 'At once' : '$s sec'),
                            selected: config?.answerDelaySecs == s,
                            onSelected: config == null ? null : (_) => _setDelay(s),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          SectionTitle(
            'Never answer',
            trailing: TextButton.icon(
              onPressed: _addSkipNumber,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add'),
            ),
          ),
          if (_skip.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text('Calls from numbers you add here ring for you as usual.', style: context.text.bodySmall),
            )
          else
            Sheet(
              children: [
                for (final n in _skip)
                  LedgerRow(
                    leading: const IconDisc(Icons.phone_disabled_outlined),
                    title: Text(Phone.display(n), style: context.text.titleSmall),
                    trailing: IconButton(
                      tooltip: 'Remove',
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => _removeSkipNumber(n),
                    ),
                  ),
              ],
            ),
          SectionTitle(
            'Calls it took',
            trailing: pending > 0 && config?.linked == true
                ? TextButton(
                    onPressed: () async {
                      await CallAgent.sync();
                      await Future<void>.delayed(const Duration(seconds: 2));
                      await _refresh(withCalls: true);
                    },
                    child: Text('Send $pending now'),
                  )
                : null,
          ),
          if (_calls.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text(
                'Nothing yet. Calls the agent answers show here and in your Orvia calls.',
                style: context.text.bodySmall,
              ),
            )
          else
            Sheet(children: [for (final call in _calls.take(30)) _CallRow(call, linked: config?.linked == true)]),
          const SectionTitle('Advanced'),
          Sheet(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(kGutter, 14, kGutter, 6),
                child: TextField(
                  controller: _keyCtl,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    labelText: config?.hasApiKey == true ? 'Own Gemini key saved' : 'Own Gemini key (optional)',
                    helperText: config?.hasApiKey == true
                        ? 'Save empty to use Orvia\'s Gemini access'
                        : 'Empty uses Orvia\'s Gemini access',
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.check_rounded),
                      onPressed: _saveKey,
                      tooltip: 'Save key',
                    ),
                  ),
                ),
              ),
              LedgerRow(
                onTap: _toggleTalk,
                leading: IconDisc(status?.talking == true ? Icons.stop_rounded : Icons.mic_none_rounded),
                title: Text(status?.talking == true ? 'Stop talking' : 'Talk now', style: context.text.titleSmall),
                subtitle: Text('Join a call you answered, or talk to it yourself', style: context.text.bodySmall),
              ),
              LedgerRow(
                onTap: () => _runProbe(CallAgent.testUplink),
                leading: const IconDisc(Icons.graphic_eq_rounded),
                title: Text('Test: beep to caller', style: context.text.titleSmall),
                subtitle: Text('During a call. The other phone should hear six beeps', style: context.text.bodySmall),
              ),
              LedgerRow(
                onTap: () => _runProbe(CallAgent.probeDownlink),
                leading: const IconDisc(Icons.hearing_rounded),
                title: Text('Test: hear caller', style: context.text.titleSmall),
                subtitle: Text('During a call. Records 5 sec of the other side', style: context.text.bodySmall),
              ),
              if (_probeResult != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(kGutter, 4, kGutter, 14),
                  child: SelectableText(_probeResult!, style: context.text.bodySmall?.copyWith(color: c.muted)),
                ),
            ],
          ),
        ],
      ),
    );
    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Call agent'),
        actions: [if (widget.onSignIn != null) TextButton(onPressed: widget.onSignIn, child: const Text('Sign in'))],
      ),
      body: body,
    );
  }

  List<Widget> _setup(AgentStatus status, AgentConfig? config) {
    final rows = <Widget>[
      if (status.shizuku == ShizukuState.offline)
        _SetupRow(
          icon: Icons.power_settings_new_rounded,
          title: 'Start Shizuku',
          body: 'Open Shizuku and start it. After a restart it needs starting again.',
          action: 'Open',
          onTap: () async {
            if (!await CallAgent.openShizuku() && mounted) showMessage(context, 'Shizuku is not installed');
          },
        ),
      if (status.shizuku == ShizukuState.noPermission)
        const _SetupRow(
          icon: Icons.verified_user_outlined,
          title: 'Allow in Shizuku',
          body: 'Lets the agent answer, hear the caller and speak.',
          action: 'Allow',
          onTap: CallAgent.requestShizukuPermission,
        ),
      if (widget.canLink && config != null && !config.linked)
        _SetupRow(
          icon: Icons.cloud_sync_outlined,
          title: 'Link to your dashboard',
          body: _linkError ?? 'Saves each call to your Orvia calls.',
          action: _linking ? 'Linking…' : 'Link',
          onTap: _linking ? null : _link,
        ),
      if (config != null && !config.hasApiKey && !config.linked)
        _SetupRow(
          icon: Icons.key_rounded,
          title: 'Add a Gemini key',
          body: 'Needed while you are not signed in. Free at aistudio.google.com.',
          action: 'Add',
          onTap: _askForKey,
        ),
      if (widget.onSignIn != null)
        _SetupRow(
          icon: Icons.cloud_off_outlined,
          title: 'Calls stay on this phone',
          body: 'Sign in to also save them to your Orvia dashboard.',
          action: 'Sign in',
          onTap: widget.onSignIn,
        ),
      if (!status.keepsRunning)
        _SetupRow(
          icon: Icons.battery_alert_rounded,
          title: 'Keep it running',
          body: 'Stop the phone from closing the agent in the background.',
          action: 'Set up',
          onTap: () => _batterySheet(status),
        ),
    ];
    if (rows.isEmpty) return const [];
    return [const SectionTitle('Finish setup'), Sheet(children: rows)];
  }
}

class _SetupRow extends StatelessWidget {
  const _SetupRow({required this.icon, required this.title, required this.body, required this.action, this.onTap});

  final IconData icon;
  final String title;
  final String body;
  final String action;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LedgerRow(
      leading: IconDisc(icon, tone: Tone.warn),
      title: Text(title, style: context.text.titleSmall),
      subtitle: Text(body, style: context.text.bodySmall),
      // The app theme makes filled buttons full width; a row needs a compact one.
      trailing: FilledButton.tonal(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        onPressed: onTap,
        child: Text(action),
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  const _CallRow(this.call, {required this.linked});

  final AgentCall call;
  final bool linked;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final (syncLabel, syncTone) = call.uploaded
        ? ('In dashboard', Tone.good)
        : !linked
        ? ('On this phone', Tone.neutral)
        : call.uploadError != null
        ? ('Not sent', Tone.bad)
        : ('Sending', Tone.neutral);
    final preview = call.notes.isNotEmpty
        ? call.notes.join(' · ')
        : call.turns.isEmpty
        ? 'Hung up before speaking'
        : call.turns.firstWhere((t) => t.fromCaller, orElse: () => call.turns.first).text;
    return LedgerRow(
      onTap: () => _showDetail(context),
      leading: const IconDisc(Icons.call_received_rounded),
      title: Text(Phone.display(call.callerNumber), style: context.text.titleSmall),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(preview, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodySmall),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                '${Fmt.ago(call.startedAt, now: now)} · ${Fmt.duration(call.duration.inSeconds)}',
                style: context.text.labelSmall?.copyWith(color: context.c.muted),
              ),
              const SizedBox(width: 8),
              Pill(syncLabel, tone: syncTone),
            ],
          ),
        ],
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(kGutter, 0, kGutter, 32),
          children: [
            Text(Phone.display(call.callerNumber), style: ctx.text.titleLarge),
            const SizedBox(height: 4),
            Text('${Fmt.clock(call.startedAt)} · ${Fmt.duration(call.duration.inSeconds)}', style: ctx.text.bodySmall),
            if (call.uploadError != null) ...[
              const SizedBox(height: 8),
              Text('Not sent: ${call.uploadError}', style: ctx.text.bodySmall?.copyWith(color: ctx.c.badInk)),
            ],
            if (call.notes.isNotEmpty) ...[
              const SizedBox(height: 20),
              Text('Notes', style: ctx.text.titleSmall),
              const SizedBox(height: 6),
              for (final n in call.notes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text('• $n', style: ctx.text.bodyMedium),
                ),
            ],
            const SizedBox(height: 20),
            Text('Conversation', style: ctx.text.titleSmall),
            const SizedBox(height: 8),
            if (call.turns.isEmpty) Text('Nothing was said.', style: ctx.text.bodySmall),
            for (final t in call.turns)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.fromCaller ? 'Caller' : 'Agent',
                      style: ctx.text.labelSmall?.copyWith(color: ctx.c.muted, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(t.text, style: ctx.text.bodyMedium),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BatteryStep extends StatelessWidget {
  const _BatteryStep({required this.number, required this.title, required this.body, this.done = false, this.onTap});

  final int number;
  final String title;
  final String body;
  final bool done;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: onTap,
      leading: CircleAvatar(radius: 16, child: done ? const Icon(Icons.check_rounded, size: 18) : Text('$number')),
      title: Text(title, style: context.text.titleSmall),
      subtitle: Text(body, style: context.text.bodySmall),
      trailing: onTap == null ? null : const Icon(Icons.open_in_new_rounded, size: 18),
    );
  }
}

/// Owns its controller, so it is disposed only after the dialog's closing animation.
class _KeyDialog extends StatefulWidget {
  const _KeyDialog();

  @override
  State<_KeyDialog> createState() => _KeyDialogState();
}

class _KeyDialogState extends State<_KeyDialog> {
  final _ctl = TextEditingController();

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Gemini key'),
      content: TextField(
        controller: _ctl,
        autofocus: true,
        obscureText: true,
        autocorrect: false,
        enableSuggestions: false,
        decoration: const InputDecoration(hintText: 'Paste your key'),
        onSubmitted: (v) => Navigator.pop(context, v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, _ctl.text.trim()), child: const Text('Save')),
      ],
    );
  }
}

/// Shown at the top of the screen while the agent is on a live call: the
/// conversation as it happens, Take over / Hang up, and, when the caller asks
/// for the owner, the owner's answer.
class _LiveCallBanner extends StatelessWidget {
  const _LiveCallBanner({
    required this.status,
    required this.onTakeOver,
    required this.onHangUp,
    required this.onAnswerOwner,
  });

  final AgentStatus status;
  final VoidCallback onTakeOver;
  final VoidCallback onHangUp;
  final void Function(OwnerAnswer answer, String text) onAnswerOwner;

  static const quickReplies = ['Call back in 30 min', 'Text me instead', 'Call tomorrow morning'];

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final request = status.ownerRequest;
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
              Icon(Icons.graphic_eq_rounded, color: c.goodInk, size: 20),
              const SizedBox(width: 8),
              Text('Agent is on a call', style: context.text.titleSmall?.copyWith(color: c.goodInk)),
            ],
          ),
          const SizedBox(height: 10),
          if (status.liveTurns.isEmpty)
            Text('Connecting…', style: context.text.bodySmall?.copyWith(color: c.goodInk))
          else
            for (final t in status.liveTurns)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: t.fromCaller ? 'Caller  ' : 'Agent  ',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      TextSpan(text: t.text),
                    ],
                  ),
                  style: context.text.bodySmall?.copyWith(color: c.goodInk),
                ),
              ),
          if (request != null) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.warnSoft, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Caller wants to talk to you', style: context.text.titleSmall?.copyWith(color: c.warnInk)),
                  const SizedBox(height: 2),
                  Text(request, style: context.text.bodySmall?.copyWith(color: c.warnInk)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          onPressed: () => onAnswerOwner(OwnerAnswer.join, ''),
                          child: const Text('Join'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => onAnswerOwner(OwnerAnswer.busy, ''),
                          child: const Text('Busy'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      for (final r in quickReplies)
                        ActionChip(label: Text(r), onPressed: () => onAnswerOwner(OwnerAnswer.reply, r)),
                      ActionChip(
                        avatar: const Icon(Icons.edit_outlined, size: 16),
                        label: const Text('Write'),
                        onPressed: () async {
                          final text = await showDialog<String>(context: context, builder: (_) => const _ReplyDialog());
                          if (text != null && text.isNotEmpty) onAnswerOwner(OwnerAnswer.reply, text);
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: onTakeOver,
                  icon: const Icon(Icons.record_voice_over_rounded, size: 18),
                  label: const Text('Take over'),
                ),
              ),
              const SizedBox(width: 10),
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

/// A message the agent passes on to the caller.
class _ReplyDialog extends StatefulWidget {
  const _ReplyDialog();

  @override
  State<_ReplyDialog> createState() => _ReplyDialogState();
}

class _ReplyDialogState extends State<_ReplyDialog> {
  final _ctl = TextEditingController();

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Message for the caller'),
      content: TextField(
        controller: _ctl,
        autofocus: true,
        maxLines: 3,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(hintText: 'The agent says this to them'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, _ctl.text.trim()), child: const Text('Send')),
      ],
    );
  }
}

/// Adds a number to the never-answer list.
class _SkipNumberDialog extends StatefulWidget {
  const _SkipNumberDialog();

  @override
  State<_SkipNumberDialog> createState() => _SkipNumberDialogState();
}

class _SkipNumberDialogState extends State<_SkipNumberDialog> {
  final _ctl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  void _save() {
    final digits = _ctl.text.replaceAll(RegExp(r'[^0-9+]'), '');
    if (digits.replaceAll('+', '').length < 3) {
      setState(() => _error = 'Enter a phone number');
      return;
    }
    Navigator.pop(context, digits);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Never answer'),
      content: TextField(
        controller: _ctl,
        autofocus: true,
        keyboardType: TextInputType.phone,
        decoration: InputDecoration(labelText: 'Phone number', errorText: _error),
        onSubmitted: (_) => _save(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(onPressed: _save, child: const Text('Add')),
      ],
    );
  }
}
