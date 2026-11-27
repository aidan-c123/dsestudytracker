package hk.starshooter.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The focus widget: minutes done today, and one tap to start a block.
 *
 * If a block is already running the widget shows the clock instead of a start
 * button, computed from the end time the page stored. That way a glance at the
 * home screen answers "how long left" without opening the app.
 */
public class FocusWidget extends AppWidgetProvider {

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
        WidgetUi.Palette p = WidgetUi.palette(context, snapshot, options);

        RemoteViews views = WidgetUi.frame(context, R.layout.widget_focus,
                context.getString(R.string.widget_focus_title),
                WidgetUi.updatedLabel(snapshot, context), p);

        views.setInt(R.id.focus_action, "setBackgroundResource", WidgetUi.rowDrawable(p));
        views.setTextColor(R.id.widget_focus_streak, p.gold);
        views.setTextColor(R.id.focus_action_label, p.accent);

        views.setOnClickPendingIntent(R.id.widget_root,
                WidgetUi.open(context, widgetId, "focus", null, null));

        if (!WidgetData.signedIn(snapshot)) {
            views.setTextViewText(R.id.widget_focus_done, "—");
            views.setTextColor(R.id.widget_focus_done, p.faint);
            views.setTextViewText(R.id.widget_focus_goal, context.getString(R.string.widget_signed_out));
            views.setTextColor(R.id.widget_focus_goal, p.muted);
            views.setTextViewText(R.id.focus_action_label, context.getString(R.string.widget_focus_start));
            views.setOnClickPendingIntent(R.id.focus_action,
                    WidgetUi.open(context, widgetId, "focus", "focus", "25"));
            return views;
        }

        JSONObject focus = snapshot.optJSONObject("focus");

        // A running block wins: the remaining time is the useful figure.
        JSONObject running = focus == null ? null : focus.optJSONObject("running");
        if (running != null && running.optLong("endsAt", 0L) > 0) {
            long left = running.optLong("endsAt", 0L) - System.currentTimeMillis();
            String clock;
            if (left <= 0) {
                clock = context.getString(R.string.widget_block_done);
            } else {
                long mins = left / 60000L;
                long secs = (left % 60000L) / 1000L;
                clock = String.format(java.util.Locale.ENGLISH, "%02d:%02d", mins, secs);
            }
            views.setTextViewText(R.id.widget_focus_done, clock);
            views.setTextColor(R.id.widget_focus_done,
                    "break".equals(running.optString("mode")) ? p.gold : p.accent);
            views.setTextViewText(R.id.widget_focus_goal,
                    context.getString(running.optBoolean("paused")
                            ? R.string.widget_block_paused
                            : R.string.widget_block_running));
            views.setTextColor(R.id.widget_focus_goal, p.muted);
            views.setTextViewText(R.id.focus_action_label,
                    context.getString(R.string.widget_focus_open));
            views.setOnClickPendingIntent(R.id.focus_action,
                    WidgetUi.open(context, widgetId, "focus", null, null));
            return views;
        }

        String done = focus == null ? "0m" : focus.optString("todayLabel", "0m");
        String goal = focus == null ? "" : focus.optString("goalLabel", "");
        int pct = focus == null ? 0 : focus.optInt("pct", 0);

        views.setTextViewText(R.id.widget_focus_done, done);
        views.setTextColor(R.id.widget_focus_done, p.accent);
        views.setTextViewText(R.id.widget_focus_goal,
                goal.isEmpty() ? "" : context.getString(R.string.widget_of_goal, goal));
        views.setTextColor(R.id.widget_focus_goal, p.muted);
        WidgetUi.showProgress(views, p, R.id.widget_focus_bar, R.id.widget_focus_bar_dark, pct);

        int streak = focus == null ? 0 : focus.optInt("streak", 0);
        views.setTextViewText(R.id.widget_focus_streak,
                streak > 0 ? context.getResources()
                        .getQuantityString(R.plurals.widget_streak, streak, streak) : "");

        views.setTextViewText(R.id.focus_action_label,
                context.getString(R.string.widget_focus_start));
        views.setOnClickPendingIntent(R.id.focus_action,
                WidgetUi.open(context, widgetId, "focus", "focus", "25"));
        return views;
    }
}
