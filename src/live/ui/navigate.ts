import type { MouseEvent } from 'react';

/** Same-tab navigation between app views (landing, /listen, /live) without a page load; App follows popstate. */
export function navigateTo(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

/** Click handler for in-app links: a plain click navigates in place; modified clicks keep the browser's behaviour. */
export function onAppLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(event.currentTarget.pathname);
}
