import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--chrome)] flex items-center justify-center p-4">
          <div className="modal-chrome rounded-lg p-8 max-w-lg">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <p className="text-[var(--ivory-muted)] mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <pre className="bg-[var(--chrome)] p-4 rounded text-sm text-[var(--ivory-muted)] overflow-auto max-h-64">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Go Home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
