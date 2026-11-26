import { boot } from './app.js';

boot();

/* --------------------------------- install --------------------------------
 * The app is a PWA, so on a phone it can be added to the home screen and open
 * without browser chrome. Registration is skipped in the development preview
 * and on localhost, where a cached shell would hide fresh edits.
 * ------------------------------------------------------------------------- */
const isDev =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname.endsWith('freecode.build');

if ('serviceWorker' in navigator && !isDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, never a blocker */
    });
  });
}

/* Chrome fires this when the app is installable; keep it so Settings can offer
 * a real install button instead of instructions. */
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__installPrompt = event;
  document.documentElement.dataset.installable = 'yes';
});
