/**
 * Error Boundary — ловит ошибки React-рендеринга.
 * Показывает fallback UI вместо белого экрана.
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-8">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-mono text-rose-400">U.N.A. столкнулась с ошибкой</h1>
            <p className="text-sm text-slate-400">
              Произошла ошибка рендеринга. Это не критично — данные сохранены.
            </p>
            <pre className="text-xs text-slate-500 bg-slate-900 p-3 rounded overflow-auto max-h-40">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-una-600 hover:bg-una-500 text-white rounded-lg font-mono text-sm"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
