import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { applyTheme, getTheme } from './lib/identity';
import './styles.css';

// Thema meteen toepassen, vóór de eerste render, om een flits te voorkomen.
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Registreer de service worker voor offline app-schil (alleen in productie).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
