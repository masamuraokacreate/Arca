import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'

// Service Worker のバックグラウンド登録
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ThemeProvider>
  </StrictMode>,
)
