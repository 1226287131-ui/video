import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Changes the hashed entry bundle on recovery releases so clients cannot reuse a bad cached module response.
document.documentElement.dataset.build = '2026-08-30.1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
