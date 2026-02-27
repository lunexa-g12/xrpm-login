/**
 * @xrpm-login/ui-react
 *
 * Drop-in React components for "Sign In With XRPM".
 *
 * Components:
 *   - LoginButton   — the sign-in button (fetches challenge, opens deep link)
 *   - QrModal       — desktop QR code modal with polling
 *   - StatusPanel   — signed-in user status bar with sign-out button
 *
 * @example
 * import { LoginButton, QrModal, StatusPanel } from '@xrpm-login/ui-react';
 */

export { LoginButton } from './LoginButton';
export type { LoginButtonProps } from './LoginButton';

export { QrModal } from './QrModal';
export type { QrModalProps } from './QrModal';

export { StatusPanel } from './StatusPanel';
export type { StatusPanelProps } from './StatusPanel';
