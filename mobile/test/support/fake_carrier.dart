import 'package:orvia/telephony/telephony_gateway.dart';

/// A pretend network operator. It parses the same GSM codes the app sends and
/// keeps real per-service state, so tests exercise behavior, not canned text.
class FakeCarrier {
  /// service code ("21", "61", ...) -> forwarded-to number
  final Map<String, String> forwarding = {};

  /// Ring timer set via `**61*number**seconds#`.
  int? noReplySeconds;

  /// Make the next [n] requests fail the way a rejecting carrier does.
  int rejectNext = 0;

  /// Reply with a wordier carrier-specific text instead of the defaults.
  String Function(String code, bool active, String? number)? customReply;

  static final _activate = RegExp(r'^\*\*(\d\d)\*(\+?\d+)(?:\*\*(\d+))?#$');
  static final _erase = RegExp(r'^##(\d\d)#$');
  static final _query = RegExp(r'^\*#(\d\d)#$');

  UssdResult handle(String code) {
    if (rejectNext > 0) {
      rejectNext--;
      return const UssdResult(UssdStatus.ok, response: 'Connection problem or invalid MMI code.');
    }

    final a = _activate.firstMatch(code);
    if (a != null) {
      forwarding[a[1]!] = a[2]!;
      if (a[1] == '61' && a[3] != null) noReplySeconds = int.parse(a[3]!);
      return UssdResult(UssdStatus.ok, response: customReply?.call(code, true, a[2]) ?? 'Call forwarding activated');
    }
    final e = _erase.firstMatch(code);
    if (e != null) {
      forwarding.remove(e[1]);
      return UssdResult(UssdStatus.ok, response: customReply?.call(code, false, null) ?? 'Erasure was successful');
    }
    final q = _query.firstMatch(code);
    if (q != null) {
      final to = forwarding[q[1]!];
      if (customReply != null) return UssdResult(UssdStatus.ok, response: customReply!(code, to != null, to));
      return UssdResult(
        UssdStatus.ok,
        response: to == null ? 'Voice call: Not forwarded' : 'Voice call: Forwarded to $to',
      );
    }
    return const UssdResult(UssdStatus.ok, response: 'Connection problem or invalid MMI code.');
  }
}

/// A [TelephonyGateway] backed by a [FakeCarrier].
class FakeTelephonyGateway implements TelephonyGateway {
  FakeTelephonyGateway({FakeCarrier? carrier}) : carrier = carrier ?? FakeCarrier();

  final FakeCarrier carrier;

  TelephonyCapabilities caps = const TelephonyCapabilities(
    hasTelephony: true,
    canSendUssd: true,
    callPhoneGranted: true,
    readPhoneStateGranted: true,
    simReady: true,
    operatorName: 'TestTel',
    sdkInt: 35,
  );

  List<SimInfo> sims = const [];

  /// Every code sent, with the SIM it was sent on.
  final List<({String code, int? subscriptionId})> sent = [];

  /// Overrides the carrier for one request (to simulate timeouts etc.).
  UssdResult? Function(String code)? interceptor;

  final List<String> dialed = [];

  /// Codes handed to the Phone app to send (auto), with the SIM asked for.
  final List<({String code, int? subscriptionId})> phoneAppSent = [];
  bool secureWindow = false;

  @override
  Future<TelephonyCapabilities> capabilities() async => caps;

  @override
  Future<List<SimInfo>> listSims() async => sims;

  @override
  Future<UssdResult> sendUssd(String code, {int? subscriptionId}) async {
    sent.add((code: code, subscriptionId: subscriptionId));
    return interceptor?.call(code) ?? carrier.handle(code);
  }

  @override
  Future<bool> dialCode(String code, {bool auto = false, int? subscriptionId}) async {
    dialed.add(code);
    if (auto) phoneAppSent.add((code: code, subscriptionId: subscriptionId));
    return true;
  }

  @override
  Future<void> setSecureWindow(bool enabled) async => secureWindow = enabled;
}
