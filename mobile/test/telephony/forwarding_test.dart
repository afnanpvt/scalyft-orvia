import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/telephony/forwarding.dart';
import 'package:orvia/telephony/telephony_gateway.dart';

UssdResult ok(String text) => UssdResult(UssdStatus.ok, response: text);

StepResult interpret(StepPurpose p, UssdResult r, {String? dest}) => UssdInterpreter.interpret(
      UssdStep(kind: ForwardingKind.noReply, purpose: p, code: '*#61#'),
      r,
      destination: dest,
    );

void main() {
  const book = Gsm3gppCodeBook();

  group('ForwardingPlan', () {
    test('ring seconds snap to the 5-second steps carriers accept', () {
      expect(ForwardingPlan.normalizeRing(1), 5);
      expect(ForwardingPlan.normalizeRing(12), 10);
      expect(ForwardingPlan.normalizeRing(13), 15);
      expect(ForwardingPlan.normalizeRing(20), 20);
      expect(ForwardingPlan.normalizeRing(99), 30);
      expect(const ForwardingPlan().copyWith(ringSeconds: 22).ringSeconds, 20);
    });

    test('kinds follow the mode', () {
      expect(const ForwardingPlan().kinds, [ForwardingKind.noReply, ForwardingKind.busy, ForwardingKind.unreachable]);
      expect(const ForwardingPlan(includeBusy: false).kinds, [ForwardingKind.noReply, ForwardingKind.unreachable]);
      expect(const ForwardingPlan(mode: ForwardingMode.everyCall).kinds, [ForwardingKind.unconditional]);
    });

    test('survives a JSON round trip, and bad JSON falls back to defaults', () {
      const plan = ForwardingPlan(mode: ForwardingMode.everyCall, ringSeconds: 10, includeBusy: false, format: DestinationFormat.digitsOnly);
      expect(ForwardingPlan.fromJson(plan.toJson()), plan);
      expect(ForwardingPlan.fromJson({'mode': 'nonsense', 'ringSeconds': 'x'}), const ForwardingPlan());
    });
  });

  group('Gsm3gppCodeBook', () {
    test('activates conditional forwarding with a ring timer on no-reply only', () {
      final codes = book.activate('+919876543210', const ForwardingPlan(ringSeconds: 25)).map((s) => s.code).toList();
      expect(codes, ['**61*+919876543210**25#', '**67*+919876543210#', '**62*+919876543210#']);
    });

    test('activates every-call forwarding', () {
      final codes = book.activate('+14155550100', const ForwardingPlan(mode: ForwardingMode.everyCall)).map((s) => s.code);
      expect(codes, ['**21*+14155550100#']);
    });

    test('can write the destination without the plus', () {
      final codes = book.activate('+919876543210', const ForwardingPlan(format: DestinationFormat.digitsOnly, includeBusy: false, includeUnreachable: false)).map((s) => s.code);
      expect(codes, ['**61*919876543210**20#']);
    });

    const services = [ForwardingKind.unconditional, ForwardingKind.busy, ForwardingKind.noReply, ForwardingKind.unreachable];

    test('deactivates by erasing, and queries with the interrogation code', () {
      expect(book.deactivate(services).map((s) => s.code), ['##21#', '##67#', '##61#', '##62#']);
      expect(book.query([ForwardingKind.noReply]).map((s) => s.code), ['*#61#']);
    });

    test('can erase every forwarding service with one code', () {
      final steps = book.eraseAll();
      expect(steps.map((s) => s.code), ['##002#']);
      expect(steps.single.description, 'Turn off all call forwarding');
    });

    test('refuses a destination that is not an international number', () {
      for (final bad in ['9876543210', '+91987#', '**21*', '', '+91 98;76']) {
        expect(() => book.activate(bad, const ForwardingPlan()), throwsArgumentError, reason: bad);
      }
    });

    test('every generated code has the shape the native validator accepts', () {
      final shape = RegExp(r'^[*#][*#0-9+]*#$');
      final all = [
        ...book.activate('+919876543210', const ForwardingPlan()),
        ...book.activate('+919876543210', const ForwardingPlan(mode: ForwardingMode.everyCall)),
        ...book.deactivate(services),
        ...book.query(services),
        ...book.eraseAll(),
      ];
      for (final s in all) {
        expect(shape.hasMatch(s.code) && s.code.length <= 64, isTrue, reason: s.code);
      }
    });
  });

  group('UssdInterpreter', () {
    test('a transport failure is a failure', () {
      for (final s in [UssdStatus.failed, UssdStatus.timeout, UssdStatus.noPermission, UssdStatus.unsupported]) {
        expect(interpret(StepPurpose.activate, UssdResult(s)).outcome, StepOutcome.failure);
      }
    });

    test('carrier error text is a failure even when the request was delivered', () {
      for (final t in ['Connection problem or invalid MMI code.', 'Service not available', 'Request failed', 'Not allowed for your plan']) {
        expect(interpret(StepPurpose.activate, ok(t)).outcome, StepOutcome.failure, reason: t);
      }
    });

    test('recognizes activation confirmations', () {
      for (final t in ['Call forwarding activated', 'Registration was successful', 'Voice call: Forwarded to +91 98765 43210']) {
        expect(interpret(StepPurpose.activate, ok(t)).outcome, StepOutcome.success, reason: t);
      }
    });

    test('recognizes deactivation confirmations', () {
      for (final t in ['Erasure was successful', 'Call forwarding deactivated', 'Forwarding cancelled']) {
        expect(interpret(StepPurpose.deactivate, ok(t)).outcome, StepOutcome.success, reason: t);
      }
    });

    test('"not forwarded" reads as off, not on', () {
      final r = interpret(StepPurpose.query, ok('Voice call: Not forwarded'));
      expect(r.reading, ForwardingReading.inactive);
      expect(interpret(StepPurpose.query, ok('Call forwarding is not active')).reading, ForwardingReading.inactive);
    });

    test('a query that quotes our number is read as on', () {
      final r = interpret(StepPurpose.query, ok('Divert to 919876543210 after 20s'), dest: '+919876543210');
      expect(r.reading, ForwardingReading.active);
    });

    test('an unclassifiable reply is unconfirmed, not success', () {
      expect(interpret(StepPurpose.activate, ok('Thank you.')).outcome, StepOutcome.unconfirmed);
      expect(interpret(StepPurpose.query, ok('Thank you.')).outcome, StepOutcome.unconfirmed);
    });

    test('an empty reply: a command is accepted, a query tells us nothing', () {
      expect(interpret(StepPurpose.activate, ok('')).outcome, StepOutcome.success);
      expect(interpret(StepPurpose.query, ok('')).outcome, StepOutcome.unconfirmed);
    });

    test('every failure carries a readable detail', () {
      for (final s in UssdStatus.values) {
        final r = interpret(StepPurpose.activate, UssdResult(s, failureCode: s == UssdStatus.failed ? -2 : null));
        expect(r.detail, isNotEmpty);
      }
      expect(interpret(StepPurpose.activate, const UssdResult(UssdStatus.failed, failureCode: -2)).detail, contains('-2'));
    });
  });
}
