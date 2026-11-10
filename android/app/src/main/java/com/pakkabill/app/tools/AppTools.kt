package com.pakkabill.app.tools

import android.content.Context
import com.pakkabill.app.data.PrefsKeyValue
import com.pakkabill.app.labels.LabelsController
import kotlinx.coroutines.CoroutineScope

/**
 * The website's other tools in the app, each made the first time it is opened (so the app starts as
 * fast as before): Labels & packing chart, GSTR-1, Low shipping image, Meesho listing, Meesho Lens and
 * Auto listing.
 */
class AppTools(context: Context, scope: CoroutineScope) {
    private val app = context.applicationContext
    val labels by lazy { LabelsController(app, scope, PrefsKeyValue(app, "labels")) }
}
