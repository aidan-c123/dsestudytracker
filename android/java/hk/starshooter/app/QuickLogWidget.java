package hk.starshooter.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The quick-log widget: log a paper, add a red-ink entry, or open tasks.
 *
 * It shows the open-task count so the widget is useful without a tap, and each
 * row opens the app straight into the matching dialog. The dialog is the app's
 * own — a widget cannot type into a form — so the tap is one step, not two.
 *
 * The rows are drawables rather than plain views, so each is re-pointed at the
 * light or dark version when the theme changes.
 */
public class QuickLogWidget extends AppWidgetProvider {

    private static final int[] ROWS = {R.id.quick_paper, R.id.quick_red_ink, R.id.quick_task};
    private static final int[] LABELS = {
            R.id.quick_paper_label, R.id.quick_red_ink_label, R.id.quick_task_label
    };
    private static final int[] PLUS = {R.id.quick_paper_plus, R.id.quick_task_plus};

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

        RemoteViews views = WidgetUi.frame(context, R.layout.widget_quicklog,
                context.getString(R.string.widget_quicklog_title),
                WidgetUi.updatedLabel(snapshot, context), p);

        for (int row : ROWS) views.setInt(row, "setBackgroundResource", WidgetUi.rowDrawable(p));
        for (int label : LABELS) views.setTextColor(label, p.ink);
        for (int plus : PLUS) views.setTextColor(plus, p.accent);
        views.setTextColor(R.id.widget_sub, p.ink);
        views.setTextColor(R.id.quick_red_ink_count, p.red);

        // Rows are always clickable; signed out, the app opens on the sign-in
        // screen, which is the right place to be.
        views.setOnClickPendingIntent(R.id.widget_root,
                WidgetUi.open(context, widgetId, "papers", null, null));
        views.setOnClickPendingIntent(R.id.quick_paper,
                WidgetUi.open(context, widgetId, "papers", "log-paper", null));
        views.setOnClickPendingIntent(R.id.quick_red_ink,
                WidgetUi.open(context, widgetId, "papers", "new-error", null));
        views.setOnClickPendingIntent(R.id.quick_task,
                WidgetUi.open(context, widgetId, "tasks", "new-task", null));

        if (!WidgetData.signedIn(snapshot)) {
            views.setTextViewText(R.id.widget_sub, context.getString(R.string.widget_signed_out));
            views.setTextColor(R.id.widget_sub, p.muted);
            return views;
        }

        JSONObject tasks = snapshot.optJSONObject("tasks");
        int open = tasks == null ? 0 : tasks.optInt("open", 0);
        int overdue = tasks == null ? 0 : tasks.optInt("overdue", 0);
        JSONObject redInk = snapshot.optJSONObject("redInk");
        int mistakes = redInk == null ? 0 : redInk.optInt("count", 0);

        String sub;
        if (overdue > 0) {
            sub = context.getResources()
                    .getQuantityString(R.plurals.widget_overdue, overdue, overdue);
        } else if (open > 0) {
            sub = context.getResources()
                    .getQuantityString(R.plurals.widget_open_tasks, open, open, mistakes);
        } else {
            sub = context.getString(R.string.widget_no_open_tasks, mistakes);
        }
        views.setTextViewText(R.id.widget_sub, sub);

        views.setTextViewText(R.id.quick_paper_label, context.getString(R.string.widget_log_paper));
        views.setTextViewText(R.id.quick_red_ink_label, context.getString(R.string.widget_red_ink));
        views.setTextViewText(R.id.quick_task_label, context.getString(R.string.widget_tasks));

        // The red-ink count rides on its own row, where it means something.
        views.setTextViewText(R.id.quick_red_ink_count,
                mistakes > 0 ? String.valueOf(mistakes) : "");
        return views;
    }
}
