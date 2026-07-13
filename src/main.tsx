import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import { I18nProvider } from './i18n';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: '#1E293B',
              border: '1px solid #0891B2',
              color: '#E2E8F0',
              fontFamily: 'monospace',
              fontSize: '13px',
            },
          }}
        />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
