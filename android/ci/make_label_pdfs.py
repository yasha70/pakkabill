"""Makes sample Meesho label and manifest PDFs for the emulator test (android/ci/shots.sh), laid out
like Meesho's (the same layout as the website's own test, test/labels-audit.js): the label on the top
of an A4 page with its Product Details table, then the tax invoice. Names and numbers are made up.
Run: python3 android/ci/make_label_pdfs.py android/ci   (needs reportlab)"""
import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = sys.argv[1] if len(sys.argv) > 1 else "."

# (courier, awb, cod, [(sku, size, qty, color, order)])
LABELS = [
    ("Valmo", "VL0081234567", True, [("KURTI-RED-10", "XL", 1, "Red", "260000000000001_1")]),
    ("Delhivery", "1490000000001", False, [("KURTI-RED-2", "M", 2, "Red", "260000000000002_1")]),
    ("Valmo", "VL0081234568", True, [("KURTI-RED-2", "XL", 1, "Red", "260000000000003_1")]),
    ("Valmo", "VL0081234569", True, [("BLOUSE-GRN", "Free-Size: 30-34", 1, "Green", "260000000000004_1")]),
    ("Delhivery", "1490000000002", True, [("KURTI-RED-2", "M", 1, "Red", "260000000000005_1"), ("BLOUSE-GRN", "38 Alterable", 1, "Green", "260000000000005_2")]),
    ("Valmo", "VL0081234570", False, [("SAREE-BLUE", "Free Size", 1, "Blue", "260000000000006_1")]),
]


def label_page(c, courier, awb, cod, rows):
    W, H = A4
    c.setFont("Helvetica-Bold", 9)
    c.drawString(28, 805, "Customer Address")
    c.setFont("Helvetica", 8)
    c.drawString(230, 805, "COD: Check the payable amount on the app" if cod else "Prepaid: Do not collect cash")
    c.drawString(28, 792, "Ramesh Kumar")
    c.drawString(28, 781, "12 MG Road, Jaipur, Rajasthan, 302001")
    c.drawString(28, 752, "If undelivered, return to:")
    c.drawString(28, 741, "Kavya Fashions, Surat 395003")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(260, 760, courier)
    c.setFont("Helvetica", 8)
    c.drawString(360, 760, "Pickup")
    # a barcode-like block and the AWB under it
    for i in range(48):
        if (i * 7) % 3:
            c.rect(260 + i * 3, 690, 1.6, 50, stroke=0, fill=1)
    c.setFont("Helvetica", 10)
    c.drawString(270, 678, awb)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(28, 650, "Product Details")
    c.setFont("Helvetica-Bold", 8)
    for x, t in ((28, "SKU"), (160, "Size"), (220, "Qty"), (255, "Color"), (310, "Order No.")):
        c.drawString(x, 636, t)
    c.setFont("Helvetica", 8)
    y = 622
    for sku, size, qty, color, order in rows:
        c.drawString(28, y, sku)
        c.drawString(160, y, size)
        c.drawString(224, y, str(qty))
        c.drawString(255, y, color)
        c.drawString(310, y, order)
        y -= 14
    c.setDash(3, 3)
    c.line(20, 470, W - 20, 470)
    c.setDash()
    c.setFont("Helvetica-Bold", 11)
    c.drawString(250, 435, "TAX INVOICE")
    c.setFont("Helvetica", 7)
    c.drawString(470, 435, "Original For Recipient")
    c.setFont("Helvetica", 8)
    c.drawString(28, 415, "BILL TO / SHIP TO")
    c.drawString(300, 415, "Sold by : Kavya Fashions GSTIN - 24ABCDE1234F1Z5")
    c.drawString(28, 350, "Description")
    c.drawString(79, 350, "HSN")
    c.drawString(102, 350, "Qty")
    c.drawString(315, 350, "Total")
    y = 338
    for sku, size, qty, color, order in rows:
        c.drawString(28, y, sku + " - Women Kurti")
        c.drawString(143, y, "6204")
        c.drawString(168, y, str(qty))
        c.drawString(315, y, "Rs. 349.00")
        y -= 12
    c.showPage()


def make_labels(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Meesho labels (sample)")
    for courier, awb, cod, rows in LABELS:
        label_page(c, courier, awb, cod, rows)
    c.save()


def make_manifest(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Supplier Manifest (sample)")

    def hdr():
        c.setFont("Helvetica", 12)
        c.drawString(36, 791, "Supplier Name : KAVYA_COLLECTION7")
        c.drawString(36, 773, "Date : 10 Nov, 2026")

    # picklist page: SKU | Color | Size | Total Quantity
    pick = {}
    for courier, awb, cod, rows in LABELS:
        for sku, size, qty, color, order in rows:
            k = (sku, color, size)
            pick[k] = pick.get(k, 0) + qty
    c.setFont("Helvetica-Bold", 18)
    c.drawString(36, 812, "Picklist")
    hdr()
    c.setFont("Helvetica-Bold", 10)
    for x, t in ((133, "SKU"), (291, "Color"), (403, "Size"), (484, "Total Quantity")):
        c.drawString(x, 748, t)
    c.setFont("Helvetica", 10)
    y = 722
    for (sku, color, size), q in pick.items():
        c.drawCentredString(141, y, sku)
        c.drawCentredString(301, y, color)
        c.drawCentredString(411, y, size)
        c.drawCentredString(511, y, str(q))
        y -= 33
    c.setFont("Helvetica", 8)
    c.drawString(410, 40, "(1)")
    c.showPage()
    # one page per courier: S. No. | Sub Order No. | AWB | SKU | Qty. | Size | Packed
    page = 2
    for courier in ("Valmo", "Delhivery"):
        c.setFont("Helvetica-Bold", 18)
        c.drawString(36, 812, "Courier : " + courier)
        hdr()
        c.setFont("Helvetica-Bold", 10)
        for x, t in ((45, "S. No."), (85, "Sub Order No."), (194, "AWB"), (313, "SKU"), (395, "Qty."), (451, "Size"), (513, "Packed")):
            c.drawString(x, 748, t)
        c.setFont("Helvetica", 10)
        y, n = 722, 0
        for cr, awb, cod, rows in LABELS:
            if cr != courier:
                continue
            for sku, size, qty, color, order in rows:
                n += 1
                c.drawString(54, y, str(n))
                c.drawString(82, y, order[:11])
                c.drawCentredString(321, y, sku)
                c.drawString(400, y, str(qty))
                c.drawCentredString(459, y, size)
                c.drawString(159, y - 8, awb)
                c.drawString(87, y - 15, order[11:])
                y -= 48
        c.setFont("Helvetica", 8)
        c.drawString(410, 40, "(%d)" % page)
        page += 1
        c.showPage()
    c.save()


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    make_labels(os.path.join(OUT, "Meesho-labels-sample.pdf"))
    make_manifest(os.path.join(OUT, "Meesho-manifest-sample.pdf"))
    print("made sample label and manifest PDFs in", OUT)
