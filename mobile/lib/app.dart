import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_dependencies.dart';
import 'data/auth_repository.dart';
import 'data/orvia_api.dart';
import 'platform/app_lock.dart';
import 'platform/appearance.dart';
import 'platform/call_alerts.dart';
import 'platform/device_registrar.dart';
import 'platform/live_sync.dart';
import 'screens/auth/change_password_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/no_business_screen.dart';
import 'screens/calls/call_detail_screen.dart';
import 'screens/lock_screen.dart';
import 'screens/shell_screen.dart';
import 'screens/splash_screen.dart';
import 'state/appointments_controller.dart';
import 'state/calls_controller.dart';
import 'state/followups_controller.dart';
import 'state/home_controller.dart';
import 'state/phone_setup_controller.dart';
import 'state/session_controller.dart';
import 'state/settings_controller.dart';
import 'telephony/forwarding_service.dart';
import 'telephony/forwarding_state.dart';
import 'theme/app_theme.dart';

class OrviaApp extends StatefulWidget {
  const OrviaApp({super.key, required this.deps});

  final AppDependencies deps;

  @override
  State<OrviaApp> createState() => _OrviaAppState();
}

// Built once: rebuilding ThemeData on every appearance change is wasteful.
final _light = buildTheme(Brightness.light);
final _dark = buildTheme(Brightness.dark);

class _OrviaAppState extends State<OrviaApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late final AppearanceController _appearance = AppearanceController(widget.deps.prefs);
  late final SessionController _session = SessionController(widget.deps.auth);
  late final AppLockController _lock = AppLockController(
    prefs: widget.deps.prefs,
    auth: widget.deps.deviceAuth,
    now: widget.deps.now,
  );

  @override
  void initState() {
    super.initState();
    unawaited(widget.deps.telephony.setSecureWindow(widget.deps.blockScreenshots));
    _lock
      ..attach()
      ..init().ignore();
    unawaited(_session.start());
  }

  @override
  void dispose() {
    _session.dispose();
    _lock.dispose();
    _appearance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<AppDependencies>.value(value: widget.deps),
        ChangeNotifierProvider<SessionController>.value(value: _session),
        ChangeNotifierProvider<AppLockController>.value(value: _lock),
        Provider<GlobalKey<NavigatorState>>.value(value: _navigator),
        ChangeNotifierProvider<AppearanceController>.value(value: _appearance),
      ],
      child: Builder(
        builder: (context) => MaterialApp(
          navigatorKey: _navigator,
          title: 'Orvia',
          debugShowCheckedModeBanner: false,
          theme: _light,
          darkTheme: _dark,
          themeMode: context.watch<AppearanceController>().value.mode,
          // A slow, eased fade reads as one change rather than a flicker.
          themeAnimationDuration: context.watch<AppearanceController>().transition,
          themeAnimationCurve: Curves.easeInOutCubic,
          // The signed-in providers live above the Navigator so that every pushed
          // screen (call detail, phone connection, settings) can reach them.
          builder: (context, child) => ThemeReveal(
            child: _SessionScope(child: _LockOverlay(child: child ?? const SizedBox.shrink())),
          ),
          home: const _Root(),
        ),
      ),
    );
  }
}

/// Provides the signed-in controllers to the whole Navigator once the owner is
/// signed in.
class _SessionScope extends StatelessWidget {
  const _SessionScope({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final profile = session.profile;
    if (session.stage != SessionStage.ready || profile == null) return child;
    return SignedInScope(key: ValueKey(profile.id), profile: profile, child: child);
  }
}

/// Covers the whole app, pushed screens included, while it is locked.
class _LockOverlay extends StatelessWidget {
  const _LockOverlay({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final lock = context.watch<AppLockController>();
    final session = context.watch<SessionController>();
    final covered = lock.locked && session.stage != SessionStage.signedOut;
    return Stack(
      children: [
        // Kept mounted underneath so live updates and call alerts keep working
        // while locked; hidden from touch and from screen readers.
        ExcludeSemantics(
          excluding: covered,
          child: IgnorePointer(ignoring: covered, child: child),
        ),
        if (covered) const Positioned.fill(child: LockScreen()),
      ],
    );
  }
}

class _Root extends StatefulWidget {
  const _Root();

  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  SessionStage? _previous;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final stage = session.stage;

    // Typing the password just proved who is holding the phone.
    if (_previous == SessionStage.signedOut && stage != SessionStage.signedOut && stage != SessionStage.starting) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<AppLockController>().unlockAfterSignIn();
      });
    }
    _previous = stage;

    return switch (stage) {
      SessionStage.starting => const SplashScreen(),
      SessionStage.signedOut => const LoginScreen(),
      SessionStage.mustChangePassword => const ChangePasswordScreen(),
      SessionStage.noBusiness => const NoBusinessScreen(),
      SessionStage.ready => const ShellScreen(),
    };
  }
}

/// Everything that exists only while an owner is signed in: the controllers
/// behind each tab, the live-update feed and the call alerts. Created on
/// sign-in and disposed on sign-out, so nothing of one account can leak into
/// the next.
class SignedInScope extends StatefulWidget {
  const SignedInScope({super.key, required this.profile, required this.child});

  final Profile profile;
  final Widget child;

  /// For the sign-out flow, which needs to tell the server before the session
  /// ends.
  static SignedInScopeState of(BuildContext context) => context.findAncestorStateOfType<SignedInScopeState>()!;

  @override
  State<SignedInScope> createState() => SignedInScopeState();
}

class SignedInScopeState extends State<SignedInScope> {
  late final AppDependencies _deps = context.read<AppDependencies>();
  late final AppLockController _lock = context.read<AppLockController>();

  late final OrviaApi _api = _deps.api;
  late final HomeController home = HomeController(_api);
  late final CallsController calls = CallsController(_api);
  late final AppointmentsController appointments = AppointmentsController(_api);
  late final FollowUpsController followUps = FollowUpsController(_api);
  late final SettingsController settings = SettingsController(_api);
  late final ForwardingService _forwarding = ForwardingService(
    gateway: _deps.telephony,
    store: PrefsForwardingStore(_deps.prefs, userId: widget.profile.id),
    now: _deps.now,
  );
  late final PhoneSetupController phone = PhoneSetupController(
    service: _forwarding,
    gateway: _deps.telephony,
    permissions: _deps.permissions,
    api: _api,
    lock: _lock,
    onStateChanged: _onForwardingChanged,
  );
  late final LiveSync _live = LiveSync(_api);
  late final CallAlerts alerts = CallAlerts(
    api: _api,
    notifier: _deps.notifier,
    prefs: _deps.prefs,
    userId: widget.profile.id,
    now: _deps.now,
  );

  DeviceRegistrar? _registrar;
  StreamSubscription<ChangedTable>? _sub;
  StreamSubscription<String>? _taps;
  final Set<ChangedTable> _pending = {};
  Timer? _flushTimer;
  bool _phoneLoaded = false;
  bool _disposed = false;

  @override
  void initState() {
    super.initState();
    home.addListener(_onHome);
    unawaited(_boot());
  }

  Future<void> _boot() async {
    await _deps.notifier.init();
    if (_disposed) return;
    _taps = _deps.notifier.openedCalls.listen(_openCall);
    final id = await Installation.id(_deps.prefs);
    _registrar = DeviceRegistrar(
      api: _api,
      installationId: id,
      appVersion: _deps.appVersion,
      pushToken: _deps.pushToken,
    );
    if (_disposed) return;

    await Future.wait<void>([home.refresh(), calls.refresh(), appointments.refresh(), followUps.refresh()]);
    if (_disposed) return;
    await alerts.askPermissionOnce(_deps.permissions);
    if (_disposed) return;
    unawaited(alerts.check());

    _live.start();
    _sub = _live.events.listen((t) {
      _pending.add(t);
      _flushTimer ??= Timer(const Duration(milliseconds: 60), _flush);
    });
  }

  /// Several tables changing together (a call finishing touches calls, maybe
  /// appointments and the queue) cause one round of refreshes, not several.
  void _flush() {
    _flushTimer = null;
    final tables = _pending.toList();
    _pending.clear();
    if (_disposed || tables.isEmpty) return;

    home.refresh(silent: true).ignore();
    if (tables.contains(ChangedTable.calls)) {
      calls.refresh(silent: true).ignore();
      unawaited(alerts.check());
      phone.checkForTestCall().ignore();
    }
    if (tables.contains(ChangedTable.appointments)) appointments.refresh(silent: true).ignore();
    if (tables.contains(ChangedTable.followUps)) followUps.refresh(silent: true).ignore();
  }

  void _onHome() {
    final o = home.overview;
    if (o == null) return;
    if (!_phoneLoaded) {
      _phoneLoaded = true;
      phone.load(aiNumber: o.forwardTarget).then((_) {
        final registrar = _registrar;
        if (registrar != null && !_disposed) unawaited(registrar.sync(phone.state));
      }).ignore();
    } else if (phone.target != null || phone.targetProblem != null) {
      phone.setTarget(o.forwardTarget);
    }
  }

  /// A tapped notification opens that call on top of the tabs.
  void _openCall(String id) {
    final nav = context.read<GlobalKey<NavigatorState>>().currentState;
    if (nav == null || _disposed) return;
    nav
      ..popUntil((r) => r.isFirst)
      ..push(MaterialPageRoute<void>(builder: (_) => CallDetailScreen.byId(callId: id)));
  }

  void _onForwardingChanged(ForwardingState s) {
    final registrar = _registrar;
    if (registrar != null && !_disposed) unawaited(registrar.sync(s));
  }

  /// Called before the session ends: forget this install on the server. The
  /// forwarding set on the SIM is left alone on purpose; the sign-out dialog
  /// says so.
  Future<void> beforeSignOut() async {
    await _registrar?.unregister();
    await alerts.forget();
    await _deps.notifier.clearAll();
  }

  @override
  void dispose() {
    _disposed = true;
    _flushTimer?.cancel();
    unawaited(_sub?.cancel());
    unawaited(_taps?.cancel());
    unawaited(_live.dispose());
    home.removeListener(_onHome);
    home.dispose();
    calls.dispose();
    appointments.dispose();
    followUps.dispose();
    settings.dispose();
    phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<HomeController>.value(value: home),
        ChangeNotifierProvider<CallsController>.value(value: calls),
        ChangeNotifierProvider<AppointmentsController>.value(value: appointments),
        ChangeNotifierProvider<FollowUpsController>.value(value: followUps),
        ChangeNotifierProvider<SettingsController>.value(value: settings),
        ChangeNotifierProvider<PhoneSetupController>.value(value: phone),
        Provider<CallAlerts>.value(value: alerts),
        Provider<Profile>.value(value: widget.profile),
      ],
      child: widget.child,
    );
  }
}
