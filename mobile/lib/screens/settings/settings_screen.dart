import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app.dart';
import '../../app_dependencies.dart';
import '../../data/auth_repository.dart';
import '../../platform/app_lock.dart';
import '../../platform/appearance.dart';
import '../../platform/call_alerts.dart';
import '../../state/phone_setup_controller.dart';
import '../../state/session_controller.dart';
import '../../telephony/forwarding_state.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import '../phone/phone_setup_screen.dart';
import 'ai_settings_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with WidgetsBindingObserver {
  /// Whether Android lets Orvia show notifications. Null until known.
  bool? _systemAllows;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _readSystem();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // The owner may have changed it in system settings while away.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _readSystem();
  }

  Future<void> _readSystem() async {
    final allowed = await context.read<AppDependencies>().permissions.notificationsGranted();
    if (mounted) setState(() => _systemAllows = allowed);
  }

  Future<void> _toggleAlerts(bool on) async {
    final alerts = context.read<CallAlerts>();
    final permissions = context.read<AppDependencies>().permissions;
    if (on && !await permissions.notificationsGranted()) {
      // Android only shows its prompt a limited number of times; after that the
      // system settings page is the only way.
      if (!await permissions.requestNotifications()) {
        await permissions.openSettings();
        return;
      }
    }
    await alerts.setEnabled(on);
    await _readSystem();
  }

  Future<void> _toggleLock(bool on) async {
    final lock = context.read<AppLockController>();
    final ok = await lock.whileAway(() => lock.setEnabled(on));
    if (!ok && mounted) {
      showMessage(context, on ? 'Set a screen lock on your phone first, then try again.' : 'Lock was not changed.');
    }
  }

  Future<void> _signOut() async {
    final scope = SignedInScope.of(context);
    final session = context.read<SessionController>();
    final phone = context.read<PhoneSetupController>();
    final sure = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: Text(
          phone.state.isOn
              ? 'Forwarding stays on, so Orvia keeps answering your missed calls. Pause Orvia first if you want calls to ring normally.'
              : 'You will need your email and password to sign back in.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Stay signed in')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (sure != true) return;
    await scope.beforeSignOut();
    await session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.read<Profile>();
    final deps = context.read<AppDependencies>();
    final phone = context.watch<PhoneSetupController>();
    final lock = context.watch<AppLockController>();
    final alerts = context.read<CallAlerts>();
    final c = context.c;

    final (phoneLabel, phoneTone) = switch (phone.state.phase) {
      ForwardingPhase.notSetUp => ('Not connected', Tone.warn),
      ForwardingPhase.paused => ('Paused', Tone.neutral),
      ForwardingPhase.activeUnverified => ('On, untested', Tone.warn),
      ForwardingPhase.activeVerified => ('Working', Tone.good),
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          Sheet(
            margin: const EdgeInsets.fromLTRB(kGutter, 8, kGutter, 0),
            children: [
              LedgerRow(
                leading: const IconDisc(Icons.person_outline_rounded, size: 44),
                title: Text(
                  profile.fullName?.trim().isNotEmpty == true ? profile.fullName! : 'Your account',
                  style: context.text.titleMedium,
                ),
                subtitle: Text(profile.email, style: context.text.bodySmall),
              ),
            ],
          ),
          const SectionTitle('Phone'),
          Sheet(
            children: [
              LedgerRow(
                onTap: () =>
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PhoneSetupScreen())),
                leading: const IconDisc(Icons.phone_forwarded_rounded),
                title: Text('Phone connection', style: context.text.titleSmall),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Pill(phoneLabel, tone: phoneTone),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
              LedgerRow(
                onTap: () =>
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AiSettingsScreen())),
                leading: const IconDisc(Icons.record_voice_over_outlined),
                title: Text('Greeting and numbers', style: context.text.titleSmall),
                subtitle: Text('What Orvia says, and where it transfers calls', style: context.text.bodySmall),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ],
          ),
          const SectionTitle('Appearance'),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: kGutter),
            child: _ThemePicker(),
          ),
          const SectionTitle('Notifications'),
          Sheet(
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 4),
                secondary: const IconDisc(Icons.notifications_none_rounded),
                title: Text('Tell me when a call is handled', style: context.text.titleSmall),
                subtitle: Text(
                  alerts.enabled && _systemAllows == false
                      ? 'Blocked in your phone settings. Turn on to allow.'
                      : 'Details stay hidden on a locked screen',
                  style: context.text.bodySmall,
                ),
                value: alerts.enabled && _systemAllows != false,
                onChanged: _toggleAlerts,
              ),
            ],
          ),
          const SectionTitle('Security'),
          Sheet(
            children: [
              SwitchListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 4),
                secondary: const IconDisc(Icons.lock_outline_rounded),
                title: Text('App lock', style: context.text.titleSmall),
                subtitle: Text(
                  lock.supported
                      ? 'Ask for your phone screen lock when you come back'
                      : 'Set a screen lock on your phone to use this',
                  style: context.text.bodySmall,
                ),
                value: lock.enabled,
                onChanged: lock.supported ? _toggleLock : null,
              ),
              if (lock.enabled)
                LedgerRow(
                  leading: const IconDisc(Icons.timer_outlined),
                  title: Text('Lock', style: context.text.titleSmall),
                  trailing: DropdownButtonHideUnderline(
                    child: DropdownButton<LockTimeout>(
                      value: lock.timeout,
                      borderRadius: BorderRadius.circular(12),
                      items: [for (final t in LockTimeout.values) DropdownMenuItem(value: t, child: Text(t.label))],
                      onChanged: (t) {
                        if (t != null) lock.setTimeout(t);
                      },
                    ),
                  ),
                ),
            ],
          ),
          const SectionTitle('About'),
          Sheet(
            children: [
              LedgerRow(
                onTap: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => const _PrivacySheet(),
                ),
                leading: const IconDisc(Icons.shield_outlined),
                title: Text('How Orvia uses your phone', style: context.text.titleSmall),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
              LedgerRow(
                leading: const IconDisc(Icons.info_outline_rounded),
                title: Text('Version', style: context.text.titleSmall),
                trailing: Text(deps.appVersion, style: context.text.bodyMedium?.copyWith(color: c.muted)),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(kGutter, 28, kGutter, 0),
            child: OutlinedButton.icon(
              onPressed: _signOut,
              style: OutlinedButton.styleFrom(
                foregroundColor: c.bad,
                side: BorderSide(color: c.bad.withValues(alpha: 0.4)),
              ),
              icon: const Icon(Icons.logout_rounded, size: 20),
              label: const Text('Sign out'),
            ),
          ),
        ],
      ),
    );
  }
}

class _PrivacySheet extends StatelessWidget {
  const _PrivacySheet();

  @override
  Widget build(BuildContext context) {
    Widget item(String title, String body) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleSmall),
          const SizedBox(height: 2),
          Text(body, style: context.text.bodyMedium?.copyWith(color: context.c.muted)),
        ],
      ),
    );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(kGutter, 4, kGutter, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('How Orvia uses your phone', style: context.text.titleLarge),
            const SizedBox(height: 16),
            item(
              'Call forwarding',
              'The app asks your carrier to send calls you miss to your Orvia number. Your carrier does the forwarding. The app is not in the call.',
            ),
            item(
              'Phone permission',
              'Used only to send those forwarding codes, and to tell your SIMs apart. The app cannot see who calls you and does not read your call history, contacts or messages.',
            ),
            item(
              'What is stored',
              'Your sign-in is kept in your phone secure storage. Forwarding settings are kept on this phone. Call summaries and conversations are fetched from your Orvia account when you open the app.',
            ),
            item(
              'Screenshots',
              'In the release app, screenshots and the recent-apps preview are blocked, because conversations can include personal details.',
            ),
          ],
        ),
      ),
    );
  }
}

/// Light, Dark or System. The new look grows out from the tapped option.
class _ThemePicker extends StatefulWidget {
  const _ThemePicker();

  @override
  State<_ThemePicker> createState() => _ThemePickerState();
}

class _ThemePickerState extends State<_ThemePicker> {
  Offset? _tap;

  static const _icons = {
    Appearance.light: Icons.light_mode_outlined,
    Appearance.dark: Icons.dark_mode_outlined,
    Appearance.system: Icons.contrast_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final appearance = context.watch<AppearanceController>();
    final c = context.c;
    return Listener(
      onPointerDown: (e) => _tap = e.position,
      child: SegmentedButton<Appearance>(
        showSelectedIcon: false,
        expandedInsets: EdgeInsets.zero,
        segments: [
          for (final a in Appearance.values)
            ButtonSegment(value: a, label: Text(a.label), icon: Icon(_icons[a], size: 18)),
        ],
        selected: {appearance.value},
        onSelectionChanged: (s) {
          final box = context.findRenderObject() as RenderBox?;
          final origin = _tap ?? box?.localToGlobal(box.size.center(Offset.zero)) ?? Offset.zero;
          ThemeReveal.of(context).change(appearance, s.single, origin: origin).ignore();
        },
        style: ButtonStyle(
          visualDensity: VisualDensity.standard,
          minimumSize: const WidgetStatePropertyAll(Size.fromHeight(48)),
          side: WidgetStatePropertyAll(BorderSide(color: c.line)),
          backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.ink : c.surface),
          foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.paper : c.ink),
          textStyle: WidgetStatePropertyAll(context.text.labelMedium),
        ),
      ),
    );
  }
}
