package com.pakkabill.app.lowship

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.media.ExifInterface
import com.pakkabill.core.lowship.PBox
import com.pakkabill.core.lowship.ShipPixels
import com.pakkabill.core.lowship.Tweak
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** A photo being worked on: the photo on white, and what a look at it found (lowship.js study). */
class ShipPhoto(
    val name: String, val bytes: ByteArray, val mime: String, val src: Bitmap, val origW: Int, val origH: Int,
    val bg: IntArray, val cut: Bitmap?, val box: PBox?, val fill: Double?,
) {
    private val backdrops = HashMap<String, Bitmap>()
    /** The cut-out product on a plain colour, same size and place. */
    fun backdrop(name: String): Bitmap = backdrops.getOrPut(name) {
        val c = cut!!
        val out = Bitmap.createBitmap(c.width, c.height, Bitmap.Config.ARGB_8888)
        val rgb = ShipPixels.BACKDROPS[name] ?: ShipPixels.BACKDROPS.getValue("white")
        Canvas(out).apply { drawColor(Color.rgb(rgb[0], rgb[1], rgb[2])); drawBitmap(c, 0f, 0f, null) }
        out
    }
    fun recycle() { src.recycle(); cut?.recycle(); backdrops.values.forEach { it.recycle() } }
}

/** One version made: its picture as a JPEG and what it shows. */
class ShipVersion(val t: Tweak, val jpeg: ByteArray, val w: Int, val h: Int, val fillNow: Double?, val round: Int, val thumb: Bitmap)

/**
 * The website's Low shipping image drawing (lowship.js render, sticker, jpeg), with Android's Canvas:
 * zoom, turn, shift, flip, the cut-out product on a colour or at a size, frames, borders, stickers,
 * then light, colour and sharpening on the pixels, and a JPEG under 1 MB.
 */
object ShipRender {
    private const val SMALL = 600
    private const val MAX_SRC = 2400
    private const val MAX_BYTES = 1000 * 1024

    /** Opens a photo (turned the right way up), on white, at most 2400 px; null when it is not a photo. */
    fun open(name: String, bytes: ByteArray, mime: String, strength: String): ShipPhoto? {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
        if (o.outWidth <= 0 || o.outHeight <= 0) return null
        var sample = 1
        while (max(o.outWidth, o.outHeight) / (sample * 2) >= MAX_SRC) sample *= 2
        val raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val turn = runCatching { ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val upright = when (turn) {
            ExifInterface.ORIENTATION_ROTATE_90 -> rotate(raw, 90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> rotate(raw, 180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> rotate(raw, 270f)
            else -> raw
        }
        val k = min(1.0, MAX_SRC.toDouble() / max(upright.width, upright.height))
        val w = (upright.width * k).roundToInt().coerceAtLeast(1)
        val h = (upright.height * k).roundToInt().coerceAtLeast(1)
        val src = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        Canvas(src).apply { drawColor(Color.WHITE); drawBitmap(upright, Rect(0, 0, upright.width, upright.height), Rect(0, 0, w, h), Paint(Paint.FILTER_BITMAP_FLAG)) }
        if (upright !== raw) upright.recycle()
        raw.recycle()
        val origW = if (turn == ExifInterface.ORIENTATION_ROTATE_90 || turn == ExifInterface.ORIENTATION_ROTATE_270) o.outHeight else o.outWidth
        val origH = if (origW == o.outWidth) o.outHeight else o.outWidth
        return study(name, bytes, mime, src, origW, origH, strength)
    }

    private fun rotate(b: Bitmap, deg: Float): Bitmap = Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { postRotate(deg) }, true)

    /** The background colour; on a plain background the product cut out (soft edge kept), its box and fill. */
    private fun study(name: String, bytes: ByteArray, mime: String, src: Bitmap, ow: Int, oh: Int, strength: String): ShipPhoto {
        val s = min(1.0, SMALL.toDouble() / max(src.width, src.height))
        val sw = max(1, (src.width * s).roundToInt()); val sh = max(1, (src.height * s).roundToInt())
        val small = Bitmap.createScaledBitmap(src, sw, sh, true)
        val px = IntArray(sw * sh).also { small.getPixels(it, 0, sw, 0, 0, sw, sh) }
        if (small !== src) small.recycle()
        val a = ShipPixels.analyze(sw, sh, px, strength)
        val m = a.mask ?: return ShipPhoto(name, bytes, mime, src, ow, oh, a.bg, null, null, null)
        val cw = src.width; val ch = src.height
        val d = IntArray(cw * ch).also { src.getPixels(it, 0, cw, 0, 0, cw, ch) }
        val fx = cw.toDouble() / sw; val fy = ch.toDouble() / sh
        fun at(x: Int, y: Int) = m[min(sh - 1, max(0, y)) * sw + min(sw - 1, max(0, x))].toDouble()
        for (y in 0 until ch) {
            val fyv = (y + 0.5) / fy - 0.5; val y0 = floor(fyv).toInt(); val ty = fyv - y0
            for (x in 0 until cw) {
                val fxv = (x + 0.5) / fx - 0.5; val x0 = floor(fxv).toInt(); val tx = fxv - x0
                val v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
                if (v > 0) {
                    // soft edge: the background fades out
                    val i = y * cw + x
                    d[i] = (Math.rint(255 * (1 - v)).toInt().coerceIn(0, 255) shl 24) or (d[i] and 0xffffff)
                }
            }
        }
        val cut = Bitmap.createBitmap(d, cw, ch, Bitmap.Config.ARGB_8888)
        val box = PBox(floor(a.box.x * fx).toInt(), floor(a.box.y * fy).toInt(), Math.ceil(a.box.w * fx).toInt(), Math.ceil(a.box.h * fy).toInt())
        return ShipPhoto(name, bytes, mime, src, ow, oh, a.bg, cut, box, ShipPixels.fillOf(a.box, sw, sh))
    }

    private fun rgb(c: List<Int>?) = c?.let { Color.rgb(it[0], it[1], it[2]) }

    /** One version of the photo, full size (lowship.js render). */
    fun render(ph: ShipPhoto, t: Tweak, shape: String): Bitmap {
        val cutOk = ph.cut != null
        val bdName = t.bd ?: if (t.white == true) "white" else null
        val colour = if (bdName != null && bdName != "own" && cutOk) ShipPixels.BACKDROPS[bdName] ?: ShipPixels.BACKDROPS.getValue("white") else null
        val src = if (colour != null && t.fill == null) ph.backdrop(if (ShipPixels.BACKDROPS.containsKey(bdName)) bdName!! else "white") else ph.src
        val fill = t.fill != null && cutOk
        val (w, h) = if (fill) 1000 to 1000 else ShipPixels.outSize(src.width, src.height, shape)
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val x = Canvas(out)
        val bg = colour ?: ph.bg
        val m = min(w, h)
        val frame = t.frame
        val border = if (frame != null) frame + 0.007 else t.border ?: 0.0
        x.drawColor(rgb(t.frameColor) ?: rgb(t.borderColor) ?: Color.rgb(bg[0], bg[1], bg[2]))
        if (frame != null) { val f = (m * frame).roundToInt().toFloat(); x.drawRect(f, f, w - f, h - f, Paint().apply { color = Color.WHITE }) }
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        x.save()
        if (fill) {
            val b = (m * border).roundToInt()
            val iw = w - 2 * b; val ih = h - 2 * b
            x.clipRect(b, b, b + iw, b + ih)
            x.drawRect(b.toFloat(), b.toFloat(), (b + iw).toFloat(), (b + ih).toFloat(), Paint().apply { color = Color.rgb(bg[0], bg[1], bg[2]) })
            val p = ShipPixels.placeFill(ph.box!!, ph.cut!!.width, ph.cut.height, iw, ih, min(0.97, t.fill!! * (t.zoom ?: 1.0)), t.dy ?: 0.0)
            x.translate((b + iw / 2.0 + (t.dx ?: 0.0) * iw).toFloat(), (b + ih / 2.0).toFloat())
            t.rot?.let { x.rotate(it.toFloat()) }
            if (t.flip == true) x.scale(-1f, 1f)
            x.drawBitmap(
                ph.cut, Rect(p.sx.toInt(), p.sy.toInt(), (p.sx + p.sw).toInt(), (p.sy + p.sh).toInt()),
                RectF((p.dx - iw / 2.0).toFloat(), (p.dy - ih / 2.0).toFloat(), (p.dx - iw / 2.0 + p.dw).toFloat(), (p.dy - ih / 2.0 + p.dh).toFloat()), paint,
            )
        } else {
            // fit the photo in (same shape: fills it; square: as big as fits), then the tweak
            val fit = min(w.toDouble() / src.width, h.toDouble() / src.height)
            var k = fit * (t.zoom ?: 1.0) * (1 - 2 * border)
            val zoomIn = (t.zoom ?: 1.0) >= 1 && border == 0.0
            val rot = t.rot
            if (zoomIn && rot != null && rot != 0.0) k *= ShipPixels.coverScale(src.width, src.height, rot)
            if (zoomIn && ((t.dx ?: 0.0) != 0.0 || (t.dy ?: 0.0) != 0.0)) k *= 1 + 2 * max(kotlin.math.abs(t.dx ?: 0.0), kotlin.math.abs(t.dy ?: 0.0))
            if (border > 0) {
                val b = (m * border).roundToInt()
                x.clipRect(b, b, w - b, h - b)
                x.drawRect(b.toFloat(), b.toFloat(), (w - b).toFloat(), (h - b).toFloat(), Paint().apply { color = Color.rgb(bg[0], bg[1], bg[2]) })
            }
            x.translate((w / 2.0 + (t.dx ?: 0.0) * w).toFloat(), (h / 2.0 + (t.dy ?: 0.0) * h).toFloat())
            t.rot?.let { x.rotate(it.toFloat()) }
            if (t.flip == true) x.scale(-1f, 1f)
            x.scale(k.toFloat(), k.toFloat())
            x.drawBitmap(src, -src.width / 2f, -src.height / 2f, paint)
        }
        x.restore()
        if (t.light != null || t.contrast != null || t.sat != null || t.warm != null || t.sharp != null) {
            val px = IntArray(w * h).also { out.getPixels(it, 0, w, 0, 0, w, h) }
            ShipPixels.adjust(px, t)
            t.sharp?.let { ShipPixels.sharpen(px, w, h, it) }
            out.setPixels(px, 0, w, 0, 0, w, h)
        }
        t.sticker?.let { sticker(x, w, h, it, t.corner ?: "tr", (m * border).roundToInt()) }
        return out
    }

    /** A small badge in one corner, inside the frame (lowship.js sticker). */
    private fun sticker(x: Canvas, w: Int, h: Int, kind: String, corner: String, edge: Int) {
        val m = min(w, h)
        val s = (m * 0.17).roundToInt().toFloat()
        val pad = edge + (m * 0.02).roundToInt()
        val cx = if ('r' in corner) w - pad - s / 2 else pad + s / 2
        val cy = if ('b' in corner) h - pad - s / 2 else pad + s / 2
        val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        fun shadow(on: Boolean) { if (on) fill.setShadowLayer(s * 0.08f, 0f, s * 0.03f, Color.argb(71, 0, 0, 0)) else fill.clearShadowLayer() }
        fun text(lines: List<String>, color: Int, k: Float, dy: Float = 0f) {
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = color; textAlign = Paint.Align.CENTER; textSize = (s * k).roundToInt().toFloat(); typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            }
            val fm = p.fontMetrics
            lines.forEachIndexed { i, l -> x.drawText(l, 0f, dy + (i - (lines.size - 1) / 2f) * s * k * 1.08f - (fm.ascent + fm.descent) / 2, p) }
        }
        fun round(rw: Float, rh: Float, r: Float) = Path().apply { addRoundRect(RectF(-rw / 2, -rh / 2, rw / 2, rh / 2), r, r, Path.Direction.CW) }
        fun burst(n: Int, r1: Float, r2: Float) = Path().apply {
            for (i in 0 until n * 2) {
                val a = PI * i / n - PI / 2; val r = if (i % 2 == 1) r2 else r1
                if (i == 0) moveTo((cos(a) * r).toFloat(), (sin(a) * r).toFloat()) else lineTo((cos(a) * r).toFloat(), (sin(a) * r).toFloat())
            }
            close()
        }
        x.save()
        x.translate(cx, cy)
        shadow(true)
        when (kind) {
            "hot", "fast", "trend" -> {
                x.rotate((-0.14 * 180 / PI).toFloat())
                fill.color = when (kind) { "hot" -> 0xffe0262f.toInt(); "fast" -> 0xfff26a1b.toInt(); else -> 0xff6a3fd8.toInt() }
                x.drawPath(round(s * 1.25f, s * 0.62f, s * 0.14f), fill)
                text(when (kind) { "hot" -> listOf("HOT", "SALE"); "fast" -> listOf("FAST", "SELLING"); else -> listOf("TRENDING") }, Color.WHITE, if (kind == "trend") 0.2f else 0.21f)
            }
            "tick" -> {
                fill.color = 0xff18a558.toInt(); x.drawCircle(0f, 0f, s * 0.42f, fill)
                val st = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = s * 0.1f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
                x.drawPath(Path().apply { moveTo(-s * 0.18f, s * 0.01f); lineTo(-s * 0.04f, s * 0.15f); lineTo(s * 0.2f, -s * 0.13f) }, st)
            }
            "new", "sale" -> {
                fill.color = if (kind == "new") 0xff18a558.toInt() else 0xffffcc1f.toInt()
                x.drawPath(burst(12, s * 0.48f, s * 0.38f), fill)
                text(listOf(if (kind == "new") "NEW" else "SALE"), if (kind == "new") Color.WHITE else 0xffd1202a.toInt(), 0.26f)
            }
            "star" -> {
                val p = burst(5, s * 0.5f, s * 0.21f)
                fill.color = 0xffffc21a.toInt(); x.drawPath(p, fill)
                x.drawPath(p, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = s * 0.04f; color = Color.WHITE })
            }
            "heart" -> {
                val hh = s * 0.42f
                fill.color = 0xffe8304a.toInt()
                x.drawPath(Path().apply {
                    moveTo(0f, hh * 0.9f); cubicTo(-hh * 1.3f, 0f, -hh * 0.6f, -hh * 1.05f, 0f, -hh * 0.35f); cubicTo(hh * 0.6f, -hh * 1.05f, hh * 1.3f, 0f, 0f, hh * 0.9f)
                }, fill)
            }
            "offer" -> {
                x.rotate((0.12 * 180 / PI).toFloat())
                fill.color = 0xffff7a1a.toInt()
                x.drawPath(Path().apply { moveTo(-s * 0.55f, -s * 0.26f); lineTo(s * 0.38f, -s * 0.26f); lineTo(s * 0.58f, 0f); lineTo(s * 0.38f, s * 0.26f); lineTo(-s * 0.55f, s * 0.26f); close() }, fill)
                text(listOf("OFFER"), Color.WHITE, 0.23f)
            }
            else -> {
                // rosettes: best seller, premium, top quality
                fill.color = when (kind) { "premium" -> 0xff1d2453.toInt(); "top" -> 0xff2459c4.toInt(); else -> 0xffc9961c.toInt() }
                x.drawPath(burst(16, s * 0.5f, s * 0.44f), fill)
                x.drawCircle(0f, 0f, s * 0.37f, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = s * 0.03f; color = if (kind == "premium") 0xffe2b84c.toInt() else Color.WHITE })
                text(when (kind) { "premium" -> listOf("PREMIUM"); "top" -> listOf("TOP", "QUALITY"); else -> listOf("BEST", "SELLER") }, if (kind == "premium") 0xffe2b84c.toInt() else Color.WHITE, if (kind == "premium") 0.16f else 0.17f)
            }
        }
        shadow(false)
        x.restore()
    }

    /** A JPEG under about 1 MB, starting at the version's quality (lowship.js jpeg). */
    fun jpeg(b: Bitmap, q0: Double?): ByteArray {
        val start = q0 ?: 0.92
        var last = ByteArray(0)
        for (q in listOf(start, 0.86, 0.8, 0.72, 0.64)) {
            if (q > start) continue
            val out = ByteArrayOutputStream()
            b.compress(Bitmap.CompressFormat.JPEG, (q * 100).roundToInt(), out)
            last = out.toByteArray()
            if (last.size <= MAX_BYTES || q <= 0.64) return last
        }
        return last
    }

    /** A small picture for the screen (about 360 px on its longer side). */
    fun thumb(b: Bitmap): Bitmap {
        val k = 360.0 / max(b.width, b.height)
        return if (k >= 1) b.copy(Bitmap.Config.ARGB_8888, false) else Bitmap.createScaledBitmap(b, (b.width * k).roundToInt().coerceAtLeast(1), (b.height * k).roundToInt().coerceAtLeast(1), true)
    }
}
