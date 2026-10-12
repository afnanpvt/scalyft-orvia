import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/settings_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';

/// The three settings an owner can change from the phone.
class AiSettingsScreen extends StatefulWidget {
  const AiSettingsScreen({super.key});

  @override
  State<AiSettingsScreen> createState() => _AiSettingsScreenState();
}

class _AiSettingsScreenState extends State<AiSettingsScreen> {
  final _greeting = TextEditingController();
  final _transfer = TextEditingController();
  final _notify = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _filled = false;

  // What was saved when the screen opened. A value the owner has not touched is
  // never validated: the dashboard may have stored it in a looser format.
  String _origTransfer = '';
  String _origNotify = '';

  String? _phoneRule(String? v, String original) =>
      (v ?? '').trim() == original ? null : SettingsController.validatePhone(v);

  @override
  void initState() {
    super.initState();
    // After the first frame: load() notifies listeners, which is not allowed
    // while the tree is still being built.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final ctrl = context.read<SettingsController>();
      await ctrl.load();
      if (!mounted) return;
      final s = ctrl.settings;
      setState(() {
        _greeting.text = s?.greeting ?? '';
        _transfer.text = s?.transferNumber ?? '';
        _notify.text = s?.notificationPhone ?? '';
        _origTransfer = (s?.transferNumber ?? '').trim();
        _origNotify = (s?.notificationPhone ?? '').trim();
        _filled = true;
      });
    });
  }

  @override
  void dispose() {
    _greeting.dispose();
    _transfer.dispose();
    _notify.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final ctrl = context.read<SettingsController>();
    final ok = await ctrl.save(
      greeting: _greeting.text,
      transferNumber: _transfer.text,
      notificationPhone: _notify.text,
    );
    if (ok && mounted) {
      showMessage(context, 'Saved');
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsController>();

    return Scaffold(
      appBar: AppBar(title: const Text('Greeting and numbers')),
      body: s.loading && !_filled
          ? const Center(child: CircularProgressIndicator())
          : s.error != null && !_filled
              ? EmptyState(
                  icon: Icons.wifi_off_rounded,
                  title: 'Could not load your settings',
                  message: s.error!,
                  action: OutlinedButton(onPressed: s.load, child: const Text('Try again')),
                )
              : Form(
                  key: _form,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 40),
                    children: [
                      TextFormField(
                        controller: _greeting,
                        maxLines: 4,
                        minLines: 2,
                        maxLength: SettingsController.maxGreeting,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          labelText: 'Greeting',
                          helperText: 'What callers hear first. Empty uses the default.',
                          alignLabelWithHint: true,
                        ),
                        validator: SettingsController.validateGreeting,
                      ),
                      const SizedBox(height: 18),
                      TextFormField(
                        controller: _transfer,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Transfer calls to',
                          hintText: '+91 98765 43210',
                          helperText: 'When a caller asks for a person, Orvia can connect them here. Do not use the number of the phone that forwards to Orvia.',
                          helperMaxLines: 3,
                          errorMaxLines: 3,
                        ),
                        validator: (v) => _phoneRule(v, _origTransfer),
                      ),
                      const SizedBox(height: 18),
                      TextFormField(
                        controller: _notify,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Send text alerts to',
                          hintText: '+91 98765 43210',
                          helperText: 'Optional. Used for urgent alerts.',
                          errorMaxLines: 3,
                        ),
                        validator: (v) => _phoneRule(v, _origNotify),
                      ),
                      if (s.error != null) ...[
                        const SizedBox(height: 14),
                        Text(s.error!, style: context.text.bodyMedium?.copyWith(color: context.c.bad)),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: s.saving ? null : _save,
                        child: s.saving
                            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                            : const Text('Save changes'),
                      ),
                    ],
                  ),
                ),
    );
  }
}
