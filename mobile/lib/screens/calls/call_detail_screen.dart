import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app_dependencies.dart';
import '../../core/format.dart';
import '../../core/phone.dart';
import '../../data/models/models.dart';
import '../../state/calls_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import 'call_tile.dart';

/// One call: what happened, the summary, and the whole conversation.
class CallDetailScreen extends StatefulWidget {
  CallDetailScreen({super.key, required CallRecord this.initial}) : callId = initial.id;

  /// Opened from a notification: only the id is known until the record loads.
  const CallDetailScreen.byId({super.key, required this.callId}) : initial = null;

  /// The list row, shown at once while the full record (with transcript) loads.
  final CallRecord? initial;
  final String callId;

  @override
  State<CallDetailScreen> createState() => _CallDetailScreenState();
}

class _CallDetailScreenState extends State<CallDetailScreen> {
  CallRecord? _full;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final record = await context.read<CallsController>().detail(widget.callId);
      if (!mounted) return;
      setState(() {
        _full = record;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load the conversation. Check your connection and try again.';
        _loading = false;
      });
    }
  }

  /// Recording links come from the database; only ever open a plain https URL.
  static Uri? safeRecordingUri(String? raw) {
    final uri = Uri.tryParse(raw ?? '');
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
    return uri;
  }

  Future<void> _callBack(CallRecord call) async {
    final number = call.callerPhone;
    if (number == null) return;
    // ACTION_DIAL via the tel: scheme: opens the dialer, never dials silently.
    final ok = await launchUrl(Phone.telUri(number));
    if (!ok && mounted) showMessage(context, 'No phone app available to place the call.');
  }

  Future<void> _openRecording(Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, 'Could not open the recording.');
  }

  /// Before anything is known about the call, or when it no longer exists or
  /// belongs to someone else (the server returns nothing either way).
  Widget _placeholder(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Call')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.wifi_off_rounded,
                  title: 'Could not load this call',
                  message: _error!,
                  action: OutlinedButton(onPressed: _load, child: const Text('Try again')),
                )
              : const EmptyState(
                  icon: Icons.call_outlined,
                  title: 'Call not found',
                  message: 'It may have been removed.',
                ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final call = _full ?? widget.initial;
    if (call == null) return _placeholder(context);
    final v = CallVisual.of(call);
    final now = context.read<AppDependencies>().now();
    final c = context.c;
    final recording = safeRecordingUri(call.recordingUrl);
    final canCallBack = call.callerPhone != null && Phone.toE164(call.callerPhone) != null;

    return Scaffold(
      appBar: AppBar(title: Text(callTitle(call))),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 4, kGutter, 0),
            child: Row(
              children: [
                IconDisc(v.icon, tone: v.tone, size: 48),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(Fmt.slot(call.createdAt, now: now), style: context.text.titleMedium),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Pill(v.label, tone: v.tone),
                          if (call.durationSecs != null)
                            Text(Fmt.duration(call.durationSecs), style: context.text.labelSmall),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (canCallBack || recording != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(kGutter, 20, kGutter, 0),
              child: Row(
                children: [
                  if (canCallBack)
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => _callBack(call),
                        icon: const Icon(Icons.call_rounded, size: 20),
                        label: const Text('Call back'),
                      ),
                    ),
                  if (canCallBack && recording != null) const SizedBox(width: 10),
                  if (recording != null)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _openRecording(recording),
                        icon: const Icon(Icons.play_circle_outline_rounded, size: 20),
                        label: const Text('Recording'),
                      ),
                    ),
                ],
              ),
            ),
          if (call.status == CallStatus.failed)
            _Note(
              tone: Tone.warn,
              text: 'Orvia ran into a problem during this call'
                  '${call.aiFailureReason == null ? '' : ' (${call.aiFailureReason})'}. '
                  'The caller may not have been helped. Consider calling them back.',
            ),
          if (call.status == CallStatus.missed)
            const _Note(tone: Tone.bad, text: 'The caller never reached Orvia. Consider calling them back.'),
          if (call.summary != null && call.summary!.trim().isNotEmpty) ...[
            const SectionTitle('Summary'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text(call.summary!.trim(), style: context.text.bodyLarge),
            ),
          ],
          const SectionTitle('Conversation'),
          if (_loading && _full == null)
            const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
          else if (_error != null && _full == null)
            ErrorBanner(_error!, onRetry: _load)
          else if (call.transcript.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: kGutter),
              child: Text(
                call.transcriptReady || call.status == CallStatus.inProgress
                    ? (call.status == CallStatus.inProgress
                        ? 'The call is still going. The conversation appears when it ends.'
                        : 'Nothing was said on this call.')
                    : 'No transcript was saved for this call.',
                style: context.text.bodyMedium?.copyWith(color: c.muted),
              ),
            )
          else
            for (final turn in call.transcript) _Bubble(turn: turn),
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
    final (bg, fg) = tone == Tone.bad ? (c.badSoft, c.badInk) : (c.warnSoft, c.warnInk);
    return Container(
      margin: const EdgeInsets.fromLTRB(kGutter, 16, kGutter, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: context.text.bodyMedium?.copyWith(color: fg)),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.turn});

  final TranscriptTurn turn;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final orvia = turn.fromAssistant;
    return Semantics(
      label: '${orvia ? 'Orvia' : 'Caller'} said: ${turn.text}',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 4),
        child: Align(
          alignment: orvia ? Alignment.centerLeft : Alignment.centerRight,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: orvia ? c.surface : c.ink,
                border: orvia ? Border.all(color: c.line) : null,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(orvia ? 4 : 16),
                  bottomRight: Radius.circular(orvia ? 16 : 4),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    orvia ? 'Orvia' : 'Caller',
                    style: context.text.labelSmall?.copyWith(color: orvia ? c.muted : c.paper.withValues(alpha: 0.65)),
                  ),
                  const SizedBox(height: 2),
                  SelectableText(
                    turn.text,
                    style: context.text.bodyMedium?.copyWith(color: orvia ? c.ink : c.paper),
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
