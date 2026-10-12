import 'package:flutter/foundation.dart';

import '../core/friendly_error.dart';
import '../core/safe_notifier.dart';
import '../data/models/models.dart';
import '../data/orvia_api.dart';

/// The call list: filter, pull-to-refresh and keyset pagination.
class CallsController extends ChangeNotifier with SafeNotifier {
  CallsController(this._api, {this.pageSize = 20});

  final OrviaApi _api;
  final int pageSize;

  CallFilter filter = CallFilter.all;
  List<CallRecord> items = const [];
  bool loading = false;
  bool loadingMore = false;
  bool hasMore = true;
  String? error;

  /// Bumped on every refresh or filter change. A response that arrives for an
  /// older generation is dropped, so a slow request can never overwrite a
  /// newer filter's results.
  int _generation = 0;

  Future<void> refresh({bool silent = false}) async {
    final generation = ++_generation;
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      final page = await _api.calls(limit: pageSize, filter: filter);
      if (generation != _generation) return;
      items = page;
      hasMore = page.length >= pageSize;
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

  Future<void> setFilter(CallFilter next) async {
    if (next == filter) return;
    filter = next;
    items = const [];
    hasMore = true;
    await refresh();
  }

  Future<void> loadMore() async {
    if (loading || loadingMore || !hasMore || items.isEmpty) return;
    final generation = _generation;
    loadingMore = true;
    notifyListeners();
    try {
      final page = await _api.calls(before: items.last.createdAt, limit: pageSize, filter: filter);
      if (generation != _generation) return;
      final seen = items.map((c) => c.id).toSet();
      items = [...items, ...page.where((c) => !seen.contains(c.id))];
      hasMore = page.length >= pageSize;
    } catch (e) {
      if (generation != _generation) return;
      error = friendlyError(e);
    } finally {
      if (generation == _generation) {
        loadingMore = false;
        notifyListeners();
      }
    }
  }

  /// The full record (with transcript) for the detail screen.
  Future<CallRecord?> detail(String id) => _api.call(id);
}
