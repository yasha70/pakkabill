package com.pakkabill.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/* The line icons of the PakkaBill website (24 × 24, 2px rounded strokes), drawn natively. */

private fun lineIcon(name: String, vararg paths: String, width: Float = 2f): ImageVector {
    val b = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
    paths.forEach { d ->
        b.addPath(addPathNodes(d), stroke = SolidColor(Color.Black), strokeLineWidth = width, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
    }
    return b.build()
}

object PbIcons {
    val Rupee by lazy { lineIcon("rupee", "M6 3h12", "M6 8h12", "M6 13l8.5 8", "M6 13h3", "M9 13c6.667 0 6.667-10 0-10") }
    val Checks by lazy { lineIcon("checks", "M3 17l2 2 4-4", "M3 7l2 2 4-4", "M13 6h8", "M13 12h8", "M13 18h8") }
    val Box by lazy {
        lineIcon(
            "box", "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
            "M12 22V12", "M3.3 7l7.703 4.734a2 2 0 0 0 1.994 0L20.7 7", "M7.5 4.27l9 5.15",
        )
    }
    val Grid by lazy {
        lineIcon(
            "grid", "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
            "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
        )
    }
    val Plus by lazy { lineIcon("plus", "M5 12h14", "M12 5v14", width = 2.6f) }
    val Moon by lazy { lineIcon("moon", "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z") }
    val Sun by lazy {
        lineIcon(
            "sun", "M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0", "M12 2v2", "M12 20v2", "M4.93 4.93l1.41 1.41", "M17.66 17.66l1.41 1.41",
            "M2 12h2", "M20 12h2", "M6.34 17.66l-1.41 1.41", "M19.07 4.93l-1.41 1.41",
        )
    }
    val User by lazy { lineIcon("user", "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0") }
    val Receipt by lazy {
        lineIcon(
            "receipt", "M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z",
            "M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8", "M12 17.5v-11",
        )
    }
    val Gear by lazy {
        lineIcon(
            "gear",
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
        )
    }
    val Book by lazy { lineIcon("book", "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z") }
    val Upload by lazy { lineIcon("upload", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12") }
    val Close by lazy { lineIcon("close", "M18 6L6 18", "M6 6l12 12") }
    val Back by lazy { lineIcon("back", "M19 12H5", "M12 19l-7-7 7-7") }
}

/** PakkaBill's mark: three bills, stacked (the website's mark without the green tile). */
@Composable
fun Mark(size: Dp = 28.dp, outline: Color = Color.Transparent) {
    Canvas(Modifier.size(size)) {
        scale(this.size.width / 64f, this.size.height / 64f, Offset.Zero) {
            val r = CornerRadius(1.5f)
            rotate(8f, Offset(32f, 30f)) { drawRoundRect(Color(0xFFFBE6A0), Offset(18f, 11f), Size(28f, 38f), r) }
            rotate(4f, Offset(31f, 31f)) { drawRoundRect(Color(0xFFF6D2DB), Offset(17f, 12f), Size(28f, 38f), r) }
            drawRoundRect(Color.White, Offset(15f, 13f), Size(28f, 38f), r)
            if (outline != Color.Transparent) drawRoundRect(outline, Offset(15f, 13f), Size(28f, 38f), r, style = Stroke(1.2f))
            drawRoundRect(Color(0xFFD2232A), Offset(31f, 18f), Size(8f, 3.4f), CornerRadius(1f))
            drawRoundRect(Color(0xCC12714B), Offset(20f, 27f), Size(18f, 2.6f), CornerRadius(1.3f))
            drawRoundRect(Color(0x7312714B), Offset(20f, 33f), Size(12f, 2.6f), CornerRadius(1.3f))
            drawRoundRect(Color(0x7312714B), Offset(20f, 39f), Size(16f, 2.6f), CornerRadius(1.3f))
        }
    }
}
