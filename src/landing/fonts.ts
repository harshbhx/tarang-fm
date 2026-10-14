/**
 * Anek (Ek Type) is the landing page's display face: one family with Latin, Devanagari,
 * Tamil, Bangla and Gujarati cuts, so headlines and native-script lines share the same voice.
 * Loaded once, as early as the module is evaluated, so it is in flight before first paint.
 */
const HREF =
  'https://fonts.googleapis.com/css2?family=Anek+Latin:wdth,wght@75..125,400..800' +
  '&family=Anek+Devanagari:wdth,wght@75..125,400..700' +
  '&family=Anek+Tamil:wdth,wght@75..125,400..700' +
  '&family=Anek+Bangla:wdth,wght@75..125,400..700' +
  '&family=Anek+Gujarati:wdth,wght@75..125,400..700&display=swap';

if (typeof document !== 'undefined' && !document.querySelector(`link[data-lp-fonts]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HREF;
  link.dataset.lpFonts = '';
  document.head.appendChild(link);
}

export {};
