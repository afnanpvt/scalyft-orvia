import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/log.dart';
import 'models/json.dart';
import 'models/models.dart';
import 'orvia_api.dart';

/// The Supabase-backed [OrviaApi].
///
/// Security model: this talks to the database as the signed-in user with the
/// public anon key, so what it can do is exactly what row-level security and
/// column grants allow (see supabase/migrations/017). Nothing here is trusted
/// for authorization; it only shapes queries.
class SupabaseOrviaApi implements OrviaApi {
  SupabaseOrviaApi(this._db);

  final SupabaseClient _db;

  // Light columns for list rows: the transcript is the heavy part.
  static const _callListColumns =
      'id,status,outcome,summary,caller_phone,started_at,ended_at,duration_secs,'
      'created_at,extracted_data,transcript_status,ai_failure_reason,recording_url';

  @override
  Future<Overview?> overview() async {
    final res = await _db.rpc<dynamic>('mobile_overview');
    if (res is! Map) return null;
    return Overview.fromJson(jsonMap(res));
  }

  @override
  Future<List<CallRecord>> calls({DateTime? before, int limit = 20, CallFilter filter = CallFilter.all}) async {
    var q = _db.from('calls').select(_callListColumns);
    if (before != null) q = q.lt('created_at', before.toUtc().toIso8601String());
    switch (filter) {
      case CallFilter.all:
        break;
      case CallFilter.missed:
        q = q.inFilter('status', ['missed', 'failed']);
      case CallFilter.booked:
        q = q.eq('outcome', 'appointment_booked');
      case CallFilter.leads:
        q = q.eq('outcome', 'lead_captured');
    }
    final rows = await q.order('created_at', ascending: false).limit(limit.clamp(1, 100));
    return rows.map((r) => CallRecord.fromJson(jsonMap(r))).toList();
  }

  @override
  Future<CallRecord?> call(String id) async {
    final row = await _db.from('calls').select().eq('id', id).maybeSingle();
    return row == null ? null : CallRecord.fromJson(jsonMap(row));
  }

  @override
  Future<List<CallRecord>> callsSince(DateTime since) async {
    final rows = await _db
        .from('calls')
        .select(_callListColumns)
        .gt('created_at', since.toUtc().toIso8601String())
        .order('created_at', ascending: false)
        .limit(50);
    return rows.map((r) => CallRecord.fromJson(jsonMap(r))).where((c) => !c.isTestCall).toList();
  }

  @override
  Future<List<Appointment>> appointments(AppointmentRange range) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final base = _db.from('appointments').select();
    final rows = range == AppointmentRange.upcoming
        ? await base.gte('scheduled_start', now).order('scheduled_start', ascending: true).limit(100)
        : await base.lt('scheduled_start', now).order('scheduled_start', ascending: false).limit(100);
    return rows.map((r) => Appointment.fromJson(jsonMap(r))).toList();
  }

  @override
  Future<void> setAppointmentStatus(String id, AppointmentStatus status) =>
      _updateOne('appointments', id, {'status': status.wire, 'updated_at': _nowIso()});

  @override
  Future<List<FollowUp>> followUps() async {
    final rows = await _db
        .from('call_queue')
        .select()
        .eq('status', 'pending')
        .order('priority', ascending: true)
        .order('created_at', ascending: true)
        .limit(50);
    return rows.map((r) => FollowUp.fromJson(jsonMap(r))).toList();
  }

  @override
  Future<void> markFollowUpHandled(String id) =>
      _updateOne('call_queue', id, {'status': 'handled', 'handled_at': _nowIso()});

  @override
  Future<List<Lead>> leads() async {
    final rows = await _db
        .from('leads')
        .select()
        .inFilter('status', ['new', 'contacted'])
        .order('created_at', ascending: false)
        .limit(50);
    return rows.map((r) => Lead.fromJson(jsonMap(r))).toList();
  }

  @override
  Future<void> setLeadStatus(String id, LeadStatus status) =>
      _updateOne('leads', id, {'status': status.wire, 'updated_at': _nowIso()});

  @override
  Future<List<OpEvent>> openEvents() async {
    final rows = await _db
        .from('operational_events')
        .select()
        .eq('resolved', false)
        .order('created_at', ascending: false)
        .limit(20);
    return rows.map((r) => OpEvent.fromJson(jsonMap(r))).toList();
  }

  @override
  Future<void> resolveEvent(String id) => _updateOne('operational_events', id, {'resolved': true});

  @override
  Future<BusinessSettings> settings() async {
    final row = await _db.from('businesses').select('settings').limit(1).maybeSingle();
    return BusinessSettings.fromJson(jsonMap(row?['settings']));
  }

  @override
  Future<void> patchSettings(Map<String, String?> patch) async {
    await _db.rpc<dynamic>('patch_business_settings', params: {'p_patch': patch});
  }

  @override
  Future<void> registerDevice({
    required String installationId,
    required String? pushToken,
    required String appVersion,
    required Map<String, Object?> forwarding,
  }) async {
    await _db.rpc<dynamic>('register_mobile_device', params: {
      'p_installation_id': installationId,
      'p_push_token': pushToken,
      'p_app_version': appVersion,
      'p_forwarding': forwarding,
    });
  }

  @override
  Future<void> unregisterDevice(String installationId) async {
    await _db.rpc<dynamic>('unregister_mobile_device', params: {'p_installation_id': installationId});
  }

  // ── realtime ─────────────────────────────────────────────────────────────

  @override
  Stream<ChangedTable> changes() {
    late final StreamController<ChangedTable> controller;
    RealtimeChannel? channel;

    controller = StreamController<ChangedTable>.broadcast(
      onListen: () {
        final ch = _db.channel('orvia-changes-${DateTime.now().microsecondsSinceEpoch}');
        void watch(String table, ChangedTable tag) {
          ch.onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: table,
            callback: (_) {
              if (!controller.isClosed) controller.add(tag);
            },
          );
        }

        watch('calls', ChangedTable.calls);
        watch('appointments', ChangedTable.appointments);
        watch('call_queue', ChangedTable.followUps);
        watch('operational_events', ChangedTable.events);
        ch.subscribe((status, error) {
          Log.d('realtime ${status.name}');
        });
        channel = ch;
      },
      onCancel: () async {
        final ch = channel;
        channel = null;
        if (ch != null) await _db.removeChannel(ch);
        await controller.close();
      },
    );
    return controller.stream;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  String _nowIso() => DateTime.now().toUtc().toIso8601String();

  /// An UPDATE that RLS or a column grant silently reduces to zero rows would
  /// look like success. Ask for the row back so it cannot go unnoticed.
  Future<void> _updateOne(String table, String id, Map<String, Object?> values) async {
    final rows = await _db.from(table).update(values).eq('id', id).select('id');
    if (rows.isEmpty) {
      throw const PostgrestException(message: 'Nothing was updated.', code: '42501');
    }
  }
}
