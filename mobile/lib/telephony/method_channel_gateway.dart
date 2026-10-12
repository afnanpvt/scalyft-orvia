import 'package:flutter/services.dart';

import '../core/log.dart';
import 'telephony_gateway.dart';

/// [TelephonyGateway] over the `com.scalyft.orvia/telephony` channel
/// implemented in TelephonyChannel.kt.
class MethodChannelTelephonyGateway implements TelephonyGateway {
  MethodChannelTelephonyGateway([MethodChannel? channel])
      : _channel = channel ?? const MethodChannel('com.scalyft.orvia/telephony');

  final MethodChannel _channel;

  @override
  Future<TelephonyCapabilities> capabilities() async {
    try {
      final m = await _channel.invokeMapMethod<Object?, Object?>('capabilities');
      return m == null ? const TelephonyCapabilities() : TelephonyCapabilities.fromMap(m);
    } on PlatformException catch (e) {
      Log.w('capabilities failed: ${e.code}');
      return const TelephonyCapabilities();
    } on MissingPluginException {
      return const TelephonyCapabilities();
    }
  }

  @override
  Future<List<SimInfo>> listSims() async {
    try {
      final list = await _channel.invokeListMethod<Map<Object?, Object?>>('listSims');
      return (list ?? const []).map(SimInfo.fromMap).toList()
        ..sort((a, b) => a.slotIndex.compareTo(b.slotIndex));
    } on PlatformException {
      return const [];
    } on MissingPluginException {
      return const [];
    }
  }

  @override
  Future<UssdResult> sendUssd(String code, {int? subscriptionId}) async {
    try {
      final m = await _channel.invokeMapMethod<Object?, Object?>('sendUssd', {
        'code': code,
        'subscriptionId': subscriptionId,
      });
      return m == null ? const UssdResult(UssdStatus.failed) : UssdResult.fromMap(m);
    } on PlatformException catch (e) {
      Log.w('sendUssd platform error: ${e.code}');
      return const UssdResult(UssdStatus.failed);
    } on MissingPluginException {
      return const UssdResult(UssdStatus.unsupported);
    }
  }

  @override
  Future<bool> dialCode(String code, {bool auto = false, int? subscriptionId}) async {
    try {
      return await _channel.invokeMethod<bool>('dialCode', {
            'code': code,
            'auto': auto,
            'subscriptionId': subscriptionId,
          }) ??
          false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  @override
  Future<void> setSecureWindow(bool enabled) async {
    try {
      await _channel.invokeMethod<void>('setSecureWindow', {'enabled': enabled});
    } on PlatformException {
      // best effort
    } on MissingPluginException {
      // not on a device (tests)
    }
  }
}
