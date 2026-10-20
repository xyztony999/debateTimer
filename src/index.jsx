import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './styles/index.css';
import { ColorModeProvider } from './context/ColorModeContext';
import { FeedbackProvider } from './context/FeedbackContext';
import App from './App';
import reportWebVitals from './reportWebVitals';

// D25 (PageSpec §16): display pages stay open for days. autoUpdate already
// skips waiting, but an already-open page keeps running the old cached
// bundle — reload once when an updated SW takes over a page that had a
// controller. First visits (no controller yet) never reload.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      window.location.reload();
    }
  });
}
registerSW();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ColorModeProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </ColorModeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
