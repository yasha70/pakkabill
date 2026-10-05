// PakkaBill core: plain Kotlin (no Android) so it is tested on any computer. Reads Meesho files
// (Excel, CSV, ZIP), runs the Meesho P&L engine and talks to the PakkaBill server.
// The P&L engine is taken from ../../pnl.html at build time: the app and the website always use
// the same audited calculations.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(libs.rhino)
    implementation(libs.zxing.core) // QR code for paying Pro by UPI from another phone
    api(libs.kotlinx.serialization.json)
    testImplementation(kotlin("test"))
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.1") // needed by Gradle 9
}

val extractEngine = tasks.register("extractEngine") {
    val html = rootProject.file("../pnl.html")
    val hindi = rootProject.file("../pnl-hi.js")
    val out = layout.buildDirectory.dir("generated/engine")
    inputs.files(html, hindi)
    outputs.dir(out)
    doLast {
        val text = html.readText()
        val dir = out.get().dir("pakkabill").asFile
        dir.mkdirs()
        // the P&L engine
        val start = text.indexOf("/* Hisaab engine")
        require(start >= 0) { "Meesho P&L engine not found in pnl.html" }
        dir.resolve("engine.js").writeText(text.substring(start, text.indexOf("</script>", start)))
        // the "How to use" guide: steps, pictures and option meanings, in English and Hindi
        val g0 = text.indexOf("  var C = 'fill=\"none\"")
        val g1 = text.indexOf("  function speak(", g0)
        require(g0 >= 0 && g1 > g0) { "How to use guide not found in pnl.html" }
        dir.resolve("guide.js").writeText(
            "var GUIDE = (function () {\n" + text.substring(g0, g1) + "\n  return { art: ART, steps: STEPS, terms: TERMS, ui: UI };\n})();\n",
        )
        // the background doodles (light and dark tiles), same as the website and PakkaBill
        val d0 = text.indexOf("/* background doodles")
        require(d0 >= 0) { "background doodles not found in pnl.html" }
        val urls = Regex("--doodle:url\\(\"data:image/svg\\+xml,([^\"]*)\"\\)").findAll(text.substring(d0)).map { it.groupValues[1] }.toList()
        fun pct(s: String) = Regex("%([0-9A-Fa-f]{2})").replace(s) { it.groupValues[1].toInt(16).toChar().toString() }
        dir.resolve("doodle-light.svg").writeText(pct(urls[0]))
        dir.resolve("doodle-dark.svg").writeText(pct(urls[1]))
        // the Hindi words of the website, so the app switches language the same way
        dir.resolve("hi.js").writeText("var window = this;\n" + hindi.readText())
    }
}
sourceSets["main"].resources.srcDir(extractEngine)

tasks.test {
    useJUnitPlatform()
    systemProperty("pakkabill.root", rootProject.file("..").absolutePath)
}
