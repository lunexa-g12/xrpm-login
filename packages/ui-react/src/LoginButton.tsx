import React, { useState, useCallback } from 'react';
import { openXrpmApp } from '@xrpm-login/sdk-web';

export interface LoginButtonProps {
  /**
   * Your server endpoint that returns { challenge_id, deep_link, expires_at }.
   * Called when the user clicks the button.
   */
  challengeUrl: string;
  /** Called when the deep link is ready (mobile: opens app, desktop: shows QR). */
  onDeepLink?: (deepLink: string) => void;
  /**
   * Called when the challenge is created, regardless of mobile/desktop.
   * Provides both the deep link and the challenge_id so you can construct a
   * poll URL for the cross-device (QR) flow.
   */
  onChallengeReady?: (deepLink: string, challengeId: string) => void;
  /** Called if the challenge fetch fails. */
  onError?: (error: Error) => void;
  /** Override button label. Default: "Sign In With XRPM" */
  label?: string;
  /** Additional CSS class names for the button element. */
  className?: string;
  /** Inline style overrides. */
  style?: React.CSSProperties;
}

/**
 * Drop-in "Sign In With XRPM" button.
 *
 * On click it:
 *   1. Calls your challengeUrl to get a deep link.
 *   2. On mobile — opens the deep link directly (launches XRPM app).
 *   3. On desktop — fires onDeepLink so you can show a QrModal.
 *
 * @example
 * <LoginButton
 *   challengeUrl="/api/auth/start"
 *   onDeepLink={(link) => setQrLink(link)}
 *   onError={(e) => setError(e.message)}
 * />
 */
export function LoginButton({
  challengeUrl,
  onDeepLink,
  onChallengeReady,
  onError,
  label = 'Sign In With XRPM',
  className,
  style,
}: LoginButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(challengeUrl, { method: 'POST' });
      if (!res.ok) throw new Error(`Challenge request failed: ${res.status}`);
      // Accept both the new { challenge_id, deep_link } shape and the legacy { deepLink }
      const data = (await res.json()) as {
        deep_link?: string;
        deepLink?: string;
        challenge_id?: string;
      };
      const theDeepLink = data.deep_link ?? data.deepLink ?? '';
      const challengeId = data.challenge_id ?? '';

      onChallengeReady?.(theDeepLink, challengeId);

      const opened = openXrpmApp(theDeepLink);
      if (!opened) {
        // Desktop — caller should render a QR modal
        onDeepLink?.(theDeepLink);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [challengeUrl, onDeepLink, onChallengeReady, onError]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        backgroundColor: '#0066cc',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        ...style,
      }}
      aria-busy={loading}
    >
      {/* XRPM logo placeholder — replace with your actual SVG */}
      <span aria-hidden="true">🔐</span>
      {loading ? 'Opening XRPM…' : label}
    </button>
  );
}
