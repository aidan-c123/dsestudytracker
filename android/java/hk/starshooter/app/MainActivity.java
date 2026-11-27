package hk.starshooter.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * A thin shell around the deployed StarShooter site.
 *
 * There is no copy of the app inside the APK: the WebView loads the same files
 * Vercel serves, so a redeploy updates the app without a new install. Nothing
 * here touches the database — the MongoDB connection string stays on Vercel,
 * which is why this build needs no keys and no setup.
 */
public class MainActivity extends Activity {

    private static final String CREAM = "#F8F6F1";
    private static final String INK = "#0D1210";

    /** The deployed app, from res/values/strings.xml. */
    private String startUrl;
    /** Only URLs under this host stay inside the app; everything else opens in
     *  the browser, so a stray link can never strand the shell on a page with
     *  no way back. */
    private String allowedHost;

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        startUrl = getString(R.string.app_url);
        try {
            allowedHost = new URL(startUrl).getHost();
        } catch (Exception e) {
            allowedHost = "";
        }

        // Draw under both system bars, so the paper grid runs to the edges of
        // the screen instead of stopping at a coloured strip. The page already
        // pads for the notch through env(safe-area-inset-*), so its content
        // stays clear of the clock and the gesture bar.
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor(CREAM));

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100); // the page is already laid out for phones
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " StarShooterApp/1.0");

        // Sessions are HttpOnly cookies set by Vercel, so the cookie store has
        // to survive both the process and app restarts — otherwise the app
        // would ask for the password on every cold start.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        web.setBackgroundColor(Color.parseColor(CREAM));
        web.setWebViewClient(new ShellClient());
        web.addJavascriptInterface(new Bridge(), "StarShooterAndroid");

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /**
     * Android's back gesture walks back through the app's own screens and only
     * leaves once the history is empty — the behaviour a phone user expects,
     * which a plain WebView does not give you.
     */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Dark icons for the cream theme, light icons for the dark one. */
    private void applyBarIcons(boolean dark) {
        View decor = getWindow().getDecorView();
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !dark) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    private final class ShellClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(request.getUrl().toString());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(url);
        }

        /**
         * Keep the app's own pages in the shell; hand everything else (the
         * DSE00 source link, a mailto:) to whichever app can open it.
         */
        private boolean route(String url) {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();

            if ("http".equals(scheme) || "https".equals(scheme)) {
                if (allowedHost.equalsIgnoreCase(uri.getHost())) return false;
                openExternally(uri);
                return true;
            }

            openExternally(uri);
            return true;
        }

        private void openExternally(Uri uri) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException e) {
                Toast.makeText(MainActivity.this, "No app can open that link.",
                        Toast.LENGTH_SHORT).show();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            // Tell the page it is inside the installable app, so Settings can
            // hide the "add to home screen" card, which is meaningless here.
            view.evaluateJavascript(
                    "document.documentElement.dataset.nativeApp='android';", null);
        }

        /**
         * The app reads its data live, so a launch with no connection would
         * otherwise show the WebView's grey "webpage not available" wall in
         * English and Chinese. Replace it with the app's own page, which
         * explains the one thing worth knowing: the address is fine, the
         * connection is not.
         */
        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
            if (request == null || !request.isForMainFrame()) return;
            showOffline();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView view, int code, String description, String failingUrl) {
            showOffline();
        }
    }

    private boolean offlineShown = false;

    private void showOffline() {
        if (offlineShown) return;
        offlineShown = true;

        String html =
            "<!doctype html><html lang='en'><head><meta charset='utf-8'>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<style>" +
            "html,body{height:100%;margin:0}" +
            "body{background:" + CREAM + ";color:#141a17;" +
            "font-family:'IBM Plex Sans',system-ui,sans-serif;" +
            "display:grid;place-content:center;justify-items:center;gap:14px;padding:32px;text-align:center;" +
            "background-image:linear-gradient(rgba(20,26,23,.07) 1px,transparent 1px)," +
            "linear-gradient(90deg,rgba(20,26,23,.07) 1px,transparent 1px);background-size:24px 24px}" +
            "img{width:52px;height:52px;border-radius:10px}" +
            "h1{font-size:1.15rem;margin:0;font-weight:640;letter-spacing:-.015em}" +
            "p{max-width:30ch;margin:0;color:#6b7770;font-size:.9rem;line-height:1.55}" +
            "button{margin-top:6px;padding:11px 18px;border:0;border-radius:9px;" +
            "background:#10574b;color:#f8f6f1;font:inherit;font-weight:600;font-size:.9rem}" +
            "</style></head><body>" +
            "<img src='" + startUrl + "logo.svg' alt='' onerror=\"this.style.display='none'\">" +
            "<h1>No connection</h1>" +
            "<p>Your desk is online, so it needs a moment of signal. Your saved marks are safe.</p>" +
            "<button onclick=\"location.href='" + startUrl + "'\">Try again</button>" +
            "</body></html>";

        // A data: URL cannot point back at the site, so the retry button is
        // wired through the shell instead of being a plain link.
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /**
     * The page reports its theme so the system-bar icons stay legible: dark
     * icons on the cream paper, light icons on the dark one.
     */
    private final class Bridge {
        @JavascriptInterface
        public void setTheme(final String theme) {
            runOnUiThread(() -> applyBarIcons("dark".equals(theme)));
        }

        /**
         * Files the page generates in memory (the recovery code, the JSON
         * export) cannot be "downloaded" in a WebView — the download silently
         * never appears. Save them to Downloads instead, where a student would
         * go looking. No storage permission is needed on Android 10+.
         */
        @JavascriptInterface
        public boolean saveFile(final String name, final String text) {
            if (name == null || text == null || text.isEmpty()) return false;
            try {
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues meta = new ContentValues();
                    meta.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    meta.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
                    meta.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri target = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, meta);
                    if (target == null) return false;
                    OutputStream out = getContentResolver().openOutputStream(target);
                    out.write(bytes);
                    out.close();
                    meta.clear();
                    meta.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(target, meta, null, null);
                } else {
                    // Pre-Android 10 has no Downloads collection without a
                    // permission, so keep the file in the app's own folder.
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File out = new File(dir, name);
                    FileOutputStream stream = new FileOutputStream(out);
                    stream.write(bytes);
                    stream.close();
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Downloads",
                        Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not save the file.",
                        Toast.LENGTH_SHORT).show());
                return false;
            }
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }
    }
}
