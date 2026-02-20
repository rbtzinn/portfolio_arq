import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import Router from './Router.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
