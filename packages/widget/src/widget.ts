/**
 * Sign In With XRPM — Browser Widget
 *
 * Drop a single <script> tag on any page. No backend required for challenge
 * creation (uses the hosted API). Verification still happens server-side when
 * the XRPM app redirects back to your redirect_uri.
 *
 * Usage:
 *   <script src="https://cdn.xrpmemes.net/xrpm-login/widget.js"></script>
 *
 *   <div
 *     data-xrpm-login
 *     data-aud="https://mysite.com"
 *     data-redirect-uri="https://mysite.com/auth/callback"
 *     data-client-id="mysite.com"
 *   ></div>
 *
 * Events fired on the container element:
 *   xrpm:ready   — widget initialised
 *   xrpm:signin  — sign-in initiated (deep link opened / QR shown)
 *   xrpm:success — sign-in complete (detail: { address, balance })
 *   xrpm:error   — sign-in failed   (detail: { code, message })
 *
 * DISCLAIMER: By embedding this widget you agree to the terms at
 * https://github.com/xrpmemes/xrpm-login/blob/main/DISCLAIMER.md
 */

import QRCode from 'qrcode';

const DEFAULT_API = 'https://api.xrpmemes.net';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Config {
  aud:            string;
  redirectUri:    string;
  clientId:       string;
  challengeUrl:   string;   // full URL to POST for a challenge
  pollUrl:        string | null;
  label:          string;
  theme:          'light' | 'dark';
  ttl:            number;
  /** Minimum XRPM balance required. 0 = wallet-ownership-only. Default: 10. */
  minBalance:     number;
}

interface ChallengeResponse {
  challenge_id: string;
  deep_link:    string;
  expires_at:   number;
}

// ─── Style helpers ───────────────────────────────────────────────────────────

const BUTTON_BASE = `
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 22px; border: none; border-radius: 8px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: opacity .15s;
`;

const THEMES = {
  light: { bg: '#0066cc', text: '#fff',     overlay: 'rgba(0,0,0,0.55)', modal: '#fff', mText: '#1a202c', sub: '#718096' },
  dark:  { bg: '#3b82f6', text: '#fff',     overlay: 'rgba(0,0,0,0.75)', modal: '#1e293b', mText: '#f1f5f9', sub: '#94a3b8' },
};

// ─── Widget class ────────────────────────────────────────────────────────────

class XrpmLoginWidget {
  private container: HTMLElement;
  private cfg:       Config;
  private modal:     HTMLElement | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.cfg       = this.readConfig(container);
    this.render();
    this.emit('xrpm:ready', {});
  }

  // ─── Config from data-* attributes ───────────────────────────────────────

  private readConfig(el: HTMLElement): Config {
    const get = (key: string, fallback = '') =>
      (el.dataset[key] ?? fallback).trim();

    const aud         = get('aud');
    const redirectUri = get('redirectUri', get('redirect-uri'));
    const clientId    = get('clientId', get('client-id', new URL(aud || location.origin).hostname));

    // challengeUrl: partner can point at their own server; default = hosted API
    const challengeUrl = get('challengeUrl', get('challenge-url'))
      || `${get('api', DEFAULT_API)}/v1/challenge`;

    return {
      aud,
      redirectUri:  redirectUri || aud,
      clientId,
      challengeUrl,
      pollUrl:      get('pollUrl', get('poll-url')) || null,
      label:        get('label', 'Sign In With XRPM'),
      theme:        (get('theme', 'light') as 'light' | 'dark'),
      ttl:          parseInt(get('ttl', '300'), 10),
      minBalance:   parseInt(get('minBalance', get('min-balance', '10')), 10),
    };
  }

  // ─── Render button into container ────────────────────────────────────────

  private render(): void {
    const { theme, label } = this.cfg;
    const t = THEMES[theme];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('style', `${BUTTON_BASE} background:${t.bg}; color:${t.text};`);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<span aria-hidden="true">🔐</span><span class="xrpm-btn-label">${label}</span>`;

    btn.addEventListener('click', () => this.handleClick(btn));
    this.container.innerHTML = '';
    this.container.appendChild(btn);
  }

  // ─── Click handler ────────────────────────────────────────────────────────

  private async handleClick(btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    btn.querySelector('.xrpm-btn-label')!.textContent = 'Opening…';

    try {
      const challenge = await this.createChallenge();
      this.emit('xrpm:signin', { challengeId: challenge.challenge_id });

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        // Mobile: open deep link directly — XRPM app handles the rest.
        // The app will redirect to redirect_uri on the same device,
        // so the session lands in this browser naturally.
        window.location.href = challenge.deep_link;
      } else {
        // Desktop: show QR modal. User scans on their phone.
        // The XRPM app redirects to redirect_uri on the PHONE's browser,
        // not here. We poll the server using challenge_id until it confirms
        // the proof was received and verified server-side.
        await this.showModal(challenge);
        if (this.cfg.pollUrl) {
          // Append challenge_id so the server knows which session to check
          const pollUrl = `${this.cfg.pollUrl}?challenge_id=${challenge.challenge_id}`;
          this.startPolling(pollUrl);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit('xrpm:error', { code: 'CHALLENGE_FAILED', message: msg });
    } finally {
      btn.disabled = false;
      btn.querySelector('.xrpm-btn-label')!.textContent = this.cfg.label;
    }
  }

  // ─── Create challenge (POST to challenge URL) ─────────────────────────────

  private async createChallenge(): Promise<ChallengeResponse> {
    const { aud, redirectUri, clientId, challengeUrl, ttl } = this.cfg;

    if (!aud) throw new Error('data-aud is required');
    if (!aud.startsWith('https://')) throw new Error('data-aud must be an HTTPS URL');

    const res = await fetch(challengeUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ aud, redirect_uri: redirectUri, client_id: clientId, ttl, min_balance: this.cfg.minBalance }),
    });

    if (!res.ok) throw new Error(`Challenge API error: ${res.status}`);
    return res.json() as Promise<ChallengeResponse>;
  }

  // ─── QR Modal ────────────────────────────────────────────────────────────

  private async showModal(challenge: ChallengeResponse): Promise<void> {
    const { theme, label } = this.cfg;
    const t = THEMES[theme];

    // Generate QR as data URL
    let qrDataUrl: string;
    try {
      qrDataUrl = await QRCode.toDataURL(challenge.deep_link, { width: 220, margin: 1 });
    } catch {
      qrDataUrl = '';
    }

    const expires = new Date(challenge.expires_at * 1000).toLocaleTimeString();

    this.modal = document.createElement('div');
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', label);
    this.modal.setAttribute('style',
      `position:fixed;inset:0;z-index:99999;display:flex;align-items:center;` +
      `justify-content:center;background:${t.overlay};`
    );
    this.modal.innerHTML = `
      <div style="background:${t.modal};border-radius:16px;padding:32px;max-width:340px;
                  width:100%;text-align:center;position:relative;box-shadow:0 8px 40px rgba(0,0,0,.25);">
        <button id="xrpm-close" aria-label="Close"
          style="position:absolute;top:12px;right:16px;background:none;border:none;
                 font-size:22px;cursor:pointer;color:${t.sub};">×</button>

        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:${t.mText};">${label}</p>
        <p style="margin:0 0 18px;font-size:13px;color:${t.sub};">
          Scan with your XRPM app to sign in
        </p>

        ${qrDataUrl
          ? `<img src="${qrDataUrl}" alt="QR code" width="220" height="220"
                  style="border-radius:8px;border:1px solid rgba(0,0,0,.08);" />`
          : `<p style="color:${t.sub};font-size:13px;">QR unavailable — open on mobile:<br>
               <code style="word-break:break-all;font-size:11px;">${challenge.deep_link}</code></p>`
        }

        <p id="xrpm-status" style="margin:14px 0 0;font-size:13px;color:${t.sub};">
          Waiting for approval… (expires ${expires})
        </p>

        <p style="margin:16px 0 0;font-size:11px;color:${t.sub};">
          Secure sign-in via the XRP Ledger.
          <a href="https://github.com/xrpmemes/xrpm-login" target="_blank" rel="noreferrer"
             style="color:#0066cc;">How it works</a>
        </p>
      </div>
    `;

    document.body.appendChild(this.modal);

    // Close on overlay click or X button
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    this.modal.querySelector('#xrpm-close')!.addEventListener('click', () => this.closeModal());
  }

  private closeModal(): void {
    this.stopPolling();
    this.modal?.remove();
    this.modal = null;
  }

  // ─── Polling ─────────────────────────────────────────────────────────────

  private startPolling(pollUrl: string): void {
    this.pollTimer = setInterval(async () => {
      try {
        const res  = await fetch(pollUrl);
        const data = (await res.json()) as { ready?: boolean; address?: string; balance?: string; error?: string };

        if (data.ready) {
          this.stopPolling();
          this.setModalStatus('✓ Signed in!', '#22c55e');
          setTimeout(() => this.closeModal(), 1000);
          this.emit('xrpm:success', { address: data.address, balance: data.balance });
        } else if (data.error) {
          this.stopPolling();
          this.setModalStatus(`Error: ${data.error}`, '#ef4444');
          this.emit('xrpm:error', { code: data.error, message: data.error });
        }
      } catch { /* ignore transient errors */ }
    }, 1500);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private setModalStatus(text: string, color: string): void {
    const el = this.modal?.querySelector('#xrpm-status') as HTMLElement | null;
    if (el) { el.textContent = text; el.style.color = color; }
  }

  // ─── Event emitter ────────────────────────────────────────────────────────

  private emit(name: string, detail: object): void {
    this.container.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }
}

// ─── Auto-init ───────────────────────────────────────────────────────────────

function init(): void {
  document.querySelectorAll<HTMLElement>('[data-xrpm-login]').forEach((el) => {
    if (!el.dataset['xrpmInitialised']) {
      el.dataset['xrpmInitialised'] = '1';
      new XrpmLoginWidget(el);
    }
  });
}

// Init on DOM ready, or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-init on dynamic DOM changes (e.g. SPA route transitions)
const observer = new MutationObserver(init);
observer.observe(document.body, { childList: true, subtree: true });
