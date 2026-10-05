package com.pakkabill.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

/** PakkaBill's colours (the website's P&L inside PakkaBill: pnl.html :root.embed, index.html), light and dark. */
@Immutable
data class Hues(
    val paper: Color, val sheet: Color, val rule: Color, val rule2: Color,
    val ink: Color, val ink2: Color, val ink3: Color,
    val carbon: Color, val carbonInk: Color, val carbonSoft: Color, val band: Color,
    val margin: Color, val neg: Color, val pos: Color, val warn: Color, val warnBg: Color, val dark: Boolean,
    // the top bar and tab bar (--spine, --carbon-tint), the focus ring, the PakkaBill wordmark and the + button
    val spine: Color = paper, val spineFg: Color = ink, val carbonTint: Color = carbonSoft, val focus: Color = Color(0xFFFF7A59),
    val brand: List<Color> = listOf(carbon, carbon), val btn: List<Color> = listOf(carbon, carbon), val btnFg: Color = carbonInk,
)

val LightHues = Hues(
    paper = Color(0xFFFDF8F3), sheet = Color.White, rule = Color(0xFFE2DAF2), rule2 = Color(0xFFCFC4EA),
    ink = Color(0xFF2A2540), ink2 = Color(0xFF5C5776), ink3 = Color(0xFF736E8D),
    carbon = Color(0xFF5B3FE6), carbonInk = Color.White, carbonSoft = Color(0xFFECE6FF), band = Color(0xFFFFFDFB),
    margin = Color(0xFFC8202A), neg = Color(0xFFC8202A), pos = Color(0xFF12714B), warn = Color(0xFFB26A00), warnBg = Color(0xFFFFF4DF), dark = false,
    spine = Color(0xFFFFFDFB), spineFg = Color(0xFF2A2540), carbonTint = Color(0xFFF6F2FF), focus = Color(0xFFFF7A59),
    brand = listOf(Color(0xFF6C4DFF), Color(0xFFB44DFF), Color(0xFFFF7A59)),
    btn = listOf(Color(0xFF6C4DFF), Color(0xFF9A3FF0), Color(0xFFD0457C)), btnFg = Color.White,
)
val DarkHues = Hues(
    paper = Color(0xFF110E20), sheet = Color(0xFF1B1631), rule = Color(0xFF3A3160), rule2 = Color(0xFF4A4078),
    ink = Color(0xFFECE8FB), ink2 = Color(0xFFBDB5D9), ink3 = Color(0xFF958DB3),
    carbon = Color(0xFFB3A1FF), carbonInk = Color(0xFF140C33), carbonSoft = Color(0xFF35295E), band = Color(0xFF16122A),
    margin = Color(0xFFFF8A8F), neg = Color(0xFFFF8A8F), pos = Color(0xFF74D8A7), warn = Color(0xFFF0C26A), warnBg = Color(0xFF2B2410), dark = true,
    spine = Color(0xFF16122A), spineFg = Color(0xFFECE8FB), carbonTint = Color(0xFF231C3D), focus = Color(0xFFFF7A59),
    brand = listOf(Color(0xFFB3A1FF), Color(0xFFD9A1FF), Color(0xFFFFA58C)),
    btn = listOf(Color(0xFF9B85FF), Color(0xFF9B85FF)), btnFg = Color(0xFF140C33),
)

/** PakkaBill's fonts: Hind for headings and text, Teko for the PakkaBill wordmark. */
class Fonts(val head: FontFamily = FontFamily.Default, val body: FontFamily = FontFamily.Default, val mark: FontFamily = FontFamily.Default)

val LocalHues = staticCompositionLocalOf { LightHues }
val LocalFonts = staticCompositionLocalOf { Fonts() }
/** English text to the chosen language (Hindi uses the website's own dictionary). */
val LocalTr = staticCompositionLocalOf<(String) -> String> { { it } }
val LocalLang = staticCompositionLocalOf { "en" }

// kept for older screens (Account, lock) that still use Material components
@Immutable
data class Extra(val gain: Color, val loss: Color, val heroStart: Color, val heroEnd: Color, val warn: Color, val warnContainer: Color)
val LocalExtra = staticCompositionLocalOf { Extra(LightHues.pos, LightHues.neg, Color(0xFF4B3BD6), Color(0xFF26307F), LightHues.warn, LightHues.warnBg) }

/** theme: "auto" follows the phone, or "light" / "dark" (Settings, Appearance). */
@Composable
fun PakkaBillTheme(theme: String = "auto", fonts: Fonts = Fonts(), lang: String = "en", tr: (String) -> String = { it }, content: @Composable () -> Unit) {
    val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    val h = if (dark) DarkHues else LightHues
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = h.carbon, onPrimary = h.carbonInk, primaryContainer = h.carbonSoft, onPrimaryContainer = h.ink,
        secondary = h.carbon, background = h.paper, onBackground = h.ink, surface = h.sheet, onSurface = h.ink,
        surfaceVariant = h.paper, onSurfaceVariant = h.ink3, surfaceContainerLowest = h.sheet, surfaceContainerLow = h.sheet,
        surfaceContainer = h.paper, surfaceContainerHigh = h.sheet, surfaceContainerHighest = h.sheet,
        outline = h.rule2, outlineVariant = h.rule, error = h.neg, errorContainer = h.warnBg, onErrorContainer = h.ink,
    )
    val base = MaterialTheme.typography
    val typo = base.copy(
        displaySmall = base.displaySmall.copy(fontFamily = fonts.head), headlineMedium = base.headlineMedium.copy(fontFamily = fonts.head),
        headlineSmall = base.headlineSmall.copy(fontFamily = fonts.head), titleLarge = base.titleLarge.copy(fontFamily = fonts.head),
        titleMedium = base.titleMedium.copy(fontFamily = fonts.head), titleSmall = base.titleSmall.copy(fontFamily = fonts.body),
        bodyLarge = base.bodyLarge.copy(fontFamily = fonts.body), bodyMedium = base.bodyMedium.copy(fontFamily = fonts.body),
        bodySmall = base.bodySmall.copy(fontFamily = fonts.body), labelLarge = base.labelLarge.copy(fontFamily = fonts.body),
        labelMedium = base.labelMedium.copy(fontFamily = fonts.body), labelSmall = base.labelSmall.copy(fontFamily = fonts.body),
    )
    CompositionLocalProvider(
        LocalHues provides h, LocalFonts provides fonts, LocalTr provides tr, LocalLang provides lang,
        LocalExtra provides Extra(h.pos, h.neg, Color(0xFF4B3BD6), Color(0xFF26307F), h.warn, h.warnBg),
    ) {
        MaterialTheme(colorScheme = scheme, typography = typo, content = content)
    }
}
