import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../platform/app_lock.dart';
import '../theme/palette.dart';
import '../widgets/common.dart';
import '../widgets/phone_line.dart';

/// Opaque cover shown while the app is locked. Asks for the phone's own
/// screen lock; shows nothing about the business.
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  bool _prompted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prompt());
  }

  Future<void> _prompt() async {
    if (!mounted || _prompted) return;
    _prompted = true;
    await context.read<AppLockController>().unlock();
    // If the owner cancelled, allow another automatic prompt only through the button.
  }

  @override
  Widget build(BuildContext context) {
    final lock = context.watch<AppLockController>();
    return Material(
      color: context.c.paper,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(kGutter * 1.5),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const PhoneLine(state: LineState.paused),
                const SizedBox(height: 16),
                Text('Orvia is locked', style: context.text.headlineSmall),
                const SizedBox(height: 6),
                Text(
                  'Use your phone screen lock to continue.',
                  style: context.text.bodyMedium?.copyWith(color: context.c.muted),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                FilledButton.icon(
                  onPressed: lock.authenticating ? null : lock.unlock,
                  icon: const Icon(Icons.lock_open_rounded),
                  label: const Text('Unlock'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
