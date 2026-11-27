package hk.starshooter.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * The widget snapshot the page pushes across the bridge.
 *
 * A home-screen widget cannot call the API, and it must never hold the
 * database credentials, so the page — which already has the data — sends a
 * small JSON summary here. It is kept in the app's own private preferences:
 * readable by this app only.
 *
 * The trade-off is freshness. A widget is as current as the last time the app
 * was open, so every widget prints the time the snapshot was taken rather than
 * implying the figures are live.
 */
final class WidgetData {

    private static final String PREFS = "starshooter_widgets";
    private static final String KEY = "snapshot";

    private WidgetData() {}

    /** Store the snapshot sent by the page, and redraw every widget. */
    static void save(Context context, String json) {
        if (json == null || json.isEmpty()) return;
        // Reject anything that is not a JSON object before it reaches a parser
        // on the widget-drawing path, where an exception would blank the widget.
        try {
            new JSONObject(json);
        } catch (Exception e) {
            return;
        }
        SharedPreferences prefs =
                context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY, json).apply();
    }

    /** The last snapshot, or null when the app has never been opened. */
    static JSONObject load(Context context) {
        SharedPreferences prefs =
                context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /** True when there is a signed-in student whose figures can be shown. */
    static boolean signedIn(JSONObject snapshot) {
        return snapshot != null && snapshot.optBoolean("signedIn", false);
    }
}
