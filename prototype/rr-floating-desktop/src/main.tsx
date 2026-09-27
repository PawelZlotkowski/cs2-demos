import React from 'react';
import ReactDOM from 'react-dom/client';
import { Desktop } from './desktop/Desktop';
import { SharedReview } from './screens/SharedReview';
import { SignInScreen } from './screens/SignInScreen';
import { WelcomeAssistant } from './screens/WelcomeAssistant';
import { AuthProvider, useAuth } from './state/auth';
import { StoreProvider } from './state/store';
import './styles/tokens.css';
import './styles/desktop.css';
import './styles/windows.css';
import './styles/studio.css';
import './styles/accounts.css';

/**
 * Who sees what (doc 27 A05). With accounts off the API answers as the local admin and the desktop
 * opens as before. With accounts on, a signed-out browser gets the login screen; a new account or
 * a pending study consent gets the Setup Assistant over the desktop. A share link opens on its own.
 */
function Gate() {
  const { state, failed, user, arrival, welcome } = useAuth();
  if (arrival.kind === 'shared') return <SharedReview token={arrival.token} />;
  // Until /auth/me answers there is nothing to draw but the wallpaper; if the API is down the
  // desktop opens and each window says so
  if (!state && !failed) return <div className="desktop" aria-busy="true" />;
  if (state?.authEnabled && !user) return <SignInScreen />;
  const assistant = !!user && !!state?.authEnabled && (welcome || state.needsConsent);
  return (
    // A new StoreProvider per account, so nothing of the previous user's windows or data carries over
    <StoreProvider key={user?.id ?? 'local'}>
      <Desktop />
      {assistant ? <WelcomeAssistant /> : null}
    </StoreProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </React.StrictMode>,
);
