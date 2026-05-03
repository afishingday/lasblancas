import React, { Component } from 'react'
import { AlertCircle } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error.toString() }
  }
  componentDidCatch(error, errorInfo) {
    console.error('Error capturado:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-10 rounded-[2rem] shadow-xl max-w-lg border border-red-100">
            <AlertCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-stone-900 mb-3">Interrupción Menor</h2>
            <p className="text-stone-700 mb-6 text-sm">
              Protegimos el portal de un error de datos. Haz clic abajo para restaurar.
            </p>
            <div className="bg-stone-100 p-4 rounded-xl text-xs text-left text-red-600 overflow-auto mb-6 font-mono h-24">
              {this.state.errorMsg}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-stone-900 text-white px-8 py-4 rounded-xl font-bold w-full hover:bg-stone-800 transition-colors"
            >
              Restaurar Portal
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
