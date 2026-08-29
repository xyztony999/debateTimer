import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './styles/index.css';
import { ColorModeProvider } from './context/ColorModeContext';
import { FeedbackProvider } from './context/FeedbackContext';
import App from './App';
import reportWebVitals from './reportWebVitals';

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
