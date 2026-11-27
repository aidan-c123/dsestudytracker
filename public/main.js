import { boot } from './app.js';
import { isNativeApp, syncNativeTheme } from './native.js';
import { toast } from './lib.js';

boot();

/* ------------------------------- Android shell ----------------------------
 * Inside the APK the page is wrapped by a small Java shell. Its system bars
 * are painted from Java, so they need the theme name; and a failed save is
 * worth saying out loud, because a WebView download otherwise just does
 * nothing at all.
 * ------------------------------------------------------------------------- */
if (isNativeApp) {
  const painted = document.documentElement.dataset.theme;
  if (painted) syncNativeTheme(painted);
  window.addEventListener('starshooter:theme', (e) => syncNativeTheme(e.detail));
  window.addEventListener('starshooter:save-failed', () =>
    toast('Could not save that file. Copy the text instead.', 'error')
  );
}

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
 * a real install button instead of instructions. Inside the APK there is
 * nothing to install, so the prompt is ignored. */
if (!isNativeApp) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__installPrompt = event;
    document.documentElement.dataset.installable = 'yes';
  });
}
