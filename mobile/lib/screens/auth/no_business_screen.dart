import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session_controller.dart';
import '../../widgets/common.dart';

/// Signed in, but there is no business to show: either the account was never
/// attached to one, or the profile could not be loaded.
class NoBusinessScreen extends StatelessWidget {
  const NoBusinessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final couldNotLoad = session.error != null;

    return Scaffold(
      body: SafeArea(
        child: EmptyState(
          icon: couldNotLoad ? Icons.wifi_off_rounded : Icons.storefront_outlined,
          title: couldNotLoad ? 'Could not load your account' : 'No business on this account',
          message: couldNotLoad
              ? session.error!
              : 'This login is not attached to a business yet. Ask your Orvia contact to link it, then try again.',
          action: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FilledButton(
                onPressed: session.busy ? null : session.retryProfile,
                child: const Text('Try again'),
              ),
              const SizedBox(height: 8),
              TextButton(onPressed: session.signOut, child: const Text('Sign out')),
            ],
          ),
        ),
      ),
    );
  }
}
