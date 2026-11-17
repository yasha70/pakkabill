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

/**
 * PakkaBill's colours, light and dark: the website's official look (design/official.css). One brand
 * colour, the app icon's navy; white cards on a light grey page; no wallpaper and no gradients.
 */
@Immutable
data class Hues(
    val paper: Color, val sheet: Color, val rule: Color, val rule2: Color,
    val ink: Color, val ink2: Color, val ink3: Color,
    val carbon: Color, val carbonInk: Color, val carbonSoft: Color, val band: Color,
    val margin: Color, val neg: Color, val pos: Color, val warn: Color, val warnBg: Color, val dark: Boolean,
    // the top bar and tab bar (--spine, --carbon-tint) and the focus ring
    val spine: Color = paper, val spineFg: Color = ink, val carbonTint: Color = carbonSoft, val focus: Color = carbon,
    // main buttons (--btn-bg): white text sits on this, never on carbon, which turns light in dark mode
    val btnBg: Color = carbon, val btnFg: Color = carbonInk,
    // soft lines inside a card, and the soft green and red behind ticks and warnings
    val ruleSoft: Color = rule, val posSoft: Color = carbonSoft, val negSoft: Color = warnBg,
) {
    /** Kept for screens that still ask for the two-colour lists: both are the plain brand colour now. */
    val brand: List<Color> get() = listOf(carbon, carbon)
    val btn: List<Color> get() = listOf(btnBg, btnBg)
}

val LightHues = Hues(
    paper = Color(0xFFF4F5F9), sheet = Color.White, rule = Color(0xFFDCDFEA), rule2 = Color(0xFFC3C8DC),
    ink = Color(0xFF141A33), ink2 = Color(0xFF4A5170), ink3 = Color(0xFF6B7190),
    carbon = Color(0xFF2B3494), carbonInk = Color.White, carbonSoft = Color(0xFFDFE2F5), band = Color.White,
    margin = Color(0xFFB42318), neg = Color(0xFFB42318), pos = Color(0xFF0B7A4B), warn = Color(0xFF8A5200), warnBg = Color(0xFFFFF6DC), dark = false,
    spine = Color.White, spineFg = Color(0xFF141A33), carbonTint = Color(0xFFF1F3FB), focus = Color(0xFF5B68D6),
    btnBg = Color(0xFF2B3494), btnFg = Color.White,
    ruleSoft = Color(0xFFECEEF4), posSoft = Color(0xFFDCF5E8), negSoft = Color(0xFFFDE8E6),
)
val DarkHues = Hues(
    paper = Color(0xFF0B0E1C), sheet = Color(0xFF151A33), rule = Color(0xFF2C3258), rule2 = Color(0xFF3D4470),
    ink = Color(0xFFE9EBF7), ink2 = Color(0xFFB3B9D6), ink3 = Color(0xFF8A91B3),
    carbon = Color(0xFFAEB6F7), carbonInk = Color(0xFF0F1330), carbonSoft = Color(0xFF2A3063), band = Color(0xFF11152B),
    margin = Color(0xFFFF8F88), neg = Color(0xFFFF8F88), pos = Color(0xFF6FD6A5), warn = Color(0xFFF0C26A), warnBg = Color(0xFF2B2410), dark = true,
    spine = Color(0xFF11152B), spineFg = Color(0xFFE9EBF7), carbonTint = Color(0xFF1C2146), focus = Color(0xFFAEB6F7),
    btnBg = Color(0xFF4C58D0), btnFg = Color.White,
    ruleSoft = Color(0xFF20254A), posSoft = Color(0xFF143A2E), negSoft = Color(0xFF3D1A1F),
)

/** PakkaBill's fonts: Hind for headings, text and the PakkaBill wordmark (bold), as on the website. */
class Fonts(val head: FontFamily = FontFamily.Default, val body: FontFamily = FontFamily.Default, val mark: FontFamily = FontFamily.Default)

val LocalHues = staticCompositionLocalOf { LightHues }
val LocalFonts = staticCompositionLocalOf { Fonts() }
/** English text to the chosen language (Hindi uses the website's own dictionary). */
val LocalTr = staticCompositionLocalOf<(String) -> String> { { it } }
val LocalLang = staticCompositionLocalOf { "en" }

// kept for older screens (Account, lock) that still use Material components
@Immutable
data class Extra(val gain: Color, val loss: Color, val heroStart: Color, val heroEnd: Color, val warn: Color, val warnContainer: Color)
val LocalExtra = staticCompositionLocalOf { Extra(LightHues.pos, LightHues.neg, Color(0xFF2B3494), Color(0xFF222A7C), LightHues.warn, LightHues.warnBg) }

/** theme: "auto" follows the phone, or "light" / "dark" (Settings, Appearance). */
@Composable
fun PakkaBillTheme(theme: String = "auto", fonts: Fonts = Fonts(), lang: String = "en", tr: (String) -> String = { it }, content: @Composable () -> Unit) {
    val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    val h = if (dark) DarkHues else LightHues
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = h.btnBg, onPrimary = h.btnFg, primaryContainer = h.carbonSoft, onPrimaryContainer = h.ink,
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
        LocalExtra provides Extra(h.pos, h.neg, Color(0xFF2B3494), Color(0xFF222A7C), h.warn, h.warnBg),
    ) {
        MaterialTheme(colorScheme = scheme, typography = typo, content = content)
    }
}
