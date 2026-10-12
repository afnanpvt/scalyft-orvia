import 'package:flutter/material.dart';

import '../theme/palette.dart';
import '../widgets/phone_line.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const PhoneLine(state: LineState.covering),
              const SizedBox(height: 12),
              Text('Orvia', style: context.text.headlineMedium),
            ],
          ),
        ),
      ),
    );
  }
}
