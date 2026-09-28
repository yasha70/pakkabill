package com.pakkabill.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// PakkaBill's colours, the same as the web app.
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
    background = Color(0xFFFDF8F3),
    onBackground = Color(0xFF2A2540),
    surface = Color(0xFFFDF8F3),
    onSurface = Color(0xFF2A2540),
    surfaceVariant = Color(0xFFF1ECF8),
    onSurfaceVariant = Color(0xFF5C5776),
    surfaceContainer = Color(0xFFF6F1FA),
    surfaceContainerHigh = Color(0xFFF0EAF6),
    outline = Color(0xFFCFC4EA),
    outlineVariant = Color(0xFFE2DAF2),
    error = Color(0xFFC8202A),
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
    background = Color(0xFF110E20),
    onBackground = Color(0xFFECE8FB),
    surface = Color(0xFF110E20),
    onSurface = Color(0xFFECE8FB),
    surfaceVariant = Color(0xFF2A2340),
    onSurfaceVariant = Color(0xFFBDB5D9),
    surfaceContainer = Color(0xFF1B1631),
    surfaceContainerHigh = Color(0xFF241D3D),
    outline = Color(0xFF4A4078),
    outlineVariant = Color(0xFF3A3160),
    error = Color(0xFFFF8A8F),
)

@Composable
fun PakkaBillTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, content = content)
}
