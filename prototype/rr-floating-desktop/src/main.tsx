import React from 'react';
import ReactDOM from 'react-dom/client';
import { Desktop } from './desktop/Desktop';
import { StoreProvider } from './state/store';
import './styles/tokens.css';
import './styles/desktop.css';
import './styles/windows.css';
import './styles/studio.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <Desktop />
    </StoreProvider>
  </React.StrictMode>,
);
