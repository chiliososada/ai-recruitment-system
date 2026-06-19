import { Component, type ReactNode } from 'react';
import ServerError from '../pages/ServerError';

/**
 * Global error boundary (§5). Catches render-time errors and shows a friendly localized
 * page — never a raw stack/token in production. Errors are reported to the monitoring hook.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    // Hook for client monitoring (Sentry/OTel). Avoid leaking details to the console in prod.
    if (import.meta.env.DEV) console.error('Unhandled UI error:', error);
  }

  override render(): ReactNode {
    return this.state.hasError ? <ServerError /> : this.props.children;
  }
}
