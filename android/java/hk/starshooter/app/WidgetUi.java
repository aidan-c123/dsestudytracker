package hk.starshooter.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Shared drawing for the four home-screen widgets.
 *
 * They are deliberately plain: a cream card, the ink type, one accent figure
 * and one interactive row. A widget is read at a glance on a home screen, so
 * the design rules that make the app calm — no gradients, no ornament, one
 * accent — matter more here than anywhere.
 */
final class WidgetUi {

    /** Matches the app's light theme, which is what a home screen wants. */
    static final int PAPER = Color.parseColor("#F8F6F1");
    static final int INK = Color.parseColor("#141A17");
    static final int MUTED = Color.parseColor("#6B7770");
    static final int ACCENT = Color.parseColor("#10574B");
    static final int GOLD = Color.parseColor("#8A6D1F");
    static final int RED = Color.parseColor("#A33A2E");

    private WidgetUi() {}

    /* --------------------------------- intents -------------------------------- */

    /**
     * Open the app on a view, optionally asking it to do something.
     *
     * The action travels in the hash (`#/focus?act=focus&min=25`) because a
     * WebView is handed a URL, not an event. The page reads `act` after it
     * renders and runs the same handler its own button would.
     *
     * Each intent carries a distinct data URI. PendingIntents are compared with
     * their data, so without one Android would reuse the first intent for every
     * button and every widget would do the same thing.
     */
    static PendingIntent open(Context context, int widgetId, String view, String act, String min) {
        StringBuilder hash = new StringBuilder("#/").append(view);
        if (act != null) {
            hash.append("?act=").append(act);
            if (min != null) hash.append("&min=").append(min);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.putExtra(MainActivity.EXTRA_WIDGET_ACT, act);
        intent.putExtra(MainActivity.EXTRA_WIDGET_MIN, min);
        // The mark is unique per widget and per action, so two buttons in one
        // widget cannot collide.
        intent.setData(Uri.parse("starshooter://widget/" + widgetId + "/"
                + view + (act == null ? "" : "/" + act + (min == null ? "" : "/" + min))));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, widgetId * 31 + hash.hashCode(), intent, flags);
    }

    /* --------------------------------- drawing -------------------------------- */

    /** The frame every widget shares: the card, the header and the footer. */
    static RemoteViews frame(Context context, int layout, String title, String saved) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_saved, saved);
        return views;
    }

    /**
     * "Updated 14:05" — the honesty line every widget carries. A widget cannot
     * refresh itself, so saying when the figures were taken is what stops a
     * three-day-old count being read as today's.
     */
    static String updatedLabel(JSONObject snapshot, Context context) {
        if (snapshot == null) return context.getString(R.string.widget_no_data);
        String iso = snapshot.optString("savedAt", "");
        if (iso.isEmpty()) return "";
        try {
            // The snapshot is an ISO-8601 instant; parse it leniently.
            String clean = iso.replace("Z", "").replace("+00:00", "");
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            Date when = in.parse(clean.length() > 19 ? clean.substring(0, 19) : clean);
            if (when == null) return "";
            SimpleDateFormat out = new SimpleDateFormat("d MMM, HH:mm", Locale.ENGLISH);
            return context.getString(R.string.widget_updated, out.format(when));
        } catch (Exception e) {
            return "";
        }
    }

    /** Redraw every instance of one provider. */
    static void refresh(Context context, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName name = new ComponentName(context, provider);
        int[] ids = manager.getAppWidgetIds(name);
        if (ids == null || ids.length == 0) return;

        Intent intent = new Intent(context, provider);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }

    /** Redraw all four, after a snapshot arrives. */
    static void refreshAll(Context context) {
        refresh(context, CountdownWidget.class);
        refresh(context, QuickLogWidget.class);
        refresh(context, FocusWidget.class);
        refresh(context, RedInkWidget.class);
    }

    /** The data the providers need from the widget's own stored options. */
    static boolean isDark(Bundle options) {
        return options != null && options.getBoolean("dark", false);
    }
}
