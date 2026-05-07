'use client';

/**
 * Per-section error boundary for /pocetna widgets (AV-9).
 *
 * Wraps each `<Suspense>` block on the dashboard. When a Suspense child
 * throws (either because its async data rejected, or `withTimeout` fired
 * its TimeoutError), this boundary catches the error and renders the
 * supplied `fallback` instead of letting the error propagate to the
 * segment-level `app/(app)/error.tsx` (which would tear down the whole
 * dashboard, not just one widget).
 *
 * Required nesting: <SectionBoundary> MUST be OUTSIDE <Suspense>. If
 * Suspense wraps the boundary instead, the boundary never sees the
 * thrown rejection.
 *
 * Errors are forwarded to Sentry (PR-2) with section-specific tags so
 * the issues view can be filtered to "which dashboard widget is failing
 * and how often".
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  /** Stable identifier for this section — appears in Sentry tags. */
  sectionId: string;
  /** Rendered when a child of this boundary throws. */
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, {
      tags: { boundary: 'section', sectionId: this.props.sectionId },
      extra: { componentStack: info.componentStack },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
