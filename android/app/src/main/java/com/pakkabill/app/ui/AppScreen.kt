package com.pakkabill.app.ui

import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.pakkabill.app.AppState

/** Actions the native screens can ask for. */
enum class AppAction { HELP, PRIVACY, DELETE_ACCOUNT, RATE, SHARE_APP, CLEAR_CACHE, DOWNLOADS }

@Composable
fun AppScreen(
    state: AppState,
    web: WebView,
    version: String,
    onRetry: () -> Unit,
    onUnlock: () -> Unit,
    onExit: () -> Unit,
    onToggleLock: (Boolean) -> Unit,
    onAction: (AppAction) -> Unit,
) {
    val pageColor = state.barColor?.let { Color(it) } ?: MaterialTheme.colorScheme.background
    Box(Modifier.fillMaxSize().background(pageColor)) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            AndroidView(
                factory = {
                    web.also {
                        (it.parent as? ViewGroup)?.removeView(it)
                        // with the default "wrap content" size WebView reports 100vh as 0 to the page,
                        // which collapsed full-height screens such as the Meesho P&L
                        it.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            if (state.progress in 1..99) {
                LinearProgressIndicator(
                    progress = { state.progress / 100f },
                    modifier = Modifier.fillMaxWidth().height(3.dp).align(Alignment.TopCenter),
                )
            }
            if (state.failed) OfflineScreen(onRetry)
        }

        BackHandler(enabled = state.canGoBack && !state.showSettings && !state.locked) { web.goBack() }

        AnimatedVisibility(
            visible = state.showSettings,
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
        ) {
            SettingsScreen(
                lockOn = state.lockOn,
                canLock = state.canLock,
                version = version,
                onBack = { state.showSettings = false },
                onToggleLock = onToggleLock,
                onAction = onAction,
            )
        }

        if (state.locked) LockScreen(onUnlock = onUnlock, onExit = onExit)

        SnackbarHost(
            hostState = state.snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(bottom = if (state.showSettings) 8.dp else 76.dp),
        )

        state.dialog?.let { d ->
            AlertDialog(
                onDismissRequest = {
                    if (d.confirm) d.result.cancel() else d.result.confirm()
                    state.dialog = null
                },
                title = { Text("PakkaBill") },
                text = { Text(d.message) },
                confirmButton = {
                    TextButton(onClick = { d.result.confirm(); state.dialog = null }) { Text("OK") }
                },
                dismissButton = {
                    if (d.confirm) TextButton(onClick = { d.result.cancel(); state.dialog = null }) { Text("Cancel") }
                },
            )
        }
    }
}
