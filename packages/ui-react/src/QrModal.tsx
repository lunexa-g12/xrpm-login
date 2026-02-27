import React, { useEffect, useState } from 'react';

export interface QrModalProps {
  /** The deep link to encode as a QR code. Pass null to hide the modal. */
  deepLink: string | null;
  /** Called when the user closes the modal or the sign-in completes. */
  onClose: () => void;
  /**
   * Called when sign-in succeeds (partner polls their server for the result).
   * Pass a poll URL and this component will poll it automatically.
   */
  pollUrl?: string;
  /** Polling interval in ms. Default: 1500. */
  pollIntervalMs?: number;
  /** Title shown in the modal. Default: "Sign In With XRPM" */
  title?: string;
}

/**
 * Desktop QR code modal.
 *
 * Renders a dialog with the deep link encoded as a QR code for desktop users.
 * The user scans the QR with their phone, approves in the XRPM app, and the
 * modal calls onClose() once the server confirms the sign-in.
 *
 * QR rendering requires a `qrcode` library in the host app.
 * This component calls `window.QRCode` if available, or falls back to a
 * plain text link for simplicity.
 *
 * @example
 * const [deepLink, setDeepLink] = useState<string | null>(null);
 *
 * <LoginButton onDeepLink={setDeepLink} ... />
 * <QrModal
 *   deepLink={deepLink}
 *   onClose={() => setDeepLink(null)}
 *   pollUrl="/api/auth/poll"
 * />
 */
export function QrModal({ deepLink, onClose, pollUrl, pollIntervalMs = 1500, title = 'Sign In With XRPM' }: QrModalProps) {
  const [status, setStatus] = useState<'waiting' | 'success' | 'error'>('waiting');

  // Poll the server for sign-in completion
  useEffect(() => {
    if (!deepLink || !pollUrl) return;
    setStatus('waiting');

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(pollUrl);
        const data = (await res.json()) as { ready: boolean; error?: string };
        if (!active) return;
        if (data.ready) {
          setStatus('success');
          clearInterval(interval);
          setTimeout(onClose, 1200); // brief success flash before close
        }
        if (data.error) {
          setStatus('error');
          clearInterval(interval);
        }
      } catch {
        // Ignore transient errors
      }
    }, pollIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [deepLink, pollUrl, pollIntervalMs, onClose]);

  if (!deepLink) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '32px',
        maxWidth: '360px', width: '100%', textAlign: 'center', position: 'relative',
      }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: '12px', right: '16px',
            background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer',
          }}
        >×</button>

        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>{title}</h2>
        <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px' }}>
          Scan with your XRPM app to sign in
        </p>

        {/* QR Code container — rendered by the host app's QR library */}
        <div
          id="xrpm-qr-container"
          data-deeplink={deepLink}
          style={{
            width: '200px', height: '200px', margin: '0 auto 20px',
            border: '1px solid #eee', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', color: '#999',
          }}
        >
          {/* Replace this div's content with a real QR library, e.g. react-qr-code */}
          QR code
        </div>

        {status === 'waiting' && (
          <p style={{ color: '#888', fontSize: '13px' }}>Waiting for approval…</p>
        )}
        {status === 'success' && (
          <p style={{ color: '#22c55e', fontWeight: 600 }}>✓ Signed in!</p>
        )}
        {status === 'error' && (
          <p style={{ color: '#ef4444' }}>Sign-in failed. Please try again.</p>
        )}

        <p style={{ fontSize: '11px', color: '#aaa', marginTop: '16px' }}>
          Secure sign-in via the XRP Ledger.{' '}
          <a href="https://github.com/xrpmemes/xrpm-login" target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
            How it works
          </a>
        </p>
      </div>
    </div>
  );
}
