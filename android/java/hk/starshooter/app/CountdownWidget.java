package hk.starshooter.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * The countdown widget: days to the first written paper, and to results.
 *
 * Unlike the others this one keeps counting while the app is closed. The page
 * sends the exam instant as epoch millis, resolved in HKT, so this widget can
 * work out the days itself from the clock rather than showing a number that
 * was true when the app last ran. It redraws on the half hour, which is often
 * enough for a figure measured in days.
 */
public class CountdownWidget extends AppWidgetProvider {

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
        RemoteViews views = WidgetUi.frame(context, R.layout.widget_countdown,
                context.getString(R.string.widget_countdown_title),
                WidgetUi.updatedLabel(snapshot, context));

        if (!WidgetData.signedIn(snapshot)) {
            views.setTextViewText(R.id.widget_days, "—");
            views.setTextViewText(R.id.widget_days_unit, context.getString(R.string.widget_signed_out));
            views.setTextViewText(R.id.widget_exam_date, "");
            views.setTextViewText(R.id.widget_results, "");
            views.setOnClickPendingIntent(R.id.widget_root,
                    WidgetUi.open(context, widgetId, "desk", null, null));
            return views;
        }

        JSONObject exam = snapshot.optJSONObject("exam");
        long at = exam == null ? 0L : exam.optLong("at", 0L);

        long days = 0;
        boolean past = false;
        if (at > 0) {
            long diff = at - System.currentTimeMillis();
            past = diff <= 0;
            days = past ? 0 : TimeUnit.MILLISECONDS.toDays(diff);
        }

        views.setTextViewText(R.id.widget_days, past ? "0" : String.valueOf(days));
        views.setTextViewText(R.id.widget_days_unit,
                context.getString(past ? R.string.widget_days_past : R.string.widget_days_to_go));
        views.setTextColor(R.id.widget_days, past ? WidgetUi.GOLD : WidgetUi.ACCENT);

        String label = exam == null ? "" : exam.optString("label", "");
        views.setTextViewText(R.id.widget_exam_date,
                label.isEmpty() ? "" : context.getString(R.string.widget_first_paper, label));

        JSONObject results = snapshot.optJSONObject("results");
        if (results != null) {
            String rlabel = results.optString("label", "");
            views.setTextViewText(R.id.widget_results,
                    rlabel.isEmpty() ? "" : context.getString(R.string.widget_results_on, rlabel));
        } else {
            views.setTextViewText(R.id.widget_results, "");
        }

        views.setOnClickPendingIntent(R.id.widget_root,
                WidgetUi.open(context, widgetId, "desk", null, null));
        return views;
    }
}
