import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';
import '../widgets/common.dart';
import 'call_agent.dart';
import 'agent_home.dart';

/// Settings row for the call agent: an on/off switch right in the list, and a
/// tap through to its full screen. Render only when [CallAgent.available].
class CallAgentRow extends StatefulWidget {
  const CallAgentRow({super.key, this.ownerName});

  final String? ownerName;

  @override
  State<CallAgentRow> createState() => _CallAgentRowState();
}

class _CallAgentRowState extends State<CallAgentRow> {
  AgentStatus? _status;
  bool _busy = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _refresh();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final s = await CallAgent.status();
      if (mounted) setState(() => _status = s);
    } on PlatformException catch (_) {}
  }

  Future<void> _toggle(bool on) async {
    setState(() => _busy = true);
    try {
      final s = await CallAgent.setEnabled(on);
      if (mounted) setState(() => _status = s);
      if (on && s.shizuku != ShizukuState.ready && mounted) {
        showMessage(context, 'Finish setup on the Call agent screen');
      }
    } on PlatformException catch (e) {
      if (mounted) showMessage(context, e.message ?? 'Could not change the agent');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final on = s?.enabled == true;
    final subtitle = s == null ? '' : (on ? s.state : 'Off. Calls ring normally');
    return LedgerRow(
      onTap: () async {
        await Navigator.of(context)
            .push(MaterialPageRoute<void>(builder: (_) => AgentHome(defaultOwnerName: widget.ownerName)));
        await _refresh();
      },
      leading: IconDisc(
        Icons.support_agent_rounded,
        tone: on && s?.shizuku == ShizukuState.ready ? Tone.good : Tone.neutral,
      ),
      title: Text('Call agent', style: context.text.titleSmall),
      subtitle: Text(subtitle, style: context.text.bodySmall),
      trailing: Switch(value: on, onChanged: s == null || _busy ? null : _toggle),
      semanticLabel: 'Call agent, ${on ? 'on' : 'off'}',
    );
  }
}
