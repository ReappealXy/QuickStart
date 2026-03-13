import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 错误边界：捕获子组件树渲染错误，防止整页白屏
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info)
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#374151',
            fontSize: '13px',
            background: '#f3f4f6',
            borderRadius: '12px',
            margin: '12px',
            border: '1px solid #e5e7eb',
            minHeight: '120px',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>加载出错</p>
          <pre style={{ fontSize: '11px', wordBreak: 'break-all', textAlign: 'left', whiteSpace: 'pre-wrap', color: '#ef4444' }}>
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
