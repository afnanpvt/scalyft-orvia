import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';

/// Shown right after signing in with a temporary password. Nothing else is
/// reachable until a real one is chosen.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _first = TextEditingController();
  final _second = TextEditingController();
  String? _mismatch;
  bool _obscure = true;

  @override
  void dispose() {
    _first.dispose();
    _second.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_first.text != _second.text) {
      setState(() => _mismatch = 'The two passwords do not match.');
      return;
    }
    setState(() => _mismatch = null);
    FocusScope.of(context).unfocus();
    await context.read<SessionController>().changePassword(_first.text);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final c = context.c;
    final error = _mismatch ?? session.error;

    return Scaffold(
      appBar: AppBar(
        actions: [
          TextButton(onPressed: session.busy ? null : session.signOut, child: const Text('Sign out')),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 24),
          child: AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Choose a new password', style: context.text.headlineMedium),
                const SizedBox(height: 8),
                Text(
                  'You signed in with a temporary password. Pick one only you know before continuing.',
                  style: context.text.bodyMedium?.copyWith(color: c.muted),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _first,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.newPassword],
                  autocorrect: false,
                  enableSuggestions: false,
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => session.clearError(),
                  decoration: InputDecoration(
                    labelText: 'New password',
                    helperText: 'At least 8 characters. A short phrase works well.',
                    suffixIcon: IconButton(
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _second,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.newPassword],
                  autocorrect: false,
                  enableSuggestions: false,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _save(),
                  decoration: const InputDecoration(labelText: 'Type it again'),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Semantics(
                    liveRegion: true,
                    child: Text(error, style: context.text.bodyMedium?.copyWith(color: c.bad)),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: session.busy ? null : _save,
                  child: session.busy
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                      : const Text('Save password'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
