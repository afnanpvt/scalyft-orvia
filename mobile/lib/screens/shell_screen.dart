import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/followups_controller.dart';
import 'appointments/appointments_screen.dart';
import 'calls/calls_screen.dart';
import 'followups/followups_screen.dart';
import 'home/home_screen.dart';
import 'settings/settings_screen.dart';

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  void goTo(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final open = context.select<FollowUpsController, int>((c) => c.openCount);

    return PopScope(
      // Back from a tab other than Home returns to Home before leaving the app.
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) goTo(0);
      },
      child: Scaffold(
        body: IndexedStack(
          index: _index,
          children: [
            HomeScreen(onOpenTab: goTo),
            const CallsScreen(),
            const AppointmentsScreen(),
            const FollowUpsScreen(),
            const SettingsScreen(),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: goTo,
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home_rounded),
              label: 'Home',
            ),
            const NavigationDestination(
              icon: Icon(Icons.call_outlined),
              selectedIcon: Icon(Icons.call_rounded),
              label: 'Calls',
            ),
            const NavigationDestination(
              icon: Icon(Icons.event_outlined),
              selectedIcon: Icon(Icons.event_rounded),
              label: 'Bookings',
            ),
            NavigationDestination(
              icon: Badge(isLabelVisible: open > 0, label: Text('$open'), child: const Icon(Icons.inbox_outlined)),
              selectedIcon: Badge(isLabelVisible: open > 0, label: Text('$open'), child: const Icon(Icons.inbox_rounded)),
              label: 'Follow up',
            ),
            const NavigationDestination(
              icon: Icon(Icons.tune_outlined),
              selectedIcon: Icon(Icons.tune_rounded),
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }
}
