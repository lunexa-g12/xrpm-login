import React from 'react';

export interface StatusPanelProps {
  /** XRPL wallet address of the signed-in user. */
  address: string;
  /** XRPM balance string (e.g. "42.5"). */
  balance?: string;
  /** Called when the user clicks Sign Out. */
  onSignOut?: () => void;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Status panel shown to a user who is already signed in.
 *
 * Displays a truncated wallet address and XRPM balance,
 * with a Sign Out button.
 *
 * @example
 * {user && (
 *   <StatusPanel
 *     address={user.address}
 *     balance={user.balance}
 *     onSignOut={handleSignOut}
 *   />
 * )}
 */
export function StatusPanel({ address, balance, onSignOut, className }: StatusPanelProps) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        backgroundColor: '#f8fafc',
        fontSize: '14px',
      }}
    >
      <span
        title={address}
        style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1a202c' }}
      >
        {short}
      </span>

      {balance !== undefined && (
        <span style={{ color: '#4a5568' }}>
          {parseFloat(balance).toLocaleString()} XRPM
        </span>
      )}

      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          style={{
            marginLeft: '4px',
            padding: '4px 10px',
            background: 'none',
            border: '1px solid #cbd5e0',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#718096',
          }}
        >
          Sign out
        </button>
      )}
    </div>
  );
}
