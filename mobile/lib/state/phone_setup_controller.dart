import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/log.dart';
import '../core/phone.dart';
import '../core/safe_notifier.dart';
import '../data/orvia_api.dart';
import '../platform/app_lock.dart';
import '../platform/permissions.dart';
import '../telephony/forwarding.dart';
import '../telephony/forwarding_service.dart';
import '../telephony/forwarding_state.dart';
import '../telephony/telephony_gateway.dart';

/// Codes going out through the Phone app, one at a time. Android does not
/// tell the app what the carrier answered, so after each one the owner says
/// whether the Phone app showed a confirmation.
@immutable
class PhoneAppTask {
  const PhoneAppTask({required this.purpose, required this.steps, this.index = 0, this.sent = false, this.failed = false});

  final StepPurpose purpose;
  final List<UssdStep> steps;

  /// The step being worked on. Equal to `steps.length` when all are done.
  final int index;

  /// The current step was handed to the Phone app and awaits the owner's word.
  final bool sent;

  /// The owner said the carrier refused one.
  final bool failed;

  UssdStep? get current => index < steps.length ? steps[index] : null;
  bool get done => index >= steps.length;

  PhoneAppTask copyWith({int? index, bool? sent, bool? failed}) => PhoneAppTask(
        purpose: purpose,
        steps: steps,
        index: index ?? this.index,
        sent: sent ?? this.sent,
        failed: failed ?? this.failed,
      );
}

/// Drives the "connect your phone" flow and the on/off switch on the home
/// screen: which number to forward to, how, on which SIM, and whether it
/// really works.
class PhoneSetupController extends ChangeNotifier with SafeNotifier {
  PhoneSetupController({
    required this._service,
    required this._gateway,
    required this._permissions,
    required this._api,
    this._lock,
    this.onStateChanged,
  });

  final ForwardingService _service;
  final TelephonyGateway _gateway;
  final PermissionGateway _permissions;
  final OrviaApi _api;
  final AppLockController? _lock;

  /// Called after every change so the server's informational copy follows.
  final void Function(ForwardingState state)? onStateChanged;

  ForwardingState state = const ForwardingState();
  TelephonyCapabilities caps = const TelephonyCapabilities();
  List<SimInfo> sims = const [];
  SimInfo? selectedSim;
  ForwardingPlan plan = const ForwardingPlan();

  /// The validated number to forward to, or null with [targetProblem] set.
  String? target;
  String? targetProblem;

  bool busy = false;
  bool permissionBlockedForever = false;
  SetupReport? lastReport;
  StatusReport? lastStatus;
  String? error;

  /// Set while codes are going out through the Phone app.
  PhoneAppTask? task;

  /// The app can start a change itself: directly, or through the Phone app.
  bool get canAutomate => caps.hasTelephony && caps.simReady && caps.callPhoneGranted;

  bool get viaPhoneApp => state.route == ForwardingRoute.phoneApp;

  bool get needsPermission => caps.hasTelephony && !caps.callPhoneGranted;

  /// Dial-it-yourself codes for the plan and target, for phones that refuse.
  List<UssdStep> get manualSteps {
    final t = target;
    if (t == null) return const [];
    return const Gsm3gppCodeBook().activate(t, plan);
  }

  List<UssdStep> get manualOffSteps => const Gsm3gppCodeBook().deactivate(plan.kinds);

  // ── loading ──────────────────────────────────────────────────────────────

  /// [aiNumber] is the number from the overview (`ai_number` or the display
  /// number); it is validated here, never trusted as-is.
  Future<void> load({required String? aiNumber}) async {
    setTarget(aiNumber);
    state = await _service.load();
    plan = state.plan;
    caps = await _gateway.capabilities();
    sims = await _gateway.listSims();
    selectedSim = _pickSim(state.simSubscriptionId);
    notifyListeners();
  }

  void setTarget(String? raw) {
    final e164 = Phone.toE164(raw);
    target = e164;
    targetProblem = e164 == null
        ? (raw == null || raw.trim().isEmpty
            ? 'Your Orvia number is not assigned yet. Contact support and we will set it up.'
            : 'Your Orvia number is not in international format yet. Contact support.')
        : null;
    notifyListeners();
  }

  SimInfo? _pickSim(int? preferred) {
    if (sims.isEmpty) return null;
    return sims.where((s) => s.subscriptionId == preferred).firstOrNull ??
        sims.where((s) => s.isDefaultVoice).firstOrNull ??
        sims.first;
  }

  void updatePlan(ForwardingPlan next) {
    plan = next;
    notifyListeners();
  }

  void selectSim(SimInfo sim) {
    selectedSim = sim;
    notifyListeners();
  }

  // ── permission ───────────────────────────────────────────────────────────

  /// Asks for phone access. The lock is told the app is merely away so the
  /// system dialog does not lock the owner out.
  Future<bool> requestPermission() async {
    Future<bool> ask() => _permissions.requestPhone();
    final lock = _lock;
    if (lock != null) {
      await lock.whileAway(ask);
    } else {
      await ask();
    }
    caps = await _gateway.capabilities();
    sims = await _gateway.listSims();
    selectedSim ??= _pickSim(state.simSubscriptionId);
    permissionBlockedForever = !caps.callPhoneGranted && await _permissions.phoneBlockedForever();
    notifyListeners();
    return caps.callPhoneGranted;
  }

  Future<void> openPermissionSettings() async {
    final lock = _lock;
    if (lock != null) {
      await lock.whileAway(_permissions.openSettings);
    } else {
      await _permissions.openSettings();
    }
  }

  // ── actions ──────────────────────────────────────────────────────────────

  Future<SetupReport?> turnOn() => _guard(() async {
        final t = target;
        if (t == null) {
          error = targetProblem;
          return null;
        }
        final report = await _service.activate(destination: t, plan: plan, sim: selectedSim);
        if (report.needsPhoneApp) {
          await _startTask(StepPurpose.activate, destination: t, plan: plan);
        }
        return _finish(report);
      });

  Future<SetupReport?> pause() => _guard(() async {
        final report = await _service.pause();
        if (report.needsPhoneApp) await _startTask(StepPurpose.deactivate);
        return _finish(report);
      });

  Future<SetupReport?> resume() => _guard(() async {
        final destination = state.destination;
        if (destination == null) {
          error = 'Nothing to resume yet. Set up forwarding first.';
          return null;
        }
        final report = await _service.resume();
        if (report.needsPhoneApp) {
          await _startTask(StepPurpose.activate, destination: destination, plan: state.plan);
        }
        return _finish(report);
      });

  /// Asks the carrier what is really set.
  Future<StatusReport?> checkStatus() => _guard(() async {
        final report = await _service.readStatus();
        lastStatus = report;
        state = report.state;
        if (report.needsPhoneApp) await _startTask(StepPurpose.query);
        _announce();
        return report;
      });

  // ── through the Phone app ────────────────────────────────────────────────

  Future<void> _startTask(StepPurpose purpose, {String? destination, ForwardingPlan? plan}) async {
    final steps = await _service.phoneAppSteps(purpose, destination: destination, plan: plan);
    task = PhoneAppTask(purpose: purpose, steps: steps);
  }

  /// Hands the current code to the Phone app, which sends it on the chosen
  /// SIM and shows the carrier's reply on screen.
  Future<bool> sendTaskStep() async {
    final t = task;
    final step = t?.current;
    if (t == null || step == null) return false;
    final lock = _lock;
    Future<bool> send() => _gateway.dialCode(
          step.code,
          auto: true,
          subscriptionId: selectedSim?.subscriptionId ?? state.simSubscriptionId,
        );
    final ok = lock != null ? await lock.whileAway(send) : await send();
    if (!ok) {
      error = 'Could not open the Phone app. Use the codes under "Set it up by hand".';
    } else {
      task = t.copyWith(sent: true, failed: false);
    }
    notifyListeners();
    return ok;
  }

  /// The owner read the Phone app's message: [worked] or not. After the
  /// last code, the result is recorded like a manual setup.
  Future<void> confirmTaskStep({required bool worked}) async {
    final t = task;
    if (t == null || !t.sent) return;
    if (!worked) {
      task = t.copyWith(sent: false, failed: true);
      notifyListeners();
      return;
    }
    final next = t.copyWith(index: t.index + 1, sent: false, failed: false);
    if (!next.done) {
      task = next;
      notifyListeners();
      return;
    }
    task = null;
    switch (t.purpose) {
      case StepPurpose.activate:
        await _recordPhoneApp(on: true);
      case StepPurpose.deactivate:
        await _recordPhoneApp(on: false);
      case StepPurpose.query:
        notifyListeners();
    }
  }

  void cancelTask() {
    task = null;
    notifyListeners();
  }

  Future<void> _recordPhoneApp({required bool on}) async {
    await _guard<bool>(() async {
      state = await _service.recordManual(
        on: on,
        destination: target ?? state.destination,
        plan: plan,
        sim: selectedSim,
        route: ForwardingRoute.phoneApp,
      );
      lastReport = null;
      _announce();
      return true;
    });
  }

  /// The owner dialed the codes by hand and says so.
  Future<void> recordManual({required bool on}) async {
    await _guard<bool>(() async {
      state = await _service.recordManual(
        on: on,
        destination: target,
        plan: plan,
        sim: selectedSim,
      );
      lastReport = null;
      _announce();
      return true;
    });
  }

  /// Looks for a real call that arrived after forwarding was switched on.
  /// True when that proves the setup works.
  Future<bool> checkForTestCall() async {
    if (state.phase != ForwardingPhase.activeUnverified) return state.phase == ForwardingPhase.activeVerified;
    final since = state.activatedAt;
    if (since == null) return false;
    try {
      final calls = await _api.callsSince(since);
      final next = await _service.confirmFromCalls(calls.map((c) => c.createdAt));
      final changed = next.phase != state.phase;
      state = next;
      if (changed) _announce();
      return next.phase == ForwardingPhase.activeVerified;
    } catch (e) {
      Log.w('test call check failed ${e.runtimeType}');
      return false;
    }
  }

  /// Opens the system dialer with [code] typed in; the owner taps call. The
  /// lock is told the app is merely away.
  Future<bool> openDialer(UssdStep step) async {
    final lock = _lock;
    Future<bool> open() => _gateway.dialCode(step.code, subscriptionId: selectedSim?.subscriptionId);
    return lock != null ? lock.whileAway(open) : open();
  }

  Future<void> forget() async {
    await _service.forget();
    state = const ForwardingState();
    plan = const ForwardingPlan();
    lastReport = null;
    lastStatus = null;
    task = null;
    notifyListeners();
  }

  // ── internals ────────────────────────────────────────────────────────────

  SetupReport _finish(SetupReport report) {
    lastReport = report;
    state = report.state;
    if (report.blocked) {
      error = switch (report.blocker!) {
        SetupBlocker.noTelephony => 'This device has no phone service, so it cannot forward calls.',
        SetupBlocker.noSim => 'No SIM card is ready. Insert one and try again.',
        SetupBlocker.noPermission => 'Orvia needs phone access to turn forwarding on.',
        SetupBlocker.unsupported => 'This phone does not let apps change forwarding. Use the steps below.',
      };
    }
    _announce();
    return report;
  }

  void _announce() => onStateChanged?.call(state);

  Future<T?> _guard<T>(Future<T?> Function() body) async {
    if (busy) return null;
    busy = true;
    error = null;
    notifyListeners();
    try {
      return await body();
    } on ArgumentError catch (e) {
      error = 'That number cannot be used for forwarding.';
      Log.w('forwarding argument error: ${e.name}');
      return null;
    } catch (e) {
      error = friendlyError(e);
      return null;
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
