import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ui } from '@shared/text'

/** {@link ErrorBoundary} state. */
interface ErrorBoundaryState {
  error: Error | null
}

/** Catches render errors and offers a reload instead of a blank window; data is already persisted. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('MTG Dreams crashed while drawing:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="splash crash">
        <h1>{ui.crash.title}</h1>
        <p className="muted">{ui.crash.body}</p>
        <pre className="crash-detail">{error.message}</pre>
        <div className="crash-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            {ui.crash.reload}
          </button>
          <button type="button" onClick={() => this.setState({ error: null })}>
            {ui.crash.carryOn}
          </button>
        </div>
      </div>
    )
  }
}
