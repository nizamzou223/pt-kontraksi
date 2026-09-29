import React from 'react'
import { AlertOctagon } from 'lucide-react'

interface State { hasError: boolean; error?: Error }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertOctagon className="w-12 h-12 text-red-400" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800">Terjadi Kesalahan</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md">
              {this.state.error?.message ?? 'Komponen mengalami error yang tidak terduga.'}
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Coba Lagi
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
