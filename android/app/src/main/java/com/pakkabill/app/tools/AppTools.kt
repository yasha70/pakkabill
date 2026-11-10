package com.pakkabill.app.tools

import android.content.Context
import com.pakkabill.app.data.PrefsKeyValue
import com.pakkabill.app.gstr1.Gstr1Controller
import com.pakkabill.app.labels.LabelsController
import com.pakkabill.app.lowship.LowshipController
import com.pakkabill.core.bill.BillData
import kotlinx.coroutines.CoroutineScope

/**
 * The website's other tools in the app, each made the first time it is opened (so the app starts as
 * fast as before): Labels & packing chart, GSTR-1, Low shipping image, Meesho listing, Meesho Lens and
 * Auto listing.
 */
class AppTools(context: Context, scope: CoroutineScope, bills: () -> BillData) {
    private val app = context.applicationContext
    val labels by lazy { LabelsController(app, scope, PrefsKeyValue(app, "labels")) }
    val gstr1 by lazy { Gstr1Controller(scope, PrefsKeyValue(app, "gstr1"), bills) }
    val lowship by lazy { LowshipController(scope, PrefsKeyValue(app, "lowship")) }

    /** Files picked for a tool ([com.pakkabill.app.platform.Platform.pickFor]). */
    fun onFiles(tool: String, files: List<Pair<String, ByteArray>>) {
        when (tool) {
            "labels" -> labels.add(files)
            "gstr1" -> gstr1.add(files)
            "g1check" -> gstr1.check(files)
            "lowship" -> lowship.addPhotos(files)
        }
    }
}
