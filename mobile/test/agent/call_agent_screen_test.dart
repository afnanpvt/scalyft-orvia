import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/agent/call_agent_screen.dart';
import 'package:orvia/theme/app_theme.dart';

/// The native side of the call agent, faked. Records every call.
class _FakeAgent {
  _FakeAgent({
    this.enabled = false,
    this.shizuku = 'ready',
    this.hasApiKey = false,
    this.linked = false,
    this.calls = const [],
    this.onCall = false,
  });

  bool enabled;
  String shizuku;
  bool hasApiKey;
  bool linked;
  List<Map<String, Object?>> calls;
  bool onCall;
  String? ownerRequest;
  List<Map<String, String>> liveTurns = [];
  List<String> skip = [];
  final log = <MethodCall>[];

  Map<String, Object?> get status => {
    'enabled': enabled,
    'running': enabled,
    'state': onCall ? 'On a call' : (enabled ? 'On · answers after 5 sec' : 'Off'),
    'shizuku': shizuku,
    'batteryExempt': true,
    'batteryAcknowledged': true,
    'vendor': 'vivo',
    'talking': false,
    'onCall': onCall,
    'ownerRequest': ownerRequest,
    'liveTurns': liveTurns,
  };

  Future<Object?> handle(MethodCall call) async {
    log.add(call);
    switch (call.method) {
      case 'status':
        return status;
      case 'config':
        return {
          'ownerName': 'Alhaan',
          'model': 'gemini-3.8-live',
          'voice': 'Kore',
          'hasApiKey': hasApiKey,
          'answerDelaySecs': 5,
          'linked': linked,
        };
      case 'setAgentEnabled':
        enabled = (call.arguments as Map)['enabled'] == true;
        return status;
      case 'agentCalls':
        return calls;
      case 'skipNumbers':
        return skip;
      case 'setSkipNumbers':
        skip = List<String>.from((call.arguments as Map)['numbers'] as List);
        return true;
      case 'configure':
        final key = (call.arguments as Map)['apiKey'] as String?;
        if (key != null) hasApiKey = key.isNotEmpty;
        return true;
      default:
        return true;
    }
  }
}

void main() {
  const channel = MethodChannel('com.scalyft.orvia/gemini_phone');

  Future<_FakeAgent> pump(WidgetTester tester, _FakeAgent agent, {VoidCallback? onSignIn}) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, agent.handle);
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Brightness.light),
        home: CallAgentScreen(canLink: false, onSignIn: onSignIn ?? () {}),
      ),
    );
    await tester.pumpAndSettle();
    return agent;
  }

  // The screen polls the agent on a timer; replacing it disposes the timer.
  Future<void> unmount(WidgetTester tester) => tester.pumpWidget(const SizedBox());

  testWidgets('signed out with no key, it asks for a key and explains calls stay local', (tester) async {
    await pump(tester, _FakeAgent());
    expect(find.text('Add a Gemini key'), findsOneWidget);
    expect(find.text('Calls stay on this phone'), findsOneWidget);
    expect(find.text('Allow in Shizuku'), findsNothing);
    await unmount(tester);
  });

  testWidgets('it asks for Shizuku access when it is missing', (tester) async {
    await pump(tester, _FakeAgent(shizuku: 'no_permission', hasApiKey: true));
    expect(find.text('Allow in Shizuku'), findsOneWidget);
    expect(find.text('Add a Gemini key'), findsNothing);
    await unmount(tester);
  });

  testWidgets('the switch turns the agent on', (tester) async {
    final agent = await pump(tester, _FakeAgent(hasApiKey: true));
    expect(find.text('Off'), findsOneWidget);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    final toggle = agent.log.where((c) => c.method == 'setAgentEnabled').single;
    expect((toggle.arguments as Map)['enabled'], isTrue);
    expect(find.text('On · answers after 5 sec'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('a saved call says where it is', (tester) async {
    final now = DateTime(2026, 10, 13, 16, 10).millisecondsSinceEpoch;
    Map<String, Object?> call(String id, {required bool uploaded}) => {
      'id': id,
      'startedAt': now,
      'endedAt': now + 95000,
      'callerNumber': '+919876543210',
      'uploaded': uploaded,
      'uploadError': null,
      'notes': ['Wants a callback after 6 pm'],
      'turns': [
        {'role': 'assistant', 'content': 'Hello, this is Alhaan\'s assistant.'},
        {'role': 'user', 'content': 'Please ask him to call me.'},
      ],
    };
    await pump(tester, _FakeAgent(hasApiKey: true, calls: [call('a', uploaded: false)]));
    await tester.scrollUntilVisible(
      find.text('Wants a callback after 6 pm'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('On this phone'), findsOneWidget);
    await unmount(tester);

    await pump(tester, _FakeAgent(hasApiKey: true, linked: true, calls: [call('b', uploaded: true)]));
    await tester.scrollUntilVisible(find.text('In dashboard'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('In dashboard'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('on a live call it offers take over and hang up', (tester) async {
    final agent = await pump(tester, _FakeAgent(enabled: true, hasApiKey: true, onCall: true));
    expect(find.text('Agent is on a call'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Take over'));
    await tester.pumpAndSettle();
    expect(agent.log.any((c) => c.method == 'takeOverCall'), isTrue);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Hang up'));
    await tester.pumpAndSettle();
    expect(agent.log.any((c) => c.method == 'hangUpCall'), isTrue);
    await unmount(tester);
  });

  testWidgets('a live call shows the conversation as it happens', (tester) async {
    final fake = _FakeAgent(enabled: true, hasApiKey: true, onCall: true)
      ..liveTurns = [
        {'role': 'assistant', 'content': "Hi, this is Alhaan's assistant."},
        {'role': 'user', 'content': 'Is he around?'},
      ];
    await pump(tester, fake);
    expect(find.textContaining("Alhaan's assistant", findRichText: true), findsOneWidget);
    expect(find.textContaining('Is he around?', findRichText: true), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('when the caller asks for the owner, the owner can join, say busy or reply', (tester) async {
    final fake = _FakeAgent(enabled: true, hasApiKey: true, onCall: true)..ownerRequest = 'Imran about the invoice';
    await pump(tester, fake);
    expect(find.text('Caller wants to talk to you'), findsOneWidget);
    expect(find.text('Imran about the invoice'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Join'));
    await tester.pump();
    var answer = fake.log.lastWhere((c) => c.method == 'answerOwner').arguments as Map;
    expect(answer['answer'], 'join');

    await tester.tap(find.widgetWithText(OutlinedButton, 'Busy'));
    await tester.pump();
    answer = fake.log.lastWhere((c) => c.method == 'answerOwner').arguments as Map;
    expect(answer['answer'], 'busy');

    await tester.tap(find.text('Call back in 30 min'));
    await tester.pump();
    answer = fake.log.lastWhere((c) => c.method == 'answerOwner').arguments as Map;
    expect(answer['answer'], 'reply');
    expect(answer['text'], 'Call back in 30 min');
    await unmount(tester);
  });

  testWidgets('numbers can be added to and removed from the never-answer list', (tester) async {
    final fake = await pump(tester, _FakeAgent(hasApiKey: true));
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Never answer'), 200, scrollable: scrollable);
    await tester.tap(find.widgetWithText(TextButton, 'Add').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Phone number'), '+91 98765 43210');
    await tester.tap(find.widgetWithText(TextButton, 'Add').last);
    await tester.pumpAndSettle();
    expect(fake.skip, ['+919876543210']);
    expect(find.text('+91 98765 43210'), findsOneWidget);

    await tester.tap(find.byTooltip('Remove'));
    await tester.pumpAndSettle();
    expect(fake.skip, isEmpty);
    await unmount(tester);
  });

  testWidgets('no live-call banner when idle', (tester) async {
    await pump(tester, _FakeAgent(enabled: true, hasApiKey: true));
    expect(find.text('Agent is on a call'), findsNothing);
    await unmount(tester);
  });

  testWidgets('adding a key hides the key step', (tester) async {
    final agent = await pump(tester, _FakeAgent());
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'test-key-123');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(agent.log.any((c) => c.method == 'configure' && (c.arguments as Map)['apiKey'] == 'test-key-123'), isTrue);
    expect(find.text('Add a Gemini key'), findsNothing);
    await unmount(tester);
  });
}
