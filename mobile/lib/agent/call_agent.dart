import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/env.dart';
import '../core/log.dart';

/// The on-phone call agent exists only in the "assistant" build, where the
/// Android side registers this channel. Everywhere else [CallAgent.available]
/// is false and nothing here is called.
class CallAgent {
  CallAgent._();

  static const _channel = MethodChannel('com.scalyft.orvia/gemini_phone');

  static bool get available => appFlavor == 'assistant';

  static Future<AgentStatus> status() async =>
      AgentStatus.fromMap(await _channel.invokeMapMethod<String, Object?>('status') ?? const {});

  static Future<AgentStatus> setEnabled(bool enabled) async => AgentStatus.fromMap(
    await _channel.invokeMapMethod<String, Object?>('setAgentEnabled', {'enabled': enabled}) ?? const {},
  );

  static Future<AgentConfig> config() async =>
      AgentConfig.fromMap(await _channel.invokeMapMethod<String, Object?>('config') ?? const {});

  /// Only the given values change.
  static Future<void> configure({
    String? ownerName,
    String? apiKey,
    String? model,
    String? voice,
    int? answerDelaySecs,
  }) => _channel.invokeMethod('configure', {
    'ownerName': ?ownerName,
    'apiKey': ?apiKey,
    'model': ?model,
    'voice': ?voice,
    'answerDelaySecs': ?answerDelaySecs,
  });

  static Future<List<AgentCall>> calls() async {
    final raw = await _channel.invokeListMethod<Object?>('agentCalls') ?? const [];
    return raw.whereType<Map<Object?, Object?>>().map(AgentCall.fromMap).toList();
  }

  static Future<void> sync() => _channel.invokeMethod('syncAgentCalls');
  static Future<void> requestShizukuPermission() => _channel.invokeMethod('requestShizukuPermission');
  static Future<bool> openShizuku() async => await _channel.invokeMethod<bool>('openShizuku') ?? false;
  static Future<void> requestBatteryExemption() => _channel.invokeMethod('requestBatteryExemption');
  static Future<void> openVendorBatterySettings() => _channel.invokeMethod('openVendorBatterySettings');
  static Future<void> setBatteryAcknowledged(bool done) =>
      _channel.invokeMethod('setBatteryAcknowledged', {'done': done});

  /// Links quietly after sign-in, so calls reach the dashboard without a visit
  /// to the Call agent screen.
  static Future<void> linkIfNeeded() async {
    try {
      if (!(await config()).linked) {
        final error = await link();
        if (error != null) Log.w('call agent not linked: $error');
      }
    } on PlatformException catch (_) {}
  }

  static Future<void> startTalk() => _channel.invokeMethod('startTalk');
  static Future<void> stopTalk() => _channel.invokeMethod('stopTalk');

  /// Owner joins the live call; the agent steps out but the call stays connected.
  static Future<void> takeOverCall() => _channel.invokeMethod('takeOverCall');

  /// Ends the live call the agent is on.
  static Future<void> hangUpCall() => _channel.invokeMethod('hangUpCall');

  /// Answers the caller's request for the owner: join, busy, or a typed message.
  static Future<void> answerOwner(OwnerAnswer answer, {String text = ''}) =>
      _channel.invokeMethod('answerOwner', {'answer': answer.name, 'text': text});

  /// Numbers the agent never answers.
  static Future<List<String>> skipNumbers() async => await _channel.invokeListMethod<String>('skipNumbers') ?? const [];

  static Future<void> setSkipNumbers(List<String> numbers) =>
      _channel.invokeMethod('setSkipNumbers', {'numbers': numbers});
  static Future<String> testUplink() async => await _channel.invokeMethod<String>('testCallUplink') ?? '';
  static Future<String> probeDownlink() async => await _channel.invokeMethod<String>('probeCallAudio') ?? '';

  /// Gives the agent its own credential for the dashboard, so it can save calls
  /// while the app is closed. Needs a signed-in user. Returns null on success,
  /// otherwise a short reason.
  static Future<String?> link() async {
    final env = Env.fromEnvironment();
    final client = Supabase.instance.client;
    if (client.auth.currentSession == null) return 'Sign in first';
    try {
      final res = await client.functions.invoke('device-agent', body: {'action': 'register'});
      final data = res.data;
      final token = data is Map ? data['token'] as String? : null;
      if (token == null || token.isEmpty) return 'The server did not return a link';
      await _channel.invokeMethod('linkBackend', {
        'supabaseUrl': env.supabaseUrl.trim(),
        'anonKey': env.supabaseAnonKey.trim(),
        'deviceToken': token,
      });
      return null;
    } on FunctionException catch (e) {
      Log.e('device-agent register failed: ${e.status} ${e.details}');
      return e.status == 404 ? 'The dashboard link is not set up on the server yet' : 'Could not link (${e.status})';
    } catch (e) {
      Log.e('device-agent register failed: $e');
      return 'Could not reach Orvia';
    }
  }
}

enum ShizukuState { offline, noPermission, ready }

enum OwnerAnswer { join, busy, reply }

@immutable
class AgentStatus {
  const AgentStatus({
    required this.enabled,
    required this.running,
    required this.state,
    required this.shizuku,
    required this.batteryExempt,
    required this.batteryAcknowledged,
    required this.vendor,
    required this.talking,
    required this.onCall,
    this.ownerRequest,
    this.liveTurns = const [],
  });

  factory AgentStatus.fromMap(Map<String, Object?> m) => AgentStatus(
    enabled: m['enabled'] == true,
    running: m['running'] == true,
    state: (m['state'] as String?) ?? 'Off',
    shizuku: switch (m['shizuku']) {
      'ready' => ShizukuState.ready,
      'no_permission' => ShizukuState.noPermission,
      _ => ShizukuState.offline,
    },
    batteryExempt: m['batteryExempt'] == true,
    batteryAcknowledged: m['batteryAcknowledged'] == true,
    vendor: (m['vendor'] as String?) ?? '',
    talking: m['talking'] == true,
    onCall: m['onCall'] == true,
    ownerRequest: m['ownerRequest'] as String?,
    liveTurns:
        (m['liveTurns'] as List?)
            ?.whereType<Map<Object?, Object?>>()
            .map((t) => (fromCaller: t['role'] == 'user', text: t['content'] as String? ?? ''))
            .toList() ??
        const [],
  );

  final bool enabled;
  final bool running;
  final String state;
  final ShizukuState shizuku;
  final bool batteryExempt;
  final bool batteryAcknowledged;
  final String vendor;
  final bool talking;

  /// True while the agent is handling a live call, so the UI can offer take-over.
  final bool onCall;

  /// Set while the caller is waiting to hear if the owner can join: why they asked.
  final String? ownerRequest;

  /// The last few lines of the live conversation.
  final List<({bool fromCaller, String text})> liveTurns;

  /// vivo and iQOO kill background apps through their own power manager, which
  /// the standard exemption does not cover and no app can read back.
  bool get hasVendorPowerManager => vendor == 'vivo' || vendor == 'iqoo';

  bool get keepsRunning => batteryAcknowledged || (batteryExempt && !hasVendorPowerManager);
}

@immutable
class AgentConfig {
  const AgentConfig({
    required this.ownerName,
    required this.model,
    required this.voice,
    required this.hasApiKey,
    required this.answerDelaySecs,
    required this.linked,
  });

  factory AgentConfig.fromMap(Map<String, Object?> m) => AgentConfig(
    ownerName: (m['ownerName'] as String?) ?? '',
    model: (m['model'] as String?) ?? '',
    voice: (m['voice'] as String?) ?? 'Kore',
    hasApiKey: m['hasApiKey'] == true,
    answerDelaySecs: (m['answerDelaySecs'] as int?) ?? 5,
    linked: m['linked'] == true,
  );

  final String ownerName;
  final String model;
  final String voice;
  final bool hasApiKey;
  final int answerDelaySecs;
  final bool linked;
}

@immutable
class AgentCall {
  const AgentCall({
    required this.id,
    required this.startedAt,
    required this.endedAt,
    required this.callerNumber,
    required this.uploaded,
    required this.uploadError,
    required this.notes,
    required this.turns,
  });

  factory AgentCall.fromMap(Map<Object?, Object?> m) => AgentCall(
    id: m['id'] as String? ?? '',
    startedAt: DateTime.fromMillisecondsSinceEpoch((m['startedAt'] as int?) ?? 0),
    endedAt: DateTime.fromMillisecondsSinceEpoch((m['endedAt'] as int?) ?? 0),
    callerNumber: m['callerNumber'] as String? ?? '',
    uploaded: m['uploaded'] == true,
    uploadError: m['uploadError'] as String?,
    notes: (m['notes'] as List?)?.whereType<String>().toList() ?? const [],
    turns:
        (m['turns'] as List?)
            ?.whereType<Map<Object?, Object?>>()
            .map((t) => (fromCaller: t['role'] == 'user', text: t['content'] as String? ?? ''))
            .toList() ??
        const [],
  );

  final String id;
  final DateTime startedAt;
  final DateTime endedAt;
  final String callerNumber;
  final bool uploaded;
  final String? uploadError;
  final List<String> notes;
  final List<({bool fromCaller, String text})> turns;

  Duration get duration => endedAt.difference(startedAt);
}
