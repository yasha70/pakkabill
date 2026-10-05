package com.pakkabill.app.platform

import android.content.Context
import android.os.Build

/** "play" when installed from Google Play, otherwise "web" (the APK from the website). */
fun installSource(context: Context): String {
    val pm = context.packageManager
    val installer = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(context.packageName)
        }
    }.getOrNull()
    return if (installer == "com.android.vending") "play" else "web"
}
