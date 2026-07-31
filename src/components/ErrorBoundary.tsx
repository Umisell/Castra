import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Castra render error:', error, info);
  }

  resetApp = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-error">
        <div className="app-error-card">
          <div className="app-error-mark">C</div>
          <h1>Castra paused the view</h1>
          <p>{this.state.error.message || 'A runtime error interrupted the app after the last action.'}</p>
          <button onClick={this.resetApp}>Reload app</button>
        </div>
      </div>
    );
  }
}
