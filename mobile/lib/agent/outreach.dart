import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/common.dart' show Tone;

/// Outreach test calls: the agent dials a number the owner typed, pitches, and
/// tries to book a meeting. Numbers and results stay on this phone.
class Outreach {
  Outreach._();

  static const _channel = MethodChannel('com.scalyft.orvia/gemini_phone');

  static Future<void> call(OutreachContact contact, OutreachOffer offer) => _channel.invokeMethod('placeOutboundCall', {
    'contactId': contact.id,
    'number': contact.number,
    'name': contact.name,
    'business': contact.business,
    'company': offer.company,
    'pitch': offer.pitch,
    'availability': offer.availability,
  });

  static Future<OutreachStatus> status() async =>
      OutreachStatus.fromMap(await _channel.invokeMapMethod<String, Object?>('outreachStatus') ?? const {});

  static Future<List<OutreachCallRecord>> calls() async {
    final raw = await _channel.invokeListMethod<Object?>('outreachCalls') ?? const [];
    return raw.whereType<Map<Object?, Object?>>().map(OutreachCallRecord.fromMap).toList();
  }

  static Future<void> takeOver() => _channel.invokeMethod('outreachTakeOver');
  static Future<void> hangUp() => _channel.invokeMethod('outreachHangUp');
}

@immutable
class OutreachContact {
  const OutreachContact({required this.id, required this.number, this.name = '', this.business = ''});

  factory OutreachContact.fromJson(Map<String, Object?> j) => OutreachContact(
    id: j['id'] as String? ?? '',
    number: j['number'] as String? ?? '',
    name: j['name'] as String? ?? '',
    business: j['business'] as String? ?? '',
  );

  final String id;
  final String number;
  final String name;
  final String business;

  String get label => [name, business].where((s) => s.trim().isNotEmpty).join(' · ');

  Map<String, Object?> toJson() => {'id': id, 'number': number, 'name': name, 'business': business};
}

@immutable
class OutreachOffer {
  const OutreachOffer({required this.company, required this.pitch, required this.availability});

  static const fallback = OutreachOffer(
    company: 'Orvia',
    pitch:
        'Orvia is an AI receptionist for plumbing and home service businesses. It answers every call '
        '24/7, including when the owner is on a job or after hours, books the job, and texts the owner '
        'the details right away. Most small shops miss a lot of calls, and most people who reach voicemail '
        'call a competitor instead. Plans start at \$149 a month with a free trial, and early customers get '
        'a founding rate of \$99 a month for 6 months.',
    availability: 'Weekdays, 10am to 5pm Eastern',
  );

  factory OutreachOffer.fromJson(Map<String, Object?> j) => OutreachOffer(
    company: j['company'] as String? ?? fallback.company,
    pitch: j['pitch'] as String? ?? fallback.pitch,
    availability: j['availability'] as String? ?? fallback.availability,
  );

  final String company;
  final String pitch;
  final String availability;

  Map<String, Object?> toJson() => {'company': company, 'pitch': pitch, 'availability': availability};
}

/// Contacts and the offer, kept in this phone's app storage only.
class OutreachStore {
  OutreachStore(this._prefs);

  static const _contactsKey = 'outreach_contacts';
  static const _offerKey = 'outreach_offer';

  final SharedPreferences _prefs;

  static Future<OutreachStore> open() async => OutreachStore(await SharedPreferences.getInstance());

  List<OutreachContact> contacts() {
    final raw = _prefs.getString(_contactsKey);
    if (raw == null) return const [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map<String, Object?>>()
          .map(OutreachContact.fromJson)
          .where((c) => c.number.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> saveContacts(List<OutreachContact> contacts) =>
      _prefs.setString(_contactsKey, jsonEncode(contacts.map((c) => c.toJson()).toList()));

  OutreachOffer offer() {
    final raw = _prefs.getString(_offerKey);
    if (raw == null) return OutreachOffer.fallback;
    try {
      return OutreachOffer.fromJson(jsonDecode(raw) as Map<String, Object?>);
    } catch (_) {
      return OutreachOffer.fallback;
    }
  }

  Future<void> saveOffer(OutreachOffer offer) => _prefs.setString(_offerKey, jsonEncode(offer.toJson()));
}

@immutable
class OutreachStatus {
  const OutreachStatus({required this.phase, this.contactId, this.error});

  factory OutreachStatus.fromMap(Map<String, Object?> m) => OutreachStatus(
    phase: m['phase'] as String? ?? 'idle',
    contactId: m['contactId'] as String?,
    error: m['error'] as String?,
  );

  /// idle, dialing, talking, taken_over or ended.
  final String phase;
  final String? contactId;
  final String? error;

  bool get busy => phase == 'dialing' || phase == 'talking' || phase == 'taken_over';
}

@immutable
class OutreachCallRecord {
  const OutreachCallRecord({
    required this.id,
    required this.contactId,
    required this.startedAt,
    required this.endedAt,
    required this.outcome,
    required this.notes,
    required this.turns,
    this.meeting,
    this.error,
  });

  factory OutreachCallRecord.fromMap(Map<Object?, Object?> m) {
    final meeting = m['meeting'];
    return OutreachCallRecord(
      id: m['id'] as String? ?? '',
      contactId: m['contactId'] as String? ?? '',
      startedAt: DateTime.fromMillisecondsSinceEpoch((m['startedAt'] as int?) ?? 0),
      endedAt: DateTime.fromMillisecondsSinceEpoch((m['endedAt'] as int?) ?? 0),
      outcome: m['outcome'] as String? ?? '',
      notes: (m['notes'] as List?)?.whereType<String>().toList() ?? const [],
      turns:
          (m['turns'] as List?)
              ?.whereType<Map<Object?, Object?>>()
              .map((t) => (fromThem: t['role'] == 'user', text: t['content'] as String? ?? ''))
              .toList() ??
          const [],
      meeting: meeting is Map ? meeting.map((k, v) => MapEntry('$k', '${v ?? ''}')) : null,
      error: m['error'] as String?,
    );
  }

  final String id;
  final String contactId;
  final DateTime startedAt;
  final DateTime endedAt;
  final String outcome;
  final List<String> notes;
  final List<({bool fromThem, String text})> turns;
  final Map<String, String>? meeting;
  final String? error;

  Duration get duration => endedAt.difference(startedAt);
}

/// How an outcome reads on screen.
(String, Tone) outcomeLabel(String outcome) => switch (outcome) {
  'meeting_booked' => ('Meeting booked', Tone.good),
  'interested' => ('Interested', Tone.good),
  'call_back' => ('Call back', Tone.warn),
  'not_interested' => ('Not interested', Tone.neutral),
  'do_not_call' => ('Do not call', Tone.bad),
  'wrong_number' => ('Wrong number', Tone.neutral),
  'voicemail' => ('Voicemail', Tone.neutral),
  'no_answer' => ('No answer', Tone.neutral),
  'taken_over' => ('You took over', Tone.neutral),
  'owner_hung_up' => ('You hung up', Tone.neutral),
  'failed' => ('Failed', Tone.bad),
  _ => ('Ended', Tone.neutral),
};
