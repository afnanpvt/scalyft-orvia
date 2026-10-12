import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_dependencies.dart';
import '../../data/orvia_api.dart';
import '../../state/calls_controller.dart';
import '../../theme/palette.dart';
import '../../widgets/common.dart';
import 'call_detail_screen.dart';
import 'call_tile.dart';

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 400) context.read<CallsController>().loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  static const _filters = {
    CallFilter.all: 'All',
    CallFilter.missed: 'Missed',
    CallFilter.booked: 'Booked',
    CallFilter.leads: 'Details taken',
  };

  @override
  Widget build(BuildContext context) {
    final calls = context.watch<CallsController>();
    final now = context.read<AppDependencies>().now();

    return Scaffold(
      appBar: AppBar(title: const Text('Calls')),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: kGutter, vertical: 6),
              children: [
                for (final e in _filters.entries) ...[
                  ChoiceChip(
                    label: Text(e.value),
                    selected: calls.filter == e.key,
                    onSelected: (_) => calls.setFilter(e.key),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          if (calls.error != null && calls.items.isNotEmpty) ErrorBanner(calls.error!, onRetry: calls.refresh),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => calls.refresh(silent: true),
              child: _body(context, calls, now),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, CallsController calls, DateTime now) {
    if (calls.loading && calls.items.isEmpty) {
      return ListView(children: const [SkeletonList()]);
    }
    if (calls.items.isEmpty) {
      // Scrollable so pull-to-refresh still works on an empty list.
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 420,
            child: calls.error != null
                ? EmptyState(
                    icon: Icons.wifi_off_rounded,
                    title: 'Could not load calls',
                    message: calls.error!,
                    action: OutlinedButton(onPressed: calls.refresh, child: const Text('Try again')),
                  )
                : EmptyState(
                    icon: Icons.call_outlined,
                    title: calls.filter == CallFilter.all ? 'No calls yet' : 'Nothing here',
                    message: calls.filter == CallFilter.all
                        ? 'Calls Orvia answers will show up here with a summary and the full conversation.'
                        : 'No calls match this filter.',
                  ),
          ),
        ],
      );
    }

    return ListView.separated(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: calls.items.length + 1,
      separatorBuilder: (_, _) => Divider(indent: kGutter + 54, color: context.c.line),
      itemBuilder: (context, i) {
        if (i == calls.items.length) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Center(
              child: calls.loadingMore
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : calls.hasMore
                      ? const SizedBox.shrink()
                      : Text('That is every call', style: context.text.bodySmall),
            ),
          );
        }
        final call = calls.items[i];
        return CallTile(
          call: call,
          now: now,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => CallDetailScreen(initial: call)),
          ),
        );
      },
    );
  }
}
