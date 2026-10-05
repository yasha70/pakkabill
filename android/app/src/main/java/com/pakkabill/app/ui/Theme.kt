package com.pakkabill.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// PakkaBill's colours, the same as the website.
private val Light = lightColorScheme(
    primary = Color(0xFF5B3FE6),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFECE6FF),
    onPrimaryContainer = Color(0xFF1B0B5E),
    secondary = Color(0xFFE0603E),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE3D9),
    onSecondaryContainer = Color(0xFF3A0B00),
    tertiary = Color(0xFF2B3494),
    onTertiary = Color.White,
    background = Color(0xFFFDF8F3),
    onBackground = Color(0xFF2A2540),
    surface = Color(0xFFFDF8F3),
    onSurface = Color(0xFF2A2540),
    surfaceVariant = Color(0xFFF1ECF8),
    onSurfaceVariant = Color(0xFF5C5776),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFBF7FD),
    surfaceContainer = Color(0xFFF6F1FA),
    surfaceContainerHigh = Color(0xFFF0EAF6),
    surfaceContainerHighest = Color(0xFFEAE3F2),
    outline = Color(0xFFCFC4EA),
    outlineVariant = Color(0xFFE2DAF2),
    error = Color(0xFFC8202A),
    errorContainer = Color(0xFFFFE4E4),
    onErrorContainer = Color(0xFF5C0A0F),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFB3A1FF),
    onPrimary = Color(0xFF140C33),
    primaryContainer = Color(0xFF35295E),
    onPrimaryContainer = Color(0xFFECE6FF),
    secondary = Color(0xFFFF9A7E),
    onSecondary = Color(0xFF3A0B00),
    secondaryContainer = Color(0xFF5A2415),
    onSecondaryContainer = Color(0xFFFFE3D9),
    tertiary = Color(0xFF9AA2FF),
    onTertiary = Color(0xFF0B1050),
    background = Color(0xFF110E20),
    onBackground = Color(0xFFECE8FB),
    surface = Color(0xFF110E20),
    onSurface = Color(0xFFECE8FB),
    surfaceVariant = Color(0xFF2A2340),
    onSurfaceVariant = Color(0xFFBDB5D9),
    surfaceContainerLowest = Color(0xFF0C0A18),
    surfaceContainerLow = Color(0xFF16122A),
    surfaceContainer = Color(0xFF1B1631),
    surfaceContainerHigh = Color(0xFF241D3D),
    surfaceContainerHighest = Color(0xFF2D2549),
    outline = Color(0xFF4A4078),
    outlineVariant = Color(0xFF3A3160),
    error = Color(0xFFFF8A8F),
    errorContainer = Color(0xFF5C1A20),
    onErrorContainer = Color(0xFFFFDADB),
)

/** Colours for money: green for profit, red for loss, and the hero card's gradient. */
@Immutable
data class Extra(val gain: Color, val loss: Color, val heroStart: Color, val heroEnd: Color, val warn: Color, val warnContainer: Color)

private val LightExtra = Extra(Color(0xFF12714B), Color(0xFFC8202A), Color(0xFF5B3FE6), Color(0xFF2B3494), Color(0xFF8A5300), Color(0xFFFFF1D6))
private val DarkExtra = Extra(Color(0xFF5FD49A), Color(0xFFFF8A8F), Color(0xFF4A35B8), Color(0xFF1E2470), Color(0xFFFFC56B), Color(0xFF3D2C0B))

val LocalExtra = staticCompositionLocalOf { LightExtra }

private val Type = Typography().let { t ->
    t.copy(
        displaySmall = t.displaySmall.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.Bold),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.Bold),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/** Numbers line up in tables and totals. */
val TabularNums = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun PakkaBillTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalExtra provides if (dark) DarkExtra else LightExtra) {
        MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type, shapes = AppShapes, content = content)
    }
}
