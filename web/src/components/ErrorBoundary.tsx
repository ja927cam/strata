import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Strata UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-page">
        <h1>Something went wrong</h1>
        <p>The map or page could not be rendered. Reloading usually fixes it.</p>
        <pre>{this.state.error.message}</pre>
        <div className="button-row">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload Strata
          </button>
          <a className="btn btn-ghost" href="/">
            Return home
          </a>
        </div>
      </main>
    );
  }
}
