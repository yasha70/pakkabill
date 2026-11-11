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
    // reads the sample label PDFs in tests the way the app reads them on the phone (PdfBox-Android)
    testImplementation("org.apache.pdfbox:pdfbox:2.0.32")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.1") // needed by Gradle 9
}

val extractEngine = tasks.register("extractEngine") {
    val html = rootProject.file("../pnl.html")
    val hindi = rootProject.file("../pnl-hi.js")
    val doodles = rootProject.file("core/doodles")
    val out = layout.buildDirectory.dir("generated/engine")
    inputs.files(html, hindi)
    inputs.dir(doodles)
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
        // the app's background doodles (light and dark tiles). They used to be read from pnl.html;
        // the website has no wallpaper any more, so the app keeps its own copies in core/doodles.
        listOf("doodle-light.svg", "doodle-dark.svg").forEach { doodles.resolve(it).copyTo(dir.resolve(it), overwrite = true) }
        // the Hindi words of the website, so the app switches language the same way
        dir.resolve("hi.js").writeText("var window = this;\n" + hindi.readText())
    }
}
sourceSets["main"].resources.srcDir(extractEngine)

// The other tools' engines (labels, GSTR-1, low shipping image, Lens, auto listing), taken from the
// website's files and made ES5 for Rhino by android/engines/build.mjs (needs Node.js). The website's
// own tests of those engines are made the same way, and the app's tests run them in Rhino.
val engines = rootProject.file("engines")
val site = rootProject.file("..")
val npmEngines = tasks.register<Exec>("npmEngines") {
    workingDir = engines
    inputs.files(engines.resolve("package.json"), engines.resolve("package-lock.json"))
    outputs.dir(engines.resolve("node_modules"))
    commandLine("npm", "ci", "--no-audit", "--no-fund", "--loglevel=error")
}
val enginesOut = layout.buildDirectory.dir("generated/engines")
val auditsOut = layout.buildDirectory.dir("generated/audits")
val buildEngines = tasks.register<Exec>("buildEngines") {
    dependsOn(npmEngines)
    workingDir = engines
    inputs.file(engines.resolve("build.mjs"))
    inputs.files(
        listOf("labels.html", "gstr1check.js", "gstr1view.js", "index.html", "lowship.js", "lens/core.js", "lens/listcore.js", "listing.js",
            "test/labels-audit.js", "test/gstr1-audit.js", "test/gstr1view-audit.js", "test/autolist-audit.js").map { site.resolve(it) },
    )
    outputs.dir(enginesOut)
    outputs.dir(auditsOut)
    val e = enginesOut.get().asFile.absolutePath
    val a = auditsOut.get().asFile.absolutePath
    commandLine("node", "build.mjs", e, "--tests", a)
}
sourceSets["main"].resources.srcDir(files(enginesOut).builtBy(buildEngines))
sourceSets["test"].resources.srcDir(files(auditsOut).builtBy(buildEngines))

tasks.test {
    useJUnitPlatform()
    systemProperty("pakkabill.root", rootProject.file("..").absolutePath)
    System.getenv("LISTING_OUT")?.let { systemProperty("listing.out", it) }
    // the script for Meesho's supplier panel, for the browser check (android/ci/autolist-web-check.mjs)
    System.getenv("AUTOLIST_WEB_OUT")?.let { systemProperty("autolist.web.out", it) }
    // the shipping check script for Meesho's page, for android/ci/ship-web-check.cjs
    System.getenv("SHIP_WEB_OUT")?.let { systemProperty("ship.web.out", it) }
}
