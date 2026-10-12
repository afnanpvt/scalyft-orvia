import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/session_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import '../../widgets/phone_line.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final session = context.read<SessionController>();
    FocusScope.of(context).unfocus();
    final ok = await session.signIn(_email.text, _password.text);
    if (ok) TextInput.finishAutofillContext();
  }

  void _forgot() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ForgotSheet(initialEmail: _email.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final c = context.c;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const PhoneLine(state: LineState.covering),
                    const SizedBox(height: 28),
                    Text('Sign in to Orvia', style: context.text.headlineMedium),
                    const SizedBox(height: 6),
                    Text(
                      'Use the email and password from your Orvia dashboard.',
                      style: context.text.bodyMedium?.copyWith(color: c.muted),
                    ),
                    const SizedBox(height: 28),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username, AutofillHints.email],
                      autocorrect: false,
                      enableSuggestions: false,
                      onSubmitted: (_) => _passwordFocus.requestFocus(),
                      onChanged: (_) => session.clearError(),
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _password,
                      focusNode: _passwordFocus,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      autocorrect: false,
                      enableSuggestions: false,
                      onSubmitted: (_) => _submit(),
                      onChanged: (_) => session.clearError(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                    ),
                    if (session.error != null) ...[
                      const SizedBox(height: 12),
                      Semantics(
                        liveRegion: true,
                        child: Text(session.error!, style: context.text.bodyMedium?.copyWith(color: c.bad)),
                      ),
                    ],
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: session.busy ? null : _submit,
                      child: session.busy
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(onPressed: _forgot, child: const Text('Forgot password')),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ForgotSheet extends StatefulWidget {
  const _ForgotSheet({required this.initialEmail});

  final String initialEmail;

  @override
  State<_ForgotSheet> createState() => _ForgotSheetState();
}

class _ForgotSheetState extends State<_ForgotSheet> {
  late final _email = TextEditingController(text: widget.initialEmail);
  bool _sent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final ok = await context.read<SessionController>().sendReset(_email.text);
    if (ok && mounted) setState(() => _sent = true);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Padding(
      padding: EdgeInsets.fromLTRB(kGutter, 4, kGutter, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Reset your password', style: context.text.titleLarge),
          const SizedBox(height: 8),
          if (_sent)
            Text(
              'If that email has an Orvia account, a reset link is on its way. Open it on this phone or on a computer.',
              style: context.text.bodyMedium,
            )
          else ...[
            Text('We will email you a link to choose a new password.', style: context.text.bodyMedium),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
              onSubmitted: (_) => _send(),
            ),
            if (session.error != null) ...[
              const SizedBox(height: 10),
              Text(session.error!, style: context.text.bodyMedium?.copyWith(color: context.c.bad)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: session.busy ? null : _send,
              child: const Text('Send reset link'),
            ),
          ],
        ],
      ),
    );
  }
}
