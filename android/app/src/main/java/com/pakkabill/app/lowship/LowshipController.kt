package com.pakkabill.app.lowship

import android.graphics.Bitmap
import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.lowship.PhotoNote
import com.pakkabill.core.lowship.ShipEngine
import com.pakkabill.core.lowship.ShipPixels
import com.pakkabill.core.lowship.ShipSummary
import com.pakkabill.core.lowship.Tweak
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** How to make the versions (the website's options). */
@Serializable data class ShipOpts(val look: String = "smart", val level: String = "normal", val shape: String = "photo", val strength: String = "normal", val category: String = "")

/** A photo waiting to be made into versions. */
class Pending(val name: String, val bytes: ByteArray, val mime: String)

/** One version on the screen. */
class VersionView(val key: String, val label: String, val w: Int, val h: Int, val bytes: Int, val fillNow: Double?, val round: Int, val thumb: Bitmap, val notes: List<PhotoNote>)

/** One photo's versions and the shipping typed for them. */
class PhotoView(val id: String, val name: String, val thumb: Bitmap, val plain: Boolean, val fill: Double?, val versions: List<VersionView>, val ship: Map<String, Double>, val sum: ShipSummary?)

/** The seller's results, per category: versionKey -> the shipping Meesho showed (the website's pb-lowship2). */
@Serializable data class CatResults(val name: String, val results: MutableMap<String, MutableList<Double>> = mutableMapOf())
@Serializable data class ShipStore(val cats: MutableMap<String, CatResults> = mutableMapOf())

/**
 * Low shipping image for the screen: versions of the seller's main photo, made on one worker the way
 * the website makes them. The seller checks each in Meesho's catalogue upload and types the shipping;
 * the cheapest is marked, and "Try more" makes versions close to it. Photos stay on the phone.
 */
class LowshipController(private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "lowship").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: ShipEngine? = null
    private fun eng() = engine ?: ShipEngine().also { engine = it }

    private class Work(val id: String, val photo: ShipPhoto, val out: MutableList<ShipVersion> = mutableListOf(), val ship: MutableMap<String, Double> = mutableMapOf(), var round: Int = 0, val thumb: Bitmap)
    private val work = mutableListOf<Work>()

    private val _opts = MutableStateFlow(runCatching { J.decodeFromString(ShipOpts.serializer(), kv.get(OPTS) ?: "") }.getOrDefault(ShipOpts()))
    val opts: StateFlow<ShipOpts> = _opts.asStateFlow()
    private val _pending = MutableStateFlow<List<Pending>>(emptyList())
    val pending: StateFlow<List<Pending>> = _pending.asStateFlow()
    private val _photos = MutableStateFlow<List<PhotoView>>(emptyList())
    val photos: StateFlow<List<PhotoView>> = _photos.asStateFlow()
    private val _progress = MutableStateFlow<Pair<Int, Int>?>(null)
    val progress: StateFlow<Pair<Int, Int>?> = _progress.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun store(): ShipStore = runCatching { J.decodeFromString(ShipStore.serializer(), kv.get(STORE) ?: "") }.getOrDefault(ShipStore())
    private fun catKey(c: String) = c.trim().lowercase().replace(Regex("\\s+"), " ").take(40)

    fun setOpts(o: ShipOpts) { _opts.value = o; kv.put(OPTS, J.encodeToString(ShipOpts.serializer(), o)) }

    fun addPhotos(list: List<Pair<String, ByteArray>>) {
        val ok = list.filter { (n, b) -> Regex("\\.(jpe?g|png|webp|heic|heif)$", RegexOption.IGNORE_CASE).containsMatchIn(n) || isImage(b) }
        if (ok.isEmpty()) { _messages.tryEmit("Choose a photo (JPG, PNG or WebP)."); return }
        _pending.value = (_pending.value + ok.map { (n, b) -> Pending(n, b, mimeOf(n, b)) }).take(10)
    }
    fun removePending(i: Int) { _pending.value = _pending.value.filterIndexed { j, _ -> j != i } }

    private fun isImage(b: ByteArray) = b.size > 4 && ((b[0] == 0xff.toByte() && b[1] == 0xd8.toByte()) || (b[0] == 0x89.toByte() && b[1] == 'P'.code.toByte()) || (b[8] == 'W'.code.toByte() && b[9] == 'E'.code.toByte()))
    private fun mimeOf(n: String, b: ByteArray) = when {
        b.size > 2 && b[0] == 0xff.toByte() && b[1] == 0xd8.toByte() -> "image/jpeg"
        b.size > 2 && b[0] == 0x89.toByte() -> "image/png"
        n.endsWith(".webp", true) -> "image/webp"
        else -> "image/other"
    }

    /** Versions that were cheapest before in this category (or in any). */
    private fun pastWinners(): List<String> {
        val st = store()
        val chosen = st.cats[catKey(_opts.value.category)]
        val cats = if (chosen != null) listOf(chosen) else st.cats.values.toList()
        val el: JsonElement = J.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(CatResults.serializer()), cats)
        return runCatching { eng().ranking(el).take(4) }.getOrDefault(emptyList())
    }

    /** Makes the versions of every photo waiting, with the options chosen. */
    fun generate() {
        val list = _pending.value
        if (list.isEmpty()) { _messages.tryEmit("Add your product photo first."); return }
        _pending.value = emptyList()
        scope.launch {
            withContext(worker) {
                val o = _opts.value
                val n = eng().levels()[o.level] ?: 24
                var made = 0
                _progress.value = 0 to list.size * n
                for (p in list) {
                    val ph = runCatching { ShipRender.open(p.name.substringBeforeLast('.'), p.bytes, p.mime, o.strength) }.getOrNull()
                    if (ph == null) { _messages.tryEmit("${p.name} is not a photo PakkaBill can open (use JPG, PNG or WebP)."); continue }
                    val w = Work(java.util.UUID.randomUUID().toString().take(8), ph, thumb = ShipRender.thumb(ph.src))
                    synchronized(work) { work.add(0, w) }
                    for (t in eng().versions(o.look, n, ph.cut != null, pastWinners())) {
                        runCatching { add(w, t, 0, o.shape) }
                        made++
                        _progress.value = made to list.size * n
                        if (made % 4 == 0) publish()
                    }
                    publish()
                }
                _progress.value = null
                publish()
            }
        }
    }

    private fun add(w: Work, t: Tweak, round: Int, shape: String) {
        val ph = w.photo
        // "Your photo" is the seller's own file, byte for byte, so its shipping is what Meesho charges today
        val own = t.key == "orig" && ph.mime in setOf("image/jpeg", "image/png", "image/webp") && ph.bytes.size <= 8 * 1024 * 1024
        val bmp = if (own) null else ShipRender.render(ph, t, shape)
        val jpeg = if (own) ph.bytes else ShipRender.jpeg(bmp!!, t.q)
        val vw = bmp?.width ?: ph.origW
        val vh = bmp?.height ?: ph.origH
        val frame = t.frame
        val tf = t.fill
        val border = if (frame != null) frame + 0.007 else t.border ?: 0.0
        val fill = if (tf != null && ph.cut != null) tf * (t.zoom ?: 1.0) else ph.fill?.let { min(1.0, it * (t.zoom ?: 1.0) * (1 - 2 * border)) }
        val thumb = if (bmp != null) ShipRender.thumb(bmp).also { bmp.recycle() } else w.thumb
        w.out += ShipVersion(t, jpeg, vw, vh, fill, round, thumb)
    }

    private fun publish() {
        val list = synchronized(work) { work.toList() }
        _photos.value = list.map { w ->
            val versions = w.out.map { v ->
                VersionView(v.t.key, v.t.label.ifBlank { eng().keyLabel(v.t.key) }, v.w, v.h, v.jpeg.size, v.fillNow, v.round, v.thumb,
                    runCatching { eng().photoCheck(v.w, v.h, v.jpeg.size, if (v.t.key == "orig") null else v.fillNow) }.getOrDefault(emptyList()))
            }
            PhotoView(w.id, w.photo.name, w.thumb, w.photo.cut != null, w.photo.fill, versions, w.ship.toMap(), if (w.ship.isEmpty()) null else runCatching { eng().summary(w.ship) }.getOrNull())
        }
    }

    /** The shipping Meesho showed for a version (0 or blank clears it); kept for this category for next time. */
    fun setShip(photo: String, key: String, rupees: Double?) = scope.launch {
        withContext(worker) {
            val w = synchronized(work) { work.find { it.id == photo } } ?: return@withContext
            val cat = _opts.value.category.ifBlank { "Typed by you" }
            val st = store()
            val old = w.ship[key]
            val c = st.cats.getOrPut(catKey(cat)) { CatResults(cat.trim()) }
            if (old != null) c.results[key]?.let { l -> val i = l.lastIndexOf(old.roundToInt().toDouble()); if (i >= 0) l.removeAt(i) }
            if (rupees != null && rupees > 0) {
                w.ship[key] = rupees
                val l = c.results.getOrPut(key) { mutableListOf() }
                l += rupees.roundToInt().toDouble()
                while (l.size > 20) l.removeAt(0)
            } else w.ship.remove(key)
            kv.put(STORE, J.encodeToString(ShipStore.serializer(), st))
            publish()
        }
    }

    /** Round 2: up to 12 new versions close to the cheapest one of this photo. */
    fun more(photo: String) = scope.launch {
        withContext(worker) {
            val w = synchronized(work) { work.find { it.id == photo } } ?: return@withContext
            val s = if (w.ship.isEmpty()) null else eng().summary(w.ship)
            if (s == null) { _messages.tryEmit("Type the shipping of a few versions first, so PakkaBill knows the cheapest."); return@withContext }
            val best = w.out.find { it.t.key == s.best.first() } ?: return@withContext
            val list = eng().around(eng().tweakOf(best.t.key) ?: best.t, 12, w.out.map { it.t.key }).filter { w.photo.cut != null || !ShipPixels.needsCut(it) }
            if (list.isEmpty()) { _messages.tryEmit("No new versions left to try near this one."); return@withContext }
            w.round++
            var made = 0
            _progress.value = 0 to list.size
            for (t in list) { runCatching { add(w, t, w.round, _opts.value.shape) }; made++; _progress.value = made to list.size }
            _progress.value = null
            publish()
            _messages.tryEmit("${list.size} new versions made around \"${best.t.label.ifBlank { eng().keyLabel(best.t.key) }}\".")
        }
    }

    fun remove(photo: String) = scope.launch {
        withContext(worker) {
            synchronized(work) { work.find { it.id == photo }?.let { it.photo.recycle(); work.remove(it) } }
            publish()
        }
    }

    /** A version's JPEG, with the website's file name. */
    fun file(photo: String, key: String): Pair<String, ByteArray>? {
        val w = synchronized(work) { work.find { it.id == photo } } ?: return null
        val v = w.out.find { it.t.key == key } ?: return null
        val base = w.photo.name.replace(Regex("[^\\w\\- ]+"), "").trim().replace(Regex("\\s+"), "-").ifBlank { "photo" }
        return "$base-meesho-${key}.jpg" to v.jpeg
    }

    fun files(photo: String): List<Pair<String, ByteArray>> {
        val w = synchronized(work) { work.find { it.id == photo } } ?: return emptyList()
        return w.out.mapNotNull { file(photo, it.t.key) }
    }

    private companion object {
        const val OPTS = "opts"
        const val STORE = "results"
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}
