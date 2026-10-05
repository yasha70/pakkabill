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
    api(libs.kotlinx.serialization.json)
    testImplementation(kotlin("test"))
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.1") // needed by Gradle 9
}

val extractEngine = tasks.register("extractEngine") {
    val html = rootProject.file("../pnl.html")
    val out = layout.buildDirectory.dir("generated/engine")
    inputs.file(html)
    outputs.dir(out)
    doLast {
        val text = html.readText()
        val start = text.indexOf("/* Hisaab engine")
        require(start >= 0) { "Meesho P&L engine not found in pnl.html" }
        val end = text.indexOf("</script>", start)
        val dir = out.get().dir("pakkabill").asFile
        dir.mkdirs()
        dir.resolve("engine.js").writeText(text.substring(start, end))
    }
}
sourceSets["main"].resources.srcDir(extractEngine)

tasks.test {
    useJUnitPlatform()
    systemProperty("pakkabill.root", rootProject.file("..").absolutePath)
}
