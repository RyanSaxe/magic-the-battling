import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { markClassicScrollbars } from './utils/scrollbars'
import { watchForForgottenSeats } from './utils/tabSession'

markClassicScrollbars()
watchForForgottenSeats()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
