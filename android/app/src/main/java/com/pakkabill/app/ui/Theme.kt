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

/** The colours of the website's Meesho P&L (pnl.html :root), light and dark. */
@Immutable
data class Hues(
    val paper: Color, val sheet: Color, val rule: Color, val rule2: Color,
    val ink: Color, val ink2: Color, val ink3: Color,
    val carbon: Color, val carbonInk: Color, val carbonSoft: Color, val band: Color,
    val margin: Color, val neg: Color, val pos: Color, val warn: Color, val warnBg: Color, val dark: Boolean,
)

val LightHues = Hues(
    paper = Color(0xFFF6F7FB), sheet = Color.White, rule = Color(0xFFDCE1F0), rule2 = Color(0xFFB9C1DD),
    ink = Color(0xFF1B1F3B), ink2 = Color(0xFF4A5074), ink3 = Color(0xFF6F7599),
    carbon = Color(0xFF2F3490), carbonInk = Color.White, carbonSoft = Color(0xFFE8E9F8), band = Color(0xFF2F3490),
    margin = Color(0xFFC8323A), neg = Color(0xFFB42331), pos = Color(0xFF16774A), warn = Color(0xFF8A5200), warnBg = Color(0xFFFFF4DF), dark = false,
)
val DarkHues = Hues(
    paper = Color(0xFF0F1122), sheet = Color(0xFF161933), rule = Color(0xFF2A2F55), rule2 = Color(0xFF3B4170),
    ink = Color(0xFFE7E9F7), ink2 = Color(0xFFB7BBDA), ink3 = Color(0xFF8F94BA),
    carbon = Color(0xFF8E95FF), carbonInk = Color(0xFF0F1122), carbonSoft = Color(0xFF232858), band = Color(0xFF1D2168),
    margin = Color(0xFFFF6B74), neg = Color(0xFFFF7A84), pos = Color(0xFF4CD08F), warn = Color(0xFFF0B45A), warnBg = Color(0xFF2B2410), dark = true,
)

/** The website's fonts: Anek Latin for headings, Source Sans 3 for text, Anek Devanagari for the mark. */
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
