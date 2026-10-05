package com.pakkabill.app.extras

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.pakkabill.app.MainActivity
import com.pakkabill.app.R
import com.pakkabill.app.data.PrefsKeyValue
import java.util.Calendar

/**
 * The weekly reminder (only in the app): Meesho pays every week, so every Thursday morning the
 * seller is reminded to download the new payment report and add it, with this month's profit so
 * far. Uses the phone's alarm clock, no server, and starts again after the phone restarts.
 */
object Reminder {
    private const val CHANNEL = "weekly"
    private const val ACTION = "com.pakkabill.app.REMINDER"
    private const val ID = 7

    fun isOn(ctx: Context) = PrefsKeyValue(ctx, "pnl_ui").get("reminder") == "1"

    fun schedule(ctx: Context, on: Boolean) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(
            ctx, ID, Intent(ctx, ReminderReceiver::class.java).setAction(ACTION),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        am.cancel(pi)
        if (on) am.setInexactRepeating(AlarmManager.RTC_WAKEUP, nextThursday(), AlarmManager.INTERVAL_DAY * 7, pi)
    }

    /** Next Thursday at 10 in the morning (Meesho's weekly payouts are out by then). */
    private fun nextThursday(): Long {
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 10); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
        while (c.get(Calendar.DAY_OF_WEEK) != Calendar.THURSDAY || c.timeInMillis <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_MONTH, 1)
        return c.timeInMillis
    }

    fun show(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val hi = PrefsKeyValue(ctx, "pnl_ui").get("lang") == "hi"
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, if (hi) "हर हफ़्ते याद दिलाना" else "Weekly reminder", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val w = WidgetData.load(ctx)
        val title = if (hi) "इस हफ़्ते का Meesho पेमेंट आ गया?" else "New Meesho payments this week?"
        val body = (if (hi) "Supplier Panel से पेमेंट रिपोर्ट डाउनलोड करें और PakkaBill में जोड़ें, असली मुनाफ़ा देखने के लिए।"
        else "Download the payment report from the Supplier Panel and add it to PakkaBill to see your real profit.") +
            (w?.let { "\n" + (if (hi) "${it.month}: ${it.profit} असली मुनाफ़ा" else "${it.month}: ${it.profit} real profit so far") } ?: "")
        val open = PendingIntent.getActivity(
            ctx, ID, Intent(ctx, MainActivity::class.java).setAction(MainActivity.ACTION_UPLOAD).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setColor(0xFF5B3FE6.toInt())
            .setContentTitle(title)
            .setContentText(body.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(ID, n) }
    }
}

/** The reminder's alarm, and setting it again after the phone restarts or the app updates. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            "com.pakkabill.app.REMINDER" -> if (Reminder.isOn(ctx)) Reminder.show(ctx)
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Reminder.schedule(ctx, Reminder.isOn(ctx))
        }
    }
}
