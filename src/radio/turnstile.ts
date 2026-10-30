/**
 * Optional Cloudflare Turnstile check (off unless the Worker has TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY set).
 * Loads Cloudflare's script on demand, shows the widget in a small overlay and resolves with its token.
 */
interface TurnstileApi {
  render(el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback': () => void; theme?: string }): string;
  remove(id: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<TurnstileApi> {
  const existing = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('turnstile missing'));
    };
    el.onerror = () => reject(new Error('turnstile blocked'));
    document.head.appendChild(el);
  });
}

export async function solveChallenge(siteKey: string): Promise<string> {
  const api = await loadScript();
  const host = document.createElement('div');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'Quick check');
  host.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(7,6,5,.85);color:#f3e7d3;font:16px system-ui,sans-serif';
  const label = document.createElement('p');
  label.textContent = 'One quick check, then the radio starts.';
  const slot = document.createElement('div');
  host.append(label, slot);
  document.body.appendChild(host);
  return new Promise<string>((resolve, reject) => {
    const id = api.render(slot, {
      sitekey: siteKey,
      theme: 'dark',
      callback: (token) => {
        api.remove(id);
        host.remove();
        resolve(token);
      },
      'error-callback': () => {
        api.remove(id);
        host.remove();
        reject(new Error('turnstile failed'));
      },
    });
  });
}
