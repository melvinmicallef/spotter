import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.js';
import { PwaUpdate } from './components/PwaUpdate.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PwaUpdate />
  </React.StrictMode>,
);
