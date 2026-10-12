import 'models/models.dart';

enum CallFilter { all, missed, booked, leads }

enum AppointmentRange { upcoming, past }

/// A hint that something changed on the server. The app refetches; it never
/// trusts the payload, so a replayed or spoofed event can do no harm.
enum ChangedTable { calls, appointments, followUps, events }

/// Everything the screens need from the Orvia backend. Screens depend on this
/// interface only, so tests inject fakes and the Supabase types stay in one
/// file.
abstract class OrviaApi {
  /// The home-screen snapshot. Null when the signed-in user has no business.
  Future<Overview?> overview();

  /// Newest first. Pass the oldest `createdAt` seen as [before] to page.
  Future<List<CallRecord>> calls({DateTime? before, int limit = 20, CallFilter filter = CallFilter.all});

  /// Full record including the transcript.
  Future<CallRecord?> call(String id);

  /// Real (non-test) calls created after [since]. Used to confirm that call
  /// forwarding actually reaches Orvia.
  Future<List<CallRecord>> callsSince(DateTime since);

  Future<List<Appointment>> appointments(AppointmentRange range);
  Future<void> setAppointmentStatus(String id, AppointmentStatus status);

  Future<List<FollowUp>> followUps();
  Future<void> markFollowUpHandled(String id);

  Future<List<Lead>> leads();
  Future<void> setLeadStatus(String id, LeadStatus status);

  Future<List<OpEvent>> openEvents();
  Future<void> resolveEvent(String id);

  Future<BusinessSettings> settings();

  /// Null or empty value clears a key. Only greeting, transfer_number and
  /// notification_phone are accepted; the server enforces that too.
  Future<void> patchSettings(Map<String, String?> patch);

  Future<void> registerDevice({
    required String installationId,
    required String? pushToken,
    required String appVersion,
    required Map<String, Object?> forwarding,
  });

  Future<void> unregisterDevice(String installationId);

  /// Emits whenever a watched table changes. Completes never; cancel to stop.
  Stream<ChangedTable> changes();
}
