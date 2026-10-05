package com.pakkabill.core

import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.google.zxing.qrcode.encoder.Encoder

/** QR codes (for the UPI payment link), as rows of dark (true) and light modules, no quiet zone. */
object Qr {
    fun of(text: String): Array<BooleanArray> {
        val m = Encoder.encode(text, ErrorCorrectionLevel.M, mapOf(EncodeHintType.CHARACTER_SET to "UTF-8")).matrix
        return Array(m.height) { y -> BooleanArray(m.width) { x -> m.get(x, y).toInt() == 1 } }
    }
}

/**
 * The time used for plan dates: never earlier than the latest time the app has seen from the
 * PakkaBill server or the phone, so turning the phone's clock back does not keep Pro running.
 * A time from the server replaces what was kept (it is right even when the phone's clock was
 * wrong before).
 */
class SafeClock(private val load: () -> Long, private val store: (Long) -> Unit, private val phone: () -> Long = System::currentTimeMillis) {
    fun now(): Long {
        val p = phone()
        val kept = load()
        if (p > kept) store(p)
        return maxOf(p, kept)
    }

    fun server(t: Long) { if (t > 0) store(maxOf(t, phone().coerceAtMost(t + DRIFT))) }

    private companion object { const val DRIFT = 10 * 60_000L }
}
