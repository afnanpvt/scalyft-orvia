import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/safe_notifier.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';

/// Everything on the home screen: the overview numbers, the live call, the
/// recent calls and the things that need the owner.
class HomeController extends ChangeNotifier with SafeNotifier {
  HomeController(this._api);

  final OrviaApi _api;

  Overview? overview;
  List<CallRecord> recentCalls = const [];
  List<OpEvent> events = const [];
  bool loading = false;
  String? error;

  int _generation = 0;

  bool get hasData => overview != null;

  /// [silent] keeps the current content on screen (pull-to-refresh and live
  /// updates) instead of flashing a spinner.
  Future<void> refresh({bool silent = false}) async {
    final generation = ++_generation;
    if (!silent && overview == null) {
      loading = true;
      notifyListeners();
    }
    try {
      final results = await Future.wait<Object?>([
        _api.overview(),
        _api.calls(limit: 5),
        _api.openEvents(),
      ]);
      if (generation != _generation) return; // a newer refresh superseded this one
      overview = results[0] as Overview?;
      recentCalls = results[1]! as List<CallRecord>;
      events = results[2]! as List<OpEvent>;
      error = null;
    } catch (e) {
      if (generation != _generation) return;
      // Keep showing the last good data; only say so if there is none.
      error = friendlyError(e);
    } finally {
      if (generation == _generation) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> resolveEvent(OpEvent event) async {
    final before = events;
    events = events.where((e) => e.id != event.id).toList();
    notifyListeners();
    try {
      await _api.resolveEvent(event.id);
    } catch (e) {
      events = before;
      error = friendlyError(e);
      notifyListeners();
    }
  }
}
