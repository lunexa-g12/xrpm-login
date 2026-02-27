/**
 * Browser-side helpers for opening the XRPM app deep link.
 *
 * These run in the browser (not Node.js).
 * Import from your front-end code.
 */

/**
 * On mobile browsers: open the deep link directly (opens the XRPM app).
 * On desktop browsers: show a QR code the user scans with their phone.
 *
 * Returns true if the device is likely mobile (link was opened),
 * false if desktop (QR code should be shown instead).
 */
export function openXrpmApp(deepLink: string): boolean {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
  );

  if (isMobile) {
    window.location.href = deepLink;
    return true;
  }

  return false; // caller should render a QR code
}

/**
 * Poll the callback URL until the proof arrives (for desktop QR flow).
 *
 * Partners typically implement this with a WebSocket or SSE from their server.
 * This polling fallback is provided for simple integrations.
 *
 * @param pollUrl     - Your server endpoint that returns { ready: boolean, redirectTo?: string }
 * @param intervalMs  - Polling interval. Default: 1500ms.
 * @param timeoutMs   - Stop polling after this duration. Default: 300000ms (5 min).
 * @returns           - The redirect URL once the proof arrives.
 */
export async function pollForCallback(
  pollUrl: string,
  intervalMs = 1500,
  timeoutMs = 300_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() >= deadline) {
        reject(new Error('XRPM sign-in timed out'));
        return;
      }

      try {
        const res = await fetch(pollUrl);
        const data = (await res.json()) as { ready: boolean; redirectTo?: string };
        if (data.ready && data.redirectTo) {
          resolve(data.redirectTo);
          return;
        }
      } catch {
        // Ignore transient network errors during polling
      }

      setTimeout(tick, intervalMs);
    };

    setTimeout(tick, intervalMs);
  });
}
