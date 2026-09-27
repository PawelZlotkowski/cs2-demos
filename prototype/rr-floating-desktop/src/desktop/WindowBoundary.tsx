import { Component, type ErrorInfo, type ReactNode } from 'react';
import { WIN_TITLE, type WinId } from '../state/store';
import { WindowFrame } from './WindowFrame';

type Props = { id: WinId; children: ReactNode };
type State = { error: Error | null; stack: string };

/**
 * Keeps a crash inside its window: the window shows what went wrong and can be reopened, and the rest of the
 * desktop keeps working. Without it one bad answer from the API unmounts every window.
 */
export class WindowBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.id} window]`, error, info.componentStack);
    this.setState({ stack: `${error.stack ?? error.message}\n\nComponents:${info.componentStack ?? ''}` });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const report = `${WIN_TITLE[this.props.id]} window: ${error.message}\n\n${stack}`;
    return (
      <WindowFrame id={this.props.id} subtitle="Something went wrong">
        <div className="page narrow win-crash">
          <p className="err" role="alert">
            The {WIN_TITLE[this.props.id]} window stopped: {error.message}
          </p>
          <p className="meta">The other windows still work. Try again, and if it keeps happening, copy the details and send them over.</p>
          <div className="plan-actions">
            <button type="button" className="btn btn-default" onClick={() => this.setState({ error: null, stack: '' })}>
              Try Again
            </button>
            <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(report).catch(() => undefined)}>
              Copy Details
            </button>
          </div>
          <details>
            <summary>Details</summary>
            <pre className="crash-stack">{report}</pre>
          </details>
        </div>
      </WindowFrame>
    );
  }
}
