import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryContainer extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App render failed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }

    return this.props.children
  }
}

function ErrorFallback({ error }: Readonly<{ error: Error | null }>) {
  const { t } = useTranslation()

  return (
    <div
      style={{
        alignItems: 'center',
        background: '#f5f1e8',
        color: '#1f2933',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
      }}
    >
      <section
        style={{
          background: '#fffdf8',
          border: '1px solid #d7cec2',
          borderRadius: '12px',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
          maxWidth: '560px',
          padding: '32px',
          width: '100%',
        }}
      >
        <h1 style={{ margin: '0 0 12px' }}>{t('errors.unexpected_title')}</h1>
        <p style={{ margin: '0 0 8px' }}>{t('errors.unexpected_message')}</p>
        <p style={{ margin: '0 0 20px' }}>{t('errors.reload_hint')}</p>
        <button type="button" onClick={() => globalThis.location.reload()}>
          {t('actions.reload')}
        </button>
        {error?.message ? (
          <details style={{ marginTop: '20px' }}>
            <summary>{t('errors.details')}</summary>
            <pre
              style={{
                margin: '12px 0 0',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {error.message}
            </pre>
          </details>
        ) : null}
      </section>
    </div>
  )
}

export default ErrorBoundaryContainer