/**
 * Native shell hooks.
 *
 * The Android app is a WebView around this same site. Three things behave
 * differently there and are corrected here, so the rest of the app does not
 * need to know which container it is running in:
 *
 *   1. A WebView cannot follow a `download` link. The recovery code and the
 *      JSON export are generated in memory and offered as data:/blob: links,
 *      so tapping them would do nothing at all. They are handed to the
 *      Android side, which writes them into Downloads.
 *   2. The system bars should follow the app's theme instead of staying cream
 *      while the screen goes dark.
 *   3. "Install on your phone" is meaningless once you are already in the app.
 *
 * Everything is feature-detected: in a browser this file changes nothing.
 */

const native = typeof window !== 'undefined' ? window.StarShooterAndroid : undefined;

export const isNativeApp = Boolean(native);

if (isNativeApp) {
  document.documentElement.dataset.nativeApp = 'android';

  /**
   * Text a data: or blob: link points at, so it can be saved by the shell.
   * Both schemes are readable from the page itself, which is what makes this
   * possible without moving the download logic into Java.
   */
  async function textOf(href) {
    if (href.startsWith('data:')) {
      const comma = href.indexOf(',');
      if (comma === -1) return '';
      const meta = href.slice(5, comma);
      const body = href.slice(comma + 1);
      return meta.includes('base64')
        ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
        : decodeURIComponent(body);
    }
    const res = await fetch(href);
    return res.text();
  }

  const originalClick = HTMLAnchorElement.prototype.click;

  /* The app offers its files by making an anchor and clicking it, so this is
     the one place where both the recovery code and the export pass through. */
  HTMLAnchorElement.prototype.click = function patchedClick() {
    const href = this.getAttribute('href') || '';
    const downloadable = this.hasAttribute('download') && /^(data:|blob:)/i.test(href);
    if (!downloadable) return originalClick.call(this);

    const name = this.getAttribute('download') || 'starshooter.txt';
    textOf(href)
      .then((text) => {
        if (!native.saveFile(name, text)) throw new Error('save failed');
      })
      .catch(() => {
        /* Say so rather than leave a dead button. Copy still works. */
        window.dispatchEvent(
          new CustomEvent('starshooter:save-failed', { detail: { name } })
        );
      });
  };
}

/** Keep the Android status and navigation bars in step with the theme. */
export function syncNativeTheme(theme) {
  if (!isNativeApp) return;
  try {
    native.setTheme(theme);
  } catch {
    /* an older shell without the method */
  }
}
