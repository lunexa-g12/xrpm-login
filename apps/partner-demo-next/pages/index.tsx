import React, { useState } from 'react';
import { LoginButton, QrModal } from '@xrpm-login/ui-react';

export default function Home() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [pollUrl, setPollUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Read error from URL (set by callback handler on failure)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setError(decodeURIComponent(err));
  }, []);

  function handleChallengeReady(link: string, challengeId: string) {
    setError(null);
    setDeepLink(link);
    if (challengeId) setPollUrl(`/api/auth/poll?challenge_id=${challengeId}`);
  }

  function handleClose() {
    setDeepLink(null);
    setPollUrl(undefined);
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '8px' }}>XRPM Partner Demo</h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>
        Sign in by proving you hold at least 10 XRPM tokens.
      </p>

      <LoginButton
        challengeUrl="/api/auth/start"
        onChallengeReady={handleChallengeReady}
        onError={(e) => setError(e.message)}
      />

      {error && (
        <p style={{ color: '#ef4444', marginTop: '16px', fontSize: '14px' }}>
          Error: {error}
        </p>
      )}

      <QrModal
        deepLink={deepLink}
        pollUrl={pollUrl}
        onClose={handleClose}
        title="Sign In With XRPM"
      />

      <p style={{ marginTop: '48px', fontSize: '12px', color: '#aaa', maxWidth: '360px', textAlign: 'center' }}>
        This demo is for development purposes only. By using this tool you agree
        to the{' '}
        <a href="https://github.com/xrpmemes/xrpm-login/blob/main/DISCLAIMER.md" style={{ color: '#0066cc' }}>
          XRPM Login Disclaimer
        </a>.
      </p>
    </main>
  );
}
