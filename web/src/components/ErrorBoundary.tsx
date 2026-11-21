import { Component, type ReactNode } from 'react'
import { NoticeFrame } from './common/NoticeFrame'
import { StatusNotice } from './common/StatusNotice'

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
      // This sits outside the router, so the header has no Home button. Go Home loads the home page afresh instead.
      return (
        <NoticeFrame home={null}>
          <div className="w-full max-w-lg">
            <StatusNotice
              title="Something went wrong"
              actions={
                <>
                  <button onClick={() => window.location.reload()} className="btn btn-primary flex-1 py-2">
                    Reload Page
                  </button>
                  <button
                    onClick={() => {
                      this.setState({ hasError: false, error: null })
                      window.location.href = '/'
                    }}
                    className="btn btn-secondary flex-1 py-2"
                  >
                    Go Home
                  </button>
                </>
              }
            >
              <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
              <pre className="mt-3 bg-[var(--chrome)] p-4 rounded text-xs text-[var(--ivory-muted)] overflow-auto max-h-64">
                {this.state.error?.stack}
              </pre>
            </StatusNotice>
          </div>
        </NoticeFrame>
      )
    }

    return this.props.children
  }
}
