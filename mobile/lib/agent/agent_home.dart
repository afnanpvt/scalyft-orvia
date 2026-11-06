import 'package:flutter/material.dart';

import 'call_agent_screen.dart';
import 'outreach_screen.dart';

/// The assistant build's agent area: calls it answers, and outreach test calls.
class AgentHome extends StatelessWidget {
  const AgentHome({super.key, this.defaultOwnerName, this.canLink = true, this.onSignIn});

  final String? defaultOwnerName;
  final bool canLink;
  final VoidCallback? onSignIn;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Call agent'),
          actions: [if (onSignIn != null) TextButton(onPressed: onSignIn, child: const Text('Sign in'))],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Incoming'),
              Tab(text: 'Outreach'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            CallAgentScreen(defaultOwnerName: defaultOwnerName, canLink: canLink, onSignIn: onSignIn, embedded: true),
            const OutreachScreen(),
          ],
        ),
      ),
    );
  }
}
