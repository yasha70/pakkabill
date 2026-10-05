package com.pakkabill.app.platform

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable

/** The phone's back gesture or button. */
@Composable
fun SystemBack(enabled: Boolean = true, onBack: () -> Unit) = BackHandler(enabled, onBack)
