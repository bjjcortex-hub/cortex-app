import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

interface State {
  hasError: boolean
  error: Error | null
}

class GlobalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('BJJ Cortex ErrorBoundary caught exception:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#0f172a', color: '#fff', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 10px 0' }}>⚠️ Diagnóstico de Exceção do BJJ Cortex</h2>
          <p style={{ color: '#94a3b8', margin: '0 0 16px 0' }}>Ocorreu uma exceção ao renderizar a aplicação:</p>
          <pre style={{ background: '#1e293b', padding: 16, borderRadius: 8, color: '#f87171', overflowX: 'auto', fontSize: 13, border: '1px solid #334155' }}>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}
          >
            🔄 Recarregar Aplicação
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
)
