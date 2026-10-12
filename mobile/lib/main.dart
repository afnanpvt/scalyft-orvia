import 'package:flutter/material.dart';

import 'app.dart';
import 'app_dependencies.dart';
import 'core/env.dart';
import 'core/log.dart';
import 'screens/config_error_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final env = Env.fromEnvironment();
  final problems = env.problems();
  if (problems.isNotEmpty) {
    // A misconfigured build must say so, not fail on the first request.
    Log.e('invalid configuration: ${problems.join(' | ')}');
    runApp(ConfigErrorApp(problems: problems));
    return;
  }

  final deps = await AppDependencies.production(env);
  runApp(OrviaApp(deps: deps));
}
