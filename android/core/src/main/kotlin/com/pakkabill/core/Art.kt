package com.pakkabill.core

/** Pictures taken from the website at build time. */
object Art {
    /** The background doodle tile (300 × 300) of the website, for light or dark mode. */
    fun doodle(dark: Boolean): String {
        val svg = Art::class.java.getResourceAsStream(if (dark) "/pakkabill/doodle-dark.svg" else "/pakkabill/doodle-light.svg")?.readBytes()?.toString(Charsets.UTF_8) ?: return ""
        // older SVG readers (Android) know links as xlink:href
        return svg.replace("<svg xmlns=\"http://www.w3.org/2000/svg\"", "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"")
            .replace("<use href=", "<use xlink:href=")
    }
}
