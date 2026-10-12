import 'dart:async';

import 'package:flutter/widgets.dart';

import '../core/log.dart';
import '../data/orvia_api.dart';

/// Tells screens when to refetch. Two sources, merged:
///  * Supabase realtime, for instant updates while the connection is healthy.
///  * a slow poll while the app is in the foreground, because a mobile socket
///    drops silently and a missed event must not mean stale data.
/// Events carry no data on purpose: the app always refetches through its
/// normal, access-checked queries.
class LiveSync with WidgetsBindingObserver {
  LiveSync(
    this._api, {
    this.pollEvery = const Duration(seconds: 45),
    this.debounce = const Duration(milliseconds: 350),
  });

  final OrviaApi _api;
  final Duration pollEvery;
  final Duration debounce;

  final _out = StreamController<ChangedTable>.broadcast();
  StreamSubscription<ChangedTable>? _realtime;
  Timer? _poll;
  final Map<ChangedTable, Timer> _pending = {};
  bool _foreground = true;
  bool _started = false;

  Stream<ChangedTable> get events => _out.stream;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _listenRealtime();
    _startPolling();
  }

  void _listenRealtime() {
    _realtime?.cancel().ignore();
    _realtime = _api.changes().listen(
      _schedule,
      onError: (Object e) => Log.w('realtime error ${e.runtimeType}'),
    );
  }

  void _startPolling() {
    _poll?.cancel();
    if (pollEvery <= Duration.zero) return;
    _poll = Timer.periodic(pollEvery, (_) {
      if (_foreground) refreshAll();
    });
  }

  /// Ask every screen to refetch now.
  void refreshAll() {
    for (final t in ChangedTable.values) {
      _emit(t);
    }
  }

  void _schedule(ChangedTable table) {
    _pending[table]?.cancel();
    _pending[table] = Timer(debounce, () {
      _pending.remove(table);
      _emit(table);
    });
  }

  void _emit(ChangedTable t) {
    if (!_out.isClosed) _out.add(t);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final fg = state == AppLifecycleState.resumed;
    if (fg && !_foreground) {
      // Coming back: the socket may have died while we were away.
      _listenRealtime();
      refreshAll();
    }
    _foreground = fg || state == AppLifecycleState.inactive;
  }

  Future<void> dispose() async {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    for (final t in _pending.values) {
      t.cancel();
    }
    _pending.clear();
    await _realtime?.cancel();
    await _out.close();
  }
}
