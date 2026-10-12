import 'package:flutter/foundation.dart';

/// A [ChangeNotifier] that ignores notifications after it is disposed. A
/// request that finishes after the user left the screen would otherwise throw.
mixin SafeNotifier on ChangeNotifier {
  bool _disposed = false;
  bool get disposed => _disposed;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
