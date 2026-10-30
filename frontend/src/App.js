import React from 'react';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './components/LandingPage';

export default function App() {
  return (
    <AuthProvider>
      <LandingPage />
    </AuthProvider>
  );
}
