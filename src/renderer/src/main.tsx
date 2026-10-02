import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toasts'
import { loadSettings } from './stores/settings'
import './styles/index.css'

/** Renderer entry. Settings load before the first render so lists render with the correct `bundleBasics`. */
void loadSettings().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </StrictMode>
  )
)
