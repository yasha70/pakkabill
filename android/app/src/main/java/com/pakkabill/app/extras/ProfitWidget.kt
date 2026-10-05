package com.pakkabill.app.extras

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.pakkabill.app.MainActivity
import com.pakkabill.app.R
import com.pakkabill.app.data.PrefsKeyValue
import com.pakkabill.core.Report
import org.json.JSONObject

/** What the home-screen widget shows, kept small on the phone and updated with every report. */
data class WidgetData(
    val month: String,
    val profit: String,
    val loss: Boolean,
    val margin: String,
    val line: String,
    val hi: Boolean = false,
) {
    companion object {
        fun load(ctx: Context): WidgetData? = PrefsKeyValue(ctx, "widget").get("data")?.let {
            runCatching {
                val o = JSONObject(it)
                WidgetData(o.getString("month"), o.getString("profit"), o.getBoolean("loss"), o.optString("margin"), o.optString("line"), o.optBoolean("hi"))
            }.getOrNull()
        }

        /** The latest month in the files (or the whole report when there is one month). */
        fun of(r: Report, hi: Boolean): WidgetData {
            fun rs(p: Long) = (if (p < 0) "-" else "") + "₹" + com.pakkabill.app.ui.money(kotlin.math.abs(Math.round(p / 100.0) * 100), noPaise = true)
            val m = r.monthly.lastOrNull()
            val np = m?.NP ?: r.sum.NP
            val ns = m?.NS ?: r.sum.NS
            val month = m?.label ?: r.per.label
            val margin = if (ns > 0) String.format(java.util.Locale.ENGLISH, "%.1f%%", np * 100.0 / ns) else ""
            val missing = r.sum.missing.size
            val line = when {
                missing > 0 && hi -> "$missing SKU की लागत बाकी"
                missing > 0 -> "Cost missing for $missing SKU" + if (missing > 1) "s" else ""
                hi -> "Meesho से मिला ${rs(m?.payout ?: r.sum.payout)}"
                else -> "Received ${rs(m?.payout ?: r.sum.payout)}"
            }
            return WidgetData(month, rs(np), np < 0, margin, line, hi)
        }

        fun save(ctx: Context, d: WidgetData?) {
            PrefsKeyValue(ctx, "widget").put(
                "data",
                d?.let { JSONObject().put("month", it.month).put("profit", it.profit).put("loss", it.loss).put("margin", it.margin).put("line", it.line).put("hi", it.hi).toString() },
            )
            ProfitWidget.refresh(ctx)
        }
    }
}

/** Home-screen widget (only in the app): this month's real profit at a glance; tap to open. */
class ProfitWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val views = views(ctx)
        ids.forEach { mgr.updateAppWidget(it, views) }
    }

    companion object {
        fun refresh(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx) ?: return
            val ids = runCatching { mgr.getAppWidgetIds(ComponentName(ctx, ProfitWidget::class.java)) }.getOrNull() ?: return
            if (ids.isEmpty()) return
            val views = views(ctx)
            ids.forEach { runCatching { mgr.updateAppWidget(it, views) } }
        }

        private fun views(ctx: Context): RemoteViews {
            val d = WidgetData.load(ctx)
            val v = RemoteViews(ctx.packageName, R.layout.widget_profit)
            val open = PendingIntent.getActivity(
                ctx, 11, Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_root, open)
            val add = PendingIntent.getActivity(
                ctx, 12, Intent(ctx, MainActivity::class.java).setAction(MainActivity.ACTION_UPLOAD).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            v.setOnClickPendingIntent(R.id.w_add, add)
            if (d == null) {
                v.setTextViewText(R.id.w_month, ctx.getString(R.string.widget_title))
                v.setTextViewText(R.id.w_profit, "₹ –")
                v.setTextViewText(R.id.w_label, ctx.getString(R.string.widget_empty))
                v.setTextViewText(R.id.w_line, "")
                v.setTextColor(R.id.w_profit, ctx.getColor(R.color.widget_ink))
            } else {
                v.setTextViewText(R.id.w_month, d.month)
                v.setTextViewText(R.id.w_profit, d.profit)
                v.setTextViewText(R.id.w_label, (if (d.hi) (if (d.loss) "असली नुकसान" else "असली मुनाफ़ा") else (if (d.loss) "Real loss" else "Real profit")) + if (d.margin.isNotBlank()) " · " + d.margin else "")
                v.setTextViewText(R.id.w_line, d.line)
                v.setTextColor(R.id.w_profit, ctx.getColor(if (d.loss) R.color.widget_loss else R.color.widget_profit))
            }
            return v
        }
    }
}
