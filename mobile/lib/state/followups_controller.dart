import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/safe_notifier.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';

/// Callbacks Orvia could not complete, and open leads.
class FollowUpsController extends ChangeNotifier with SafeNotifier {
  FollowUpsController(this._api);

  final OrviaApi _api;

  List<FollowUp> callbacks = const [];
  List<Lead> leads = const [];
  bool loading = false;
  String? error;
  String? actionError;

  int _generation = 0;

  /// Badge count for the navigation bar.
  int get openCount => callbacks.length + leads.where((l) => l.status == LeadStatus.newLead).length;

  Future<void> refresh({bool silent = false}) async {
    final generation = ++_generation;
    if (!silent && callbacks.isEmpty && leads.isEmpty) {
      loading = true;
      notifyListeners();
    }
    try {
      final r = await Future.wait<Object>([_api.followUps(), _api.leads()]);
      if (generation != _generation) return;
      callbacks = r[0] as List<FollowUp>;
      leads = r[1] as List<Lead>;
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

  Future<void> markHandled(FollowUp item) async {
    final before = callbacks;
    callbacks = callbacks.where((f) => f.id != item.id).toList();
    actionError = null;
    notifyListeners();
    try {
      await _api.markFollowUpHandled(item.id);
    } catch (e) {
      callbacks = before;
      actionError = friendlyError(e);
      notifyListeners();
    }
  }

  Future<void> setLeadStatus(Lead lead, LeadStatus status) async {
    final before = leads;
    // Closed, booked and lost leave the open list; contacted stays.
    leads = [
      for (final l in leads)
        if (l.id != lead.id)
          l
        else if (status == LeadStatus.contacted)
          Lead(
            id: l.id,
            phone: l.phone,
            status: status,
            urgency: l.urgency,
            createdAt: l.createdAt,
            name: l.name,
            serviceNeeded: l.serviceNeeded,
            notes: l.notes,
          ),
    ];
    actionError = null;
    notifyListeners();
    try {
      await _api.setLeadStatus(lead.id, status);
    } catch (e) {
      leads = before;
      actionError = friendlyError(e);
      notifyListeners();
    }
  }

  void clearActionError() {
    actionError = null;
  }
}
