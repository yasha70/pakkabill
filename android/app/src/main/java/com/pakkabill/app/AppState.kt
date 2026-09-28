package com.pakkabill.app

import android.webkit.JsResult
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

const val HOST = "pakkabill1.vercel.app"
const val ORIGIN = "https://$HOST"
const val START_URL = "$ORIGIN/?source=android"
const val PRIVACY_URL = "$ORIGIN/privacy.html"
const val PLAY_URL = "https://play.google.com/store/apps/details?id=com.pakkabill.app"

/** A JavaScript alert() or confirm() from the page, shown as a Material dialog. */
data class PageDialog(val message: String, val confirm: Boolean, val result: JsResult)

/** Everything the Compose UI draws from; changed by the activity and the web page. */
class AppState {
    var progress by mutableIntStateOf(0)
    var canGoBack by mutableStateOf(false)
    var failed by mutableStateOf(false)
    var firstPaint by mutableStateOf(false)
    var barColor by mutableStateOf<Int?>(null)
    var showSettings by mutableStateOf(false)
    var locked by mutableStateOf(false)
    var lockOn by mutableStateOf(false)
    var canLock by mutableStateOf(false)
    var dialog by mutableStateOf<PageDialog?>(null)
    val snackbar = SnackbarHostState()
}
