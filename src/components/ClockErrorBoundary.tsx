"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ClockErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[clock] render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Clock page error</h1>
          <p className="text-sm text-red-600 dark:text-red-400">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
