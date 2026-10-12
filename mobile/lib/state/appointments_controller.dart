import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/safe_notifier.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';

class AppointmentsController extends ChangeNotifier with SafeNotifier {
  AppointmentsController(this._api);

  final OrviaApi _api;

  AppointmentRange range = AppointmentRange.upcoming;
  List<Appointment> items = const [];
  bool loading = false;
  String? error;

  /// Set when a status change was rolled back; the screen shows it once.
  String? actionError;

  int _generation = 0;

  Future<void> refresh({bool silent = false}) async {
    final generation = ++_generation;
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      final list = await _api.appointments(range);
      if (generation != _generation) return;
      items = list;
      error = null;
    } catch (e) {
      if (generation != _generation) return;
      error = friendlyError(e);
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> setRange(AppointmentRange next) async {
    if (next == range) return;
    range = next;
    items = const [];
    await refresh();
  }

  /// Optimistic: the card updates at once and snaps back if the server says no.
  Future<void> setStatus(Appointment appointment, AppointmentStatus status) async {
    final before = items;
    items = [
      for (final a in items)
        if (a.id == appointment.id)
          Appointment(
            id: a.id,
            customerName: a.customerName,
            customerPhone: a.customerPhone,
            start: a.start,
            end: a.end,
            status: status,
            serviceType: a.serviceType,
            notes: a.notes,
            callId: a.callId,
          )
        else
          a,
    ];
    actionError = null;
    notifyListeners();
    try {
      await _api.setAppointmentStatus(appointment.id, status);
    } catch (e) {
      items = before;
      actionError = friendlyError(e);
      notifyListeners();
    }
  }

  void clearActionError() {
    actionError = null;
  }
}
