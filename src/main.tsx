import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureSession } from './radio/apiSession';

// Ask for this visit's API session as the page loads, so the first call already has its token.
void ensureSession().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
