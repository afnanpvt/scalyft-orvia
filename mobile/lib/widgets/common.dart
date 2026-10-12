import 'package:flutter/material.dart';

import '../theme/palette.dart';

const double kGutter = 20;

enum Tone { neutral, good, warn, bad }

/// A small rounded status label. Colour never carries the meaning alone: the
/// text always says it too.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.neutral, this.icon});

  final String label;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = switch (tone) {
      Tone.good => (c.goodSoft, c.goodInk),
      Tone.warn => (c.warnSoft, c.warnInk),
      Tone.bad => (c.badSoft, c.badInk),
      Tone.neutral => (c.line.withValues(alpha: 0.6), c.muted),
    };
    final hasIcon = icon != null;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (hasIcon) Icon(icon, size: 13, color: fg),
            if (hasIcon) const SizedBox(width: 4),
            Text(
              label,
              style: context.text.labelSmall?.copyWith(
                color: fg,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing, this.padding});

  final String title;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding ?? const EdgeInsets.fromLTRB(kGutter, 28, kGutter, 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: context.text.titleMedium,
            semanticsLabel: title,
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

/// Shown when a list has nothing in it yet. Says what will appear and, when
/// there is something to do about it, how.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: c.surface,
                shape: BoxShape.circle,
                border: Border.all(color: c.line),
              ),
              child: Icon(icon, color: c.muted, size: 26),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: context.text.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 300),
              child: Text(
                message,
                style: context.text.bodySmall?.copyWith(height: 1.5),
                textAlign: TextAlign.center,
              ),
            ),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

/// A problem with a way out. Never apologises, always says what to do.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.fromLTRB(kGutter, 12, kGutter, 0),
        padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
        decoration: BoxDecoration(
          color: c.badSoft,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(Icons.error_outline, color: c.badInk, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: context.text.bodyMedium?.copyWith(color: c.badInk),
              ),
            ),
            if (onRetry != null)
              TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(foregroundColor: c.badInk),
                child: const Text('Try again'),
              ),
          ],
        ),
      ),
    );
  }
}

/// Grey placeholder rows while a list loads, so the screen keeps its shape.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 5});

  final int rows;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget bar(double w, double h) => Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: c.line,
        borderRadius: BorderRadius.circular(6),
      ),
    );
    return Semantics(
      label: 'Loading',
      child: Column(
        children: [
          for (var i = 0; i < rows; i++)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: kGutter,
                vertical: 14,
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: c.line,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        bar(140, 14),
                        const SizedBox(height: 8),
                        bar(double.infinity, 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A hairline-separated row, the app's basic list unit. Rows share a surface
/// instead of each being its own card, so a long list stays calm.
class LedgerRow extends StatelessWidget {
  const LedgerRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.semanticLabel,
  });

  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      button: onTap != null,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: kGutter,
            vertical: 14,
          ),
          child: Row(
            // Single-line rows centre against their icon; multi-line rows
            // align to the top.
            crossAxisAlignment: subtitle == null ? CrossAxisAlignment.center : CrossAxisAlignment.start,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 14)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    title,
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      subtitle!,
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 12), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}

/// Round icon holder used as a row's leading element.
class IconDisc extends StatelessWidget {
  const IconDisc(
    this.icon, {
    super.key,
    this.tone = Tone.neutral,
    this.size = 40,
  });

  final IconData icon;
  final Tone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = switch (tone) {
      Tone.good => (c.goodSoft, c.goodInk),
      Tone.warn => (c.warnSoft, c.warnInk),
      Tone.bad => (c.badSoft, c.badInk),
      Tone.neutral => (c.paper, c.muted),
    };
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(color: c.line),
      ),
      child: Icon(icon, size: size * 0.5, color: fg),
    );
  }
}

/// A white sheet that holds a group of rows.
class Sheet extends StatelessWidget {
  const Sheet({super.key, required this.children, this.margin});

  final List<Widget> children;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    // A Material (not a decorated Container) so ink splashes on the rows
    // inside are drawn above the white surface instead of hidden under it.
    return Padding(
      padding: margin ?? const EdgeInsets.symmetric(horizontal: kGutter),
      child: Material(
        color: c.surface,
        // Material animates its outline on its own timer. Off, so the outline
        // follows the light/dark fade with everything else instead of lagging.
        animationDuration: Duration.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: c.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(indent: kGutter, height: 1, color: c.line),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
