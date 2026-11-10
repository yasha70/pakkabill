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
    val Crown by lazy {
        lineIcon(
            "crown", "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
            "M5 21h14",
        )
    }
    val Close by lazy { lineIcon("close", "M18 6L6 18", "M6 6l12 12") }
    val Back by lazy { lineIcon("back", "M19 12H5", "M12 19l-7-7 7-7") }
    // the tools (lucide shapes, as on the website's menu)
    val Tag by lazy { lineIcon("tag", "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z", "M7 7.5a.5.5 0 1 0 1 0a.5.5 0 1 0 -1 0") }
    val Image by lazy { lineIcon("image", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21") }
    val Wand by lazy { lineIcon("wand", "M21.64 3.64l-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72", "M14 7l3 3", "M5 6v4", "M19 14v4", "M10 2v2", "M7 8H3", "M21 16h-4", "M11 3H9") }
    val Sheet by lazy { lineIcon("sheet", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M3 15h18", "M9 9v12", "M15 9v12") }
    val Scan by lazy { lineIcon("scan", "M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M16 16l-1.9-1.9") }
    val FileJson by lazy { lineIcon("filejson", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1", "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1") }
    val Truck by lazy { lineIcon("truck", "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14", "M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0") }
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
