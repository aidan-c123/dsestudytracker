package hk.starshooter.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The red-ink log widget: the mistakes you wrote down, on the home screen.
 *
 * It shows the three most recent topics and a count, and one tap adds another.
 * This is the one widget that shows content rather than a number, and that is
 * the point: a topic you keep losing marks on is worth seeing every time you
 * unlock the phone.
 *
 * Topics are truncated by the page to 60 characters, so a long title cannot
 * push the layout off the card.
 */
public class RedInkWidget extends AppWidgetProvider {

    private static final int MAX_ROWS = 3;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, id, manager.getAppWidgetOptions(id)));
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int id, Bundle options) {
        manager.updateAppWidget(id, build(context, id, options));
    }

    private RemoteViews build(Context context, int widgetId, Bundle options) {
        JSONObject snapshot = WidgetData.load(context);
        RemoteViews views = WidgetUi.frame(context, R.layout.widget_redink,
                context.getString(R.string.widget_redink_title),
                WidgetUi.updatedLabel(snapshot, context));

        views.setOnClickPendingIntent(R.id.widget_root,
                WidgetUi.open(context, widgetId, "papers", null, null));
        views.setOnClickPendingIntent(R.id.redink_add,
                WidgetUi.open(context, widgetId, "papers", "new-error", null));
        views.setTextViewText(R.id.redink_add_label,
                context.getString(R.string.widget_redink_add));

        int[] rows = {R.id.redink_row_1, R.id.redink_row_2, R.id.redink_row_3};
        int[] dots = {R.id.redink_dot_1, R.id.redink_dot_2, R.id.redink_dot_3};

        if (!WidgetData.signedIn(snapshot)) {
            views.setTextViewText(R.id.widget_sub, context.getString(R.string.widget_signed_out));
            for (int i = 0; i < MAX_ROWS; i++) {
                views.setViewVisibility(rows[i], android.view.View.GONE);
            }
            return views;
        }

        JSONObject redInk = snapshot.optJSONObject("redInk");
        int count = redInk == null ? 0 : redInk.optInt("count", 0);
        JSONArray latest = redInk == null ? null : redInk.optJSONArray("latest");

        views.setTextViewText(R.id.widget_sub, count == 0
                ? context.getString(R.string.widget_redink_empty)
                : context.getResources().getQuantityString(R.plurals.widget_entries, count, count));

        for (int i = 0; i < MAX_ROWS; i++) {
            JSONObject entry = latest == null || i >= latest.length()
                    ? null : latest.optJSONObject(i);
            if (entry == null || entry.optString("topic", "").isEmpty()) {
                views.setViewVisibility(rows[i], android.view.View.GONE);
                continue;
            }
            views.setViewVisibility(rows[i], android.view.View.VISIBLE);
            views.setTextViewText(rows[i], entry.optString("topic", ""));
            // Careless mistakes get the gold dot, concept gaps the red one —
            // the same distinction the app's own list draws.
            views.setInt(dots[i], "setBackgroundColor",
                    "careless".equals(entry.optString("type")) ? WidgetUi.GOLD : WidgetUi.RED);
        }

        return views;
    }
}
