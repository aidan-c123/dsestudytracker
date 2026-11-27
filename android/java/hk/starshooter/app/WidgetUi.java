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
 * They are deliberately plain: a card, the ink type, one accent figure and one
 * interactive row. A widget is read at a glance on a home screen, so the design
 * rules that make the app calm — no gradients, no ornament, one accent — matter
 * more here than anywhere.
 *
 * The card follows the app's own theme. Android cannot inherit CSS, so the
 * palette below is the app's light and dark theme written out as constants, and
 * the page reports its effective theme in the widget snapshot. That is why
 * every colour is set here rather than in the layout XML: a widget redraws
 * without the page running, so it must be able to repaint itself in either
 * theme from the snapshot alone.
 */
final class WidgetUi {

    /** The app's light theme — cream paper, dark ink. */
    static final int PAPER = Color.parseColor("#F8F6F1");
    static final int INK = Color.parseColor("#141A17");
    static final int MUTED = Color.parseColor("#6B7770");
    static final int FAINT = Color.parseColor("#98A29C");
    static final int ACCENT = Color.parseColor("#10574B");
    static final int GOLD = Color.parseColor("#8A6D1F");
    static final int RED = Color.parseColor("#A33A2E");
    static final int EDGE = Color.parseColor("#E2DED4");
    static final int TRACK = Color.parseColor("#E6E2D8");
    static final int WASH = Color.parseColor("#E8F0ED");

    /** The app's dark theme — the same slate-with-a-green-cast as `styles.css`. */
    static final int PAPER_DARK = Color.parseColor("#0D1210");
    static final int INK_DARK = Color.parseColor("#E9EFEA");
    static final int MUTED_DARK = Color.parseColor("#8A9891");
    static final int FAINT_DARK = Color.parseColor("#5F6D66");
    static final int ACCENT_DARK = Color.parseColor("#7FD0B6");
    static final int GOLD_DARK = Color.parseColor("#E0C383");
    static final int RED_DARK = Color.parseColor("#F0997F");
    static final int EDGE_DARK = Color.parseColor("#26302B");
    static final int TRACK_DARK = Color.parseColor("#26302B");
    static final int WASH_DARK = Color.parseColor("#172A23");

    private WidgetUi() {}

    /* --------------------------------- theming -------------------------------- */

    /**
     * The colours one card is drawn in.
     *
     * A plain object rather than four sets of statics, so a provider asks once
     * for "the palette" and cannot mix a light figure with a dark caption.
     */
    static final class Palette {
        final boolean dark;
        final int paper, ink, muted, faint, accent, gold, red, edge, track, wash;

        Palette(boolean dark) {
            this.dark = dark;
            paper = dark ? PAPER_DARK : PAPER;
            ink = dark ? INK_DARK : INK;
            muted = dark ? MUTED_DARK : MUTED;
            faint = dark ? FAINT_DARK : FAINT;
            accent = dark ? ACCENT_DARK : ACCENT;
            gold = dark ? GOLD_DARK : GOLD;
            red = dark ? RED_DARK : RED;
            edge = dark ? EDGE_DARK : EDGE;
            track = dark ? TRACK_DARK : TRACK;
            wash = dark ? WASH_DARK : WASH;
        }
    }

    private static final Palette LIGHT = new Palette(false);
    private static final Palette DARK = new Palette(true);

    /**
     * The palette to draw in.
     *
     * The snapshot is the authority: the page reports the theme it is actually
     * painting, which is what a student set (or the system when it is set to
     * "system"). Launcher options are the fallback for the case where the app
     * has never been open, so a dark home screen still gets a dark card before
     * the first widget push.
     */
    static Palette palette(Context context, JSONObject snapshot, Bundle options) {
        String theme = snapshot == null ? "" : snapshot.optString("theme", "");
        if ("dark".equals(theme)) return DARK;
        if ("light".equals(theme)) return LIGHT;
        return isDark(options) ? DARK : LIGHT;
    }

    /**
     * Paint the ids every widget layout shares.
     *
     * Deliberately limited to the root, the header and the footer. A RemoteViews
     * call naming an id the current layout does not contain fails at apply time,
     * so a "one palette call for all views" would break three widgets out of
     * four. Each provider colours its own extra views from the same palette.
     */
    static void paint(Context context, RemoteViews views, Palette p) {
        views.setInt(R.id.widget_root, "setBackgroundResource", cardDrawable(p));
        views.setTextColor(R.id.widget_title, p.muted);
        views.setTextColor(R.id.widget_saved, p.faint);
    }

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

    /**
     * The frame every widget shares: the card, the header and the footer, themed.
     *
     * The caller resolves the palette once and passes it, so a provider cannot
     * theme the card and then colour a figure from a second, different lookup.
     */
    static RemoteViews frame(Context context, int layout, String title, String saved, Palette p) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        paint(context, views, p);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_saved, saved);
        return views;
    }

    /**
     * The card background for a palette. Used where a drawable is set on a
     * specific view rather than the root (the quick-log rows).
     */
    static int cardDrawable(Palette p) {
        return p.dark ? R.drawable.widget_card_dark : R.drawable.widget_card;
    }

    /** The pressed-row background for a palette. */
    static int rowDrawable(Palette p) {
        return p.dark ? R.drawable.widget_row_dark : R.drawable.widget_row;
    }

    /** The goal-bar drawable for a palette. */
    static int progressDrawable(Palette p) {
        return p.dark ? R.drawable.widget_progress_dark : R.drawable.widget_progress;
    }

    /** Show the progress bar that matches the palette, hide the other. */
    static void showProgress(RemoteViews views, Palette p, int lightId, int darkId, int pct) {
        int value = Math.max(0, Math.min(100, pct));
        views.setProgressBar(lightId, 100, value, false);
        views.setProgressBar(darkId, 100, value, false);
        views.setViewVisibility(lightId, p.dark ? android.view.View.GONE : android.view.View.VISIBLE);
        views.setViewVisibility(darkId, p.dark ? android.view.View.VISIBLE : android.view.View.GONE);
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

    /** Redraw all four, after a snapshot arrives or the theme changes. */
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
