'use client';

import { Component, type ReactNode } from 'react';
import { ErrorState } from './error-state';

interface Props {
  /** Named in the error message so the user knows which panel failed. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one failing panel from taking down the page.
 *
 * Wraps a Suspense boundary so a server component that throws while streaming
 * degrades into an inline error with a retry, not a blank screen.
 */
export class SectionBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (error) {
      return (
        <ErrorState
          compact
          title={`${this.props.label} tidak dapat dimuat`}
          description={error.message || 'Sumber data tidak merespons. Coba muat ulang panel ini.'}
          onRetry={this.reset}
        />
      );
    }

    return this.props.children;
  }
}
