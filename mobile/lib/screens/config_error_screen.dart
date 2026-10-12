import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/palette.dart';
import '../widgets/common.dart';

/// Shown instead of the app when the build has no usable backend settings.
/// Only a developer ever sees this.
class ConfigErrorApp extends StatelessWidget {
  const ConfigErrorApp({super.key, required this.problems});

  final List<String> problems;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      home: Builder(
        builder: (context) => Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(kGutter),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 40),
                  Icon(Icons.settings_suggest_outlined, size: 40, color: context.c.warn),
                  const SizedBox(height: 16),
                  Text('This build is not configured', style: context.text.headlineSmall),
                  const SizedBox(height: 12),
                  for (final p in problems) ...[
                    Text(p, style: context.text.bodyMedium),
                    const SizedBox(height: 6),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    'Build with --dart-define-from-file=env.json. See env.example.json.',
                    style: context.text.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
