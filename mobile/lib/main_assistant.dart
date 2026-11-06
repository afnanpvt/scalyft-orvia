import 'package:flutter/material.dart';

import 'agent/agent_home.dart';
import 'theme/app_theme.dart';

/// Standalone entry point for the call agent, with no Orvia login. Calls stay
/// on the phone (nothing reaches the dashboard) and Gemini needs the owner's
/// own key. The normal way is the full app:
///   flutter build apk --flavor assistant --dart-define-from-file=env.json
/// This one is:
///   flutter build apk --flavor assistant --target lib/main_assistant.dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _AssistantApp());
}

class _AssistantApp extends StatelessWidget {
  const _AssistantApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Orvia Assistant',
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      home: const AgentHome(canLink: false),
    );
  }
}
