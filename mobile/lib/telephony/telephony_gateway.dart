import 'package:flutter/foundation.dart';

/// What this phone can do about call forwarding.
@immutable
class TelephonyCapabilities {
  const TelephonyCapabilities({
    this.hasTelephony = false,
    this.canSendUssd = false,
    this.callPhoneGranted = false,
    this.readPhoneStateGranted = false,
    this.simReady = false,
    this.operatorName,
    this.sdkInt = 0,
  });

  factory TelephonyCapabilities.fromMap(Map<Object?, Object?> m) => TelephonyCapabilities(
        hasTelephony: m['hasTelephony'] == true,
        canSendUssd: m['canSendUssd'] == true,
        callPhoneGranted: m['callPhoneGranted'] == true,
        readPhoneStateGranted: m['readPhoneStateGranted'] == true,
        simReady: m['simReady'] == true,
        operatorName: m['operatorName'] as String?,
        sdkInt: (m['sdkInt'] as num?)?.toInt() ?? 0,
      );

  final bool hasTelephony;
  final bool canSendUssd;
  final bool callPhoneGranted;
  final bool readPhoneStateGranted;
  final bool simReady;
  final String? operatorName;
  final int sdkInt;

  /// Whether the app can set forwarding itself, right now.
  bool get canAutomate => hasTelephony && canSendUssd && callPhoneGranted && simReady;

  TelephonyCapabilities copyWith({
    bool? hasTelephony,
    bool? canSendUssd,
    bool? callPhoneGranted,
    bool? readPhoneStateGranted,
    bool? simReady,
  }) =>
      TelephonyCapabilities(
        hasTelephony: hasTelephony ?? this.hasTelephony,
        canSendUssd: canSendUssd ?? this.canSendUssd,
        callPhoneGranted: callPhoneGranted ?? this.callPhoneGranted,
        readPhoneStateGranted: readPhoneStateGranted ?? this.readPhoneStateGranted,
        simReady: simReady ?? this.simReady,
        operatorName: operatorName,
        sdkInt: sdkInt,
      );
}

@immutable
class SimInfo {
  const SimInfo({
    required this.subscriptionId,
    required this.slotIndex,
    this.displayName,
    this.carrierName,
    this.isDefaultVoice = false,
  });

  factory SimInfo.fromMap(Map<Object?, Object?> m) => SimInfo(
        subscriptionId: (m['subscriptionId'] as num?)?.toInt() ?? -1,
        slotIndex: (m['slotIndex'] as num?)?.toInt() ?? 0,
        displayName: m['displayName'] as String?,
        carrierName: m['carrierName'] as String?,
        isDefaultVoice: m['isDefaultVoice'] == true,
      );

  Map<String, Object?> toJson() => {
        'subscriptionId': subscriptionId,
        'slotIndex': slotIndex,
        'displayName': displayName,
        'carrierName': carrierName,
        'isDefaultVoice': isDefaultVoice,
      };

  final int subscriptionId;
  final int slotIndex;
  final String? displayName;
  final String? carrierName;
  final bool isDefaultVoice;

  /// "SIM 1 · Airtel"
  String get label {
    final carrier = (carrierName ?? displayName ?? '').trim();
    return carrier.isEmpty ? 'SIM ${slotIndex + 1}' : 'SIM ${slotIndex + 1} · $carrier';
  }
}

enum UssdStatus {
  /// The carrier answered (the text may still describe an error).
  ok,

  /// The modem or carrier rejected the request.
  failed,

  /// No answer within the time limit.
  timeout,

  /// CALL_PHONE is not granted.
  noPermission,

  /// This phone or Android version cannot send USSD from an app.
  unsupported,

  /// The code did not pass validation. A bug, never user error.
  invalid,
}

@immutable
class UssdResult {
  const UssdResult(this.status, {this.response, this.failureCode});

  factory UssdResult.fromMap(Map<Object?, Object?> m) {
    final raw = m['status'];
    final status = switch (raw) {
      'ok' => UssdStatus.ok,
      'timeout' => UssdStatus.timeout,
      'no_permission' => UssdStatus.noPermission,
      'unsupported' => UssdStatus.unsupported,
      'invalid' => UssdStatus.invalid,
      _ => UssdStatus.failed,
    };
    return UssdResult(
      status,
      response: m['response'] as String?,
      failureCode: (m['failureCode'] as num?)?.toInt(),
    );
  }

  final UssdStatus status;
  final String? response;
  final int? failureCode;
}

/// The only door to the phone's telephony stack. Implemented over a platform
/// channel on Android and faked in tests.
abstract class TelephonyGateway {
  Future<TelephonyCapabilities> capabilities();

  /// Empty when READ_PHONE_STATE is not granted or the phone has one SIM
  /// the platform does not enumerate.
  Future<List<SimInfo>> listSims();

  /// Sends one carrier code and waits for the answer.
  Future<UssdResult> sendUssd(String code, {int? subscriptionId});

  /// Hands the code to the Phone app. With [auto] it is sent straight away
  /// (needs CALL_PHONE) and the Phone app shows the carrier's reply; otherwise
  /// the dialer opens with the code typed in and the owner taps call.
  /// [subscriptionId] picks the SIM on dual-SIM phones where Android allows it.
  Future<bool> dialCode(String code, {bool auto = false, int? subscriptionId});

  /// Blocks screenshots and hides the app preview in the recents screen.
  Future<void> setSecureWindow(bool enabled);
}
