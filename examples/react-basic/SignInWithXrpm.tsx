/**
 * Sign In With XRPM — React basic example
 *
 * Drop this component into any React app.
 * Your backend must implement /api/auth/start and /api/auth/callback
 * using @xrpm-login/sdk-web.
 *
 * Install:
 *   npm install @xrpm-login/ui-react
 *
 * DISCLAIMER: Read DISCLAIMER.md before using in production.
 */

import React, { useState, useEffect } from 'react';
import { LoginButton, QrModal, StatusPanel } from '@xrpm-login/ui-react';

interface User {
  address: string;
  balance?: string;
}

export function SignInWithXrpm() {
  const [user, setUser] = useState<User | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user is already signed in (e.g. from a session cookie)
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.address) setUser(data); })
      .catch(() => {});
  }, []);

  if (user) {
    return (
      <StatusPanel
        address={user.address}
        balance={user.balance}
        onSignOut={async () => {
          await fetch('/api/auth/signout', { method: 'POST' });
          setUser(null);
        }}
      />
    );
  }

  return (
    <>
      <LoginButton
        challengeUrl="/api/auth/start"
        onDeepLink={(link) => { setError(null); setDeepLink(link); }}
        onError={(e) => setError(e.message)}
      />

      {error && (
        <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '12px' }}>
          {error}
        </p>
      )}

      <QrModal
        deepLink={deepLink}
        onClose={() => setDeepLink(null)}
        pollUrl="/api/auth/poll"
      />
    </>
  );
}
