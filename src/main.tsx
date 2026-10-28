import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import './styles.css';
import './glass.css';
import './system.css';
import './auth.css';
import './graphite.css';
createRoot(document.getElementById('root')!).render(<AuthGate />);
