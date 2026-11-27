/**
 * The Android shell hooks.
 *
 * Inside the APK, two files are generated in memory and offered as
 * data:/blob: links — the recovery code and the JSON export. A WebView cannot
 * follow those links, so `native.js` intercepts the click and hands the text
 * to Java instead. If that intercept ever stops matching, the buttons go dead
 * silently: no error, no file, and the student has lost their only way back
 * into the account. This test exists so that failure shows up here instead.
 *
 * Run: node test/native.test.mjs
 */

import { readFileSync } from 'node:fs';
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('skipped: jsdom not installed (npm i -D jsdom to run this test)');
  process.exit(0);
}

let fails = 0;
let count = 0;
function check(name, fn) {
  count += 1;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => console.log(`  ok  ${name}`),
        (e) => {
          fails += 1;
          console.log(`FAIL  ${name}\n      ${e.message}`);
        }
      );
    }
    console.log(`  ok  ${name}`);
  } catch (e) {
    fails += 1;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

/** A fresh window with the native bridge present, as the APK provides it. */
function shell(saved, opts = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://dse-starshooter.vercel.app/',
    // `outside-only` gives the window its own eval, so native.js runs against
    // the page's globals exactly as it does in the WebView. It does not run
    // any of the page's own scripts.
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.fetch = (href) =>
    Promise.resolve({
      text: () => Promise.resolve(opts.blobText || 'from blob')
    });
  if (opts.native !== false) {
    window.StarShooterAndroid = {
      saveFile: (name, text) => {
        saved.push({ name, text });
        return opts.saveResult !== false;
      },
      setTheme: (t) => saved.push({ theme: t }),
      platform: () => 'android'
    };
  }
  window.TextDecoder = TextDecoder;
  return window;
}

/**
 * Load native.js into a window the way a module would.
 *
 * jsdom cannot import a data: URL module into the page's own global scope, so
 * the exports are stripped and the source is evaluated in the window. The
 * behaviour under test is identical: the same file, running against the same
 * globals the APK's WebView provides.
 */
async function load(window) {
  let src = readFileSync('./public/native.js', 'utf8');
  src = src
    .replace(/^export const isNativeApp\s*=/m, 'const isNativeApp =')
    .replace(/^export function syncNativeTheme/m, 'function syncNativeTheme');
  if (/^export\s/m.test(src)) throw new Error('native.js has an export this test cannot strip');
  window.eval(`${src}\nwindow.__native = { isNativeApp, syncNativeTheme };`);
  return window.__native;
}

async function run() {
  /* ---- the recovery code anchor must reach Java, not the void ---------- */

  await check('a data: download link is handed to the shell', async () => {
    const saved = [];
    const window = shell(saved);
    await load(window);

    const a = window.document.createElement('a');
    a.setAttribute('download', 'dse-recovery-code.txt');
    a.href =
      'data:text/plain;charset=utf-8,' +
      encodeURIComponent('StarShooter recovery code\nABCD-EFGH-JKLM\n');
    window.document.body.appendChild(a);
    a.click();
    await new Promise((r) => setTimeout(r, 20));

    if (!saved.length) throw new Error('nothing reached the shell — the button would be dead');
    const got = saved[0];
    if (got.name !== 'dse-recovery-code.txt') throw new Error(`wrong name: ${got.name}`);
    if (!got.text.includes('ABCD-EFGH-JKLM')) throw new Error('the code was not in the file');
  });

  await check('a blob: download is read before it is saved', async () => {
    const saved = [];
    const window = shell(saved, { blobText: '{"subjects":[]}' });
    await load(window);

    const a = window.document.createElement('a');
    a.setAttribute('download', 'starshooter-2026-11-27.json');
    a.href = 'blob:https://dse-starshooter.vercel.app/1234';
    window.document.body.appendChild(a);
    a.click();
    await new Promise((r) => setTimeout(r, 30));

    if (!saved.length) throw new Error('the export never reached the shell');
    if (saved[0].text !== '{"subjects":[]}') {
      throw new Error(`export text was ${JSON.stringify(saved[0].text)}`);
    }
  });

  /* ---- ordinary links must be left completely alone -------------------- */

  await check('a normal link still behaves like a link in the app', async () => {
    const saved = [];
    const window = shell(saved);
    let followed = 0;
    await load(window);

    const a = window.document.createElement('a');
    a.href = '#/papers';
    window.document.body.appendChild(a);
    // jsdom follows hash links itself; the hook must not interfere.
    a.addEventListener('click', () => {
      followed += 1;
    });
    a.click();
    await new Promise((r) => setTimeout(r, 10));

    if (!followed) throw new Error('the hook swallowed an ordinary link');
    if (saved.length) throw new Error('an ordinary link was treated as a download');
  });

  await check('the hook reports failure instead of failing silently', async () => {
    const saved = [];
    const window = shell(saved, { saveResult: false });
    await load(window);

    let told = false;
    window.addEventListener('starshooter:save-failed', () => {
      told = true;
    });

    const a = window.document.createElement('a');
    a.setAttribute('download', 'x.txt');
    a.href = 'data:text/plain,hello';
    window.document.body.appendChild(a);
    a.click();
    await new Promise((r) => setTimeout(r, 20));

    if (!told) throw new Error('a failed save was never announced');
  });

  /* ---- in a plain browser none of this may happen ---------------------- */

  await check('a browser without the shell is untouched', async () => {
    const window = shell([], { native: false });
    const original = window.HTMLAnchorElement.prototype.click;
    const mod = await load(window);
    if (mod.isNativeApp) throw new Error('it thinks it is the Android app');
    if (window.HTMLAnchorElement.prototype.click !== original) {
      throw new Error('the click hook was installed outside the shell');
    }
  });

  await check('the theme is passed to Java, not just the page', async () => {
    const saved = [];
    const window = shell(saved);
    const mod = await load(window);
    mod.syncNativeTheme('dark');
    const call = saved.find((s) => s.theme);
    if (!call) throw new Error('Java was never told the theme');
    if (call.theme !== 'dark') throw new Error(`Java got ${call.theme}`);
  });

  console.log(
    fails
      ? `\n${fails} of ${count} checks failed`
      : `\n${count} native-shell checks passed`
  );
  process.exit(fails ? 1 : 0);
}

run();
