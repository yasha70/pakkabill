# PakkaBill

Tools for Meesho sellers, with GST billing on the side. One static page that works offline.

The app opens on Home. The Meesho tools are the main navigation (sidebar: Home, then the group
"Meesho tools"; phone tabs Home · Profit · + New bill · Labels · Profile); Meesho Lens and the Label cropper sit under "More tools". Billing is one compact tab: every billing page (Bills, Parties, Items, GST summary,
GSTR-1) shows a small bar of chips to move between them, with New bill; the Profile page shows the same
bar so bills stay one tap away on a phone. The logo opens Home.

- Meesho P&L: profit and loss and payment reconciliation from Meesho's payment report, with Excel and PDF.
- Labels & packing chart: a packing chart from Meesho's manifest (blouse sizes as L / XL / XXL), and shipping labels in SKU and size order, as one PDF.
- Meesho Lens: competitor prices and sales.
- Label cropper: cuts the empty white space under shipping labels in a PDF.
- Meesho listing: the bulk catalog upload Excel from catalogue photos and a Meesho template.
- Billing: bills with Original / Duplicate / Triplicate copies, CGST+SGST or IGST by place of supply,
  the garment 5% / 18% slab, UPI QR, PDF, printing and WhatsApp sharing; GSTR-1 JSON built from
  Meesho's sales, sales return and tax invoice reports.
- Bill designs and columns: 20 designs in a picture gallery (Shop, the bill form and the bill view).
  Free: Carbon, Modern, Classic, Ledger, Plain, Trader (the full GST tax invoice format, every part in a
  box), Compact (small type, 30+ items on one page), Bill book (like a printed bill book, amounts in
  Rs. and P. columns), Minimal (black type, thin lines, saves ink), Corporate (colour band down the side,
  boxed total) and Bold (solid colour table header, big total bar); Pro: Royal, Elegant, Boutique, Studio
  (bold type, big total), Utsav (festive toran border), Prism (slanted colour header), Sapphire (full colour
  header with a gold line), Rangoli (festive rangoli corners) and Zari (woven saree-border bands).
- Bill PDF: each page is drawn at 5x (3970 x 5615, about 480 DPI); phones that cannot make an image that
  big (iPhones) get 4x, 3x or 2x. Prices that include GST: GST is taken out of the price with CGST equal to
  SGST, so the total is exactly the price typed (bills from calcV 2; older bills keep their numbers).
- Fetch details (GST number): fills the buyer or shop name, address and state by itself once a valid GSTIN
  is typed (not when an old bill is opened), shows status, taxpayer type (composition flagged), registered
  and cancelled dates, legal name, nature of business, jurisdiction, e-invoicing and other places of
  business. Answers are kept on the device for 30 days (`pb-gst-cache`). IFSC on the Shop page fills the
  bank and branch from Razorpay's free IFSC directory (`/api/config?ifsc=`). Columns are chips above the items, on the bill view and on
  the Shop page for new bills: HSN code, Item code, Description, Size, Colour, MRP, Unit column, Rate
  with GST and Tax split per item (CGST and SGST, or IGST, rate and amount on each line). HSN can't be
  turned off on a bill to a GST-registered buyer. The discount shows its rupee amount (without GST when
  rates include GST, so quantity x rate - discount = taxable value) and its total. With MRP on, the bill
  shows the MRP total and what the buyer saves against the amount paid, and the bill form warns when
  the price with GST is above the MRP. Items keep MRP and item code. Old bills keep their design and the usual columns.
  When a table is too wide for the page it first lets long numbers break after a comma, then uses
  smaller type, so nothing is cut off in the PDF.
- Auto listing (`autolist.js`, #/autolist, with `lens/list.js` and `lens/listcore.js` in PakkaBill Lens 2.3):
  templates (Meesho category, every detail, sizes with price, return price, MRP and stock, name and
  description patterns) made in PakkaBill or saved straight from a form filled in Meesho; products with
  photos (IndexedDB), name, colour, SKU and price/stock changes; Send to Meesho, then one tap in the
  panel on Add Single Catalog fills every field by Meesho's own labels (text boxes, drop-downs, search
  lists, chips, radio buttons, size rows, SKU per size, photos), reads each value back, and lists what
  is left with a Point button that remembers the box. It never submits. Free: 1 template and 5 products
  at a time; Pro unlimited. Tests: `node test/autolist-audit.js` (logic) and a React + MUI stand-in form.
- GSTR-1 rules researched against the GST offline tool and the marketplace GST tools (GST Tool,
  GSTProSeller, GSTWali, OkayGST): the file says version GST3.2.4 (the current offline tool); no negative
  value is ever written (the offline tool refuses them): a state and rate whose returns are more than its
  sales is left out of Tables 7, 12 and 14 together and carried, with its HSN and operator, to the next
  return (saved in `pb-gstr1-carry` when the JSON is downloaded, added automatically next time, can be
  switched off); Table 7 lines are type OE with the operator in Table 14; Table 13 takes each document by
  its own date (a quarter's invoice file used for a monthly return no longer puts every month in one).
  The page is in numbered steps, and gives the GSTR-3B figures and an Excel workbook for the CA.
- GSTR-1 checker (`gstr1check.js`, under the GSTR-1 page): checks PakkaBill's JSON, or one made by any
  other tool, against the portal's rules before upload: GSTIN check digits, return period, tax from
  rate and value (Rs 1 tolerance), INTRA/INTER against the place of supply, state codes (25 and 28
  are gone), rates, duplicates, invoice numbers and dates, Table 12 split into B2B/B2C and tied to
  Tables 4, 5, 6, 7 and 9B, Table 13 ranges (series read across all numbers, overlaps, counts),
  Table 14 against Table 7, and a GSTR-3B 3.1/3.2 preview. Two files compare table by table and
  state by state; a cleaned copy fixes only safe things (zero lines, overlapping document ranges,
  document type names), never an amount. Tests: `node test/gstr1-audit.js`.
- GSTR-1 steps (`gstr1view.js`, on the GSTR-1 page), laid out like the marketplace GST tools (GST Tool):
  GST Profile, Import Data (a card for each platform: Meesho, Amazon, Amazon B2B, Flipkart and the GST
  portal TCS file; each opens its own upload window that says which files and how many are needed for the
  month or quarter, where to download them, which months each file covers, and shows Uploaded when done),
  Statement (each platform and month: sales, returns, net, IGST/SGST/CGST,
  invoice value, B2B/B2C/CDNR/nil/HSN split, the rows behind them and a CSV), TCS Report (your reports
  against the operators' GSTR-8 by operator, month and state: gross, returns, net, difference, TCS and
  0.5% due; operators matched by PAN, B2B through the operator counted, ₹1 tolerance; switch to use the
  GSTR-8 figures) and GSTR1 Report (each table as the portal shows it, a reconciliation from the reports to
  the return that accounts for every rupee, B2C HSN and documents switches, GSTR-1 Excel in the offline-tool
  format: b2b,sez,de, b2cl, b2cs, cdnr, exemp, hsn(b2b), hsn(b2c), docs, eco, and the JSON). Amazon B2B
  returns with a credit note number go to Table 9B (CDNR). Tests: `node test/gstr1view-audit.js`;
  sample reports in `test/fixtures/gstr1/`.
- Everything stays in the browser on the device. No server, no accounts, no data leaves the phone or laptop.

## Home (the app's first screen)

`#/dashboard` (`dash.js`, `window.pbHomeMount`) is where the website opens, for everyone, on a phone or
a laptop: opening `/` with no page in the address always lands here. It is kept short on purpose:

- a greeting ("Welcome to PakkaBill" and one line on what it does, for someone new);
- the four main tools: Check my profit, New bill, Sort labels, Low shipping photo, and an
  "All tools" link to the full list;
- Your numbers, only when there are any: the Meesho profit Profit & Loss last showed for the seller's
  own files (`pnl.html` saves it as `hisaab:last`, never for the sample data), billed this month and
  money to collect;
- Safe to use: four plain facts from the privacy policy (files stay on the device, no ads or selling
  of data, profit matched to Meesho's payments, help in English and Hindi), the business name,
  address, email and phone saved in the admin panel (Settings, Business details), and the policy links;
- the account (Sign up / Log in on a phone; on a laptop the side menu already offers them), Help and
  the app.

The website's own home page (about PakkaBill, pricing, questions) is at `/home` and `#/home`, and
"About PakkaBill" on Home opens it. The Android app has its own screens and does not use this page.

## Look and design

One look everywhere: the app icon's navy (`#2B3494`) as the only brand colour, white cards on a light
grey page, plain bold headings in Hind, boxed form fields, and a dark mode with the same layout. No
wallpaper and no colour gradients on buttons. Printed bills (`.sheet`) are not touched, so old bills
keep their design.

- `design/official.css`: the colours (light and dark), headings, cards, buttons, form fields, the
  desktop side menu, the phone top bar and bottom bar. It is built into `index.html` (a
  `<style id="pb-official">` straight after the main styles, so it wins over them).
- `design/home-gate.html`, `design/home.css`, `design/home.html`: the home page (see below).
- After editing any of these, run `python3 design/build.py`. It is the only build step.
- `design/shots.cjs` makes the home page's pictures (`img/home-*.webp`) and the share picture
  (`img/og.jpg`) from the app itself with its sample data: `npm run dev`, then `node design/shots.cjs`.
  Run it after a change to how the app looks.
- The P&L and Labels tools (`pnl.html`, `labels.html`), the admin panel (`admin.html`) and the
  information pages (`legal.css`) carry the same colours in their own `:root` blocks. The tool scripts
  (`pro.js`, `support.js`, `shops.js`...) use the colour variables, with the navy as the fallback.
- White text sits on `--btn-bg` (dark enough in dark mode too), never on `--carbon`, which is the
  colour for links and selected things and turns light in dark mode.

## Log in and sign up

Log in, sign up and forgot password are a full page with its own address: `/login`, `/signup` and
`/forgot-password` (`vercel.json` serves `index.html` for them; `pro.js` opens the page). On a laptop
PakkaBill and what an account gives are on the left and the form on the right; on a phone the form
fills the screen. Every Log in or Sign up button in the app and on the home page opens the same page
without leaving the screen behind it; Close, Escape, the phone's back button or "Continue without an
account" go back. A logged-in visitor to `/login` goes to My account.

The form itself (`authHtml` / `wireAuth` in `pro.js`): mobile number with +91, password with Show and
a strength line, the 6-digit code boxes when OTP is on (paste and SMS autofill), "Log in with a code",
and clear messages with a button to the right next step (wrong tab, wrong password, no account).

## Home page

`index.html` starts with the website's home page (`#pb-home`, between the `<!--pb-home-->` markers; edit
`design/home.html` and `design/home.css`, then run `python3 design/build.py`): a top bar with Log in
and Sign up, what PakkaBill does, four plain facts, the tools, three steps, real screens with sample
data (`img/home-*.webp`), Free and Pro with prices and trial days read from `/api/config`, questions,
and a footer with the tools, company and legal links and the business name, address, email and phone
saved in the admin panel (Settings → Business details), in English and Hindi (the choice is
saved as `hisaab:lang`, so the P&L and Labels tools open in the same language). It shows at `/home`
(`/?home=1`) and `#/home`; the website itself opens on the app's Home screen (above). Share preview image: `img/og.jpg`
(1200×630).

## OTP sign-up (off until you turn it on in the admin panel)

Sign-up by OTP and "Log in with OTP" are built in. Turn them on in Admin → Settings → OTP by SMS
with an SMS company's key. Plain steps: [docs/TURN-ON-OTP.md](docs/TURN-ON-OTP.md).

## Deploying

Static site, no build step. Vercel serves the repository root as-is.

## Installing on a phone

Open the deployed address once, then:
- Android (Chrome): menu > Install app
- iPhone (Safari): Share > Add to Home Screen

After that it opens from the home screen with no internet. Bills stay on each device;
move them with Shop > Download backup and Restore.

## Android app

PakkaBill for Android (`android/`, package `com.pakkabill.app`) is a native app: Kotlin, Jetpack
Compose and Material 3 on the newest tools (Android Gradle Plugin 9.4, Kotlin 2.4, target Android 17 /
API 37, minimum Android 8). Every PakkaBill screen is drawn natively; only Meesho's own website opens
inside the app, for Meesho Lens and Auto listing, which work on Meesho's pages.

- GST billing (4.0): tax invoices, bills of supply and estimates; CGST+SGST or IGST by place of supply,
  rates with or without GST (calcV 2), the garment 5% / 18% slab, discount, round off, HSN summary,
  amount in words, bill numbers by financial year (`SF/26-27/0001`), GSTIN check (check digit and
  state), saved parties and items offered while typing, paid/unpaid with money to collect, the GST
  summary by month and rate, and a CSV for the CA. The bill is an A4 PDF drawn on the phone with the
  shop's colour, bank details and a UPI QR code for the exact amount; it is previewed in the app, sent
  straight to the buyer's WhatsApp chat, saved to Downloads/PakkaBill or printed. The GST math
  (`android/core/.../bill/Gst.kt`) is the website's, line for line, and `BillTest` checks it against
  numbers from the website's own code. Bills are kept on the phone (`files/bills/bills.json`); a
  billing backup from the website restores into the app and the other way round.
- Meesho P&L: worked out on the phone by the website's audited engine (`pnl.html`, run in Rhino),
  with reconcile, product costs, expenses, Excel and PDF, the home-screen profit widget and a weekly
  reminder.
- Every website tool (4.1), each run by the website's own engine so both always give the same
  answer: `android/engines/build.mjs` takes the engines from the website's files when the app is built
  (made ES5 with Babel, run in Rhino), and the core tests run the website's own audits on them.
  - Labels & packing chart: Meesho label and manifest PDFs (picked, or shared from any app with "Sort
    labels in PakkaBill") to the packing chart and the labels sorted by SKU and size, as PDF, CSV or
    WhatsApp text, saved, shared or printed.
  - GSTR-1 JSON: Meesho, Amazon and Flipkart reports (CSV/Excel) to the GST portal file, the
    statement, TCS report and Excel for the CA, plus the checker for a GSTR-1 JSON; the same JSON as
    the website, byte for byte.
  - Low shipping image: versions of the main photo, saved to the gallery, and Meesho's real shipping
    for each (4.2): "Get Meesho's real shipping" opens Meesho's supplier panel in the app with the
    website's shipping bookmark code in it (`lens/shipcore.js`, `shiphook.js`, `shipbm.js`) and the app
    as the PakkaBill tab it talks to. The seller uploads their own photo once in Add Single Catalog;
    Meesho then prices every version itself, with the seller's login, and the prices fill in with
    the cheapest marked. Prices can still be typed by hand.
  - Meesho's supplier panel decides who it lets in. In the emulator on GitHub's servers it answered
    "Access Denied" (meesho.com itself opened fine for Lens), most likely because of the servers'
    address; the app does not disguise itself to get past that. If a seller's phone is turned away
    too, Auto listing and the shipping check still work the website's way: the PakkaBill Lens
    extension on a laptop, or the PB Shipping bookmark in the phone's Chrome.
  - Meesho listing: the bulk-upload Excel from the seller's own category template and photos, in the
    website's six steps, with its ready-made detail sets and size charts.
  - Meesho Lens: meesho.com inside the app, read by the website's Lens code, with seller price, sales
    speed and return risk in a panel; Meesho links shared from the Meesho app open in it ("Check in
    PakkaBill Lens").
  - Auto listing: templates, the seller's details and products with photos; "Fill in Meesho" opens
    Meesho's supplier panel in the app with the PakkaBill Lens extension's own form filler in it, as
    Chrome runs it on a laptop, so the catalogue form fills on the phone too. Its storage is the
    app's, reachable only from supplier.meesho.com; Meesho's page is left as it is, and the seller
    checks and submits each form in Meesho.
- Also: splash screen, edge-to-edge, adaptive and themed icons, launcher shortcuts (New bill, Meesho
  P&L, Upload, Costs), fingerprint/face app lock, Hindi, dark mode, Google Play in-app updates and
  reviews. The app is recognised by `PakkaBillApp/` in its user agent (`store=play` when installed
  from Google Play, where Pro is not sold because Play requires its own billing for that).

Bottom bar: P&L · Labels · + (new bill, estimate or Meesho files) · Bills · Tools (every tool,
grouped as on the website's menu).

Building: pushing `android/` (or a website file the engines come from) to `main` runs
`.github/workflows/android.yml`. It builds the Play Store bundle (.aab) and the website APK unsigned
(branch `apk-build`), runs the app's scripts for Meesho's pages in Chromium (Auto listing on the
website's stand-in for Meesho's form, `android/ci/autolist-web-check.cjs`; the shipping check on a
stand-in for Meesho's photo upload and shipping, `android/ci/ship-web-check.cjs`), and tests a debug build on an Android emulator: it
drives the app through every tool with sample files and saves screenshots and results (branch
`apk-shots`). Started by hand on another branch, it keeps these as the run's artifacts. Building
needs Node 22 besides the JDK (the engines are built with it). Check the newest library versions
with the "Android versions" workflow.

Signing: the upload key `pakkabill-release.p12` (alias `pakkabill`) is kept by the owner and never
committed, because this repo is public. Sign the bundle with `jarsigner` and the APK with `apksigner`,
then put the APK at `download/PakkaBill.apk` and update `download/app.json`. Every update needs a
higher `versionCode` and the same key.

Publishing in one tap: add the key once as repository secrets (Settings → Secrets and variables →
Actions): `ANDROID_KEYSTORE_BASE64` (the .p12 file in base64: `base64 -w0 pakkabill-release.p12`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`pakkabill`) and `ANDROID_KEY_PASSWORD`. Then
Actions → "Publish Android app" → Run workflow. It takes the newest build from `main` whose "Android
app" run passed, signs it, refuses a different key (phones could not update) or a versionCode that
is not higher, commits `download/PakkaBill.apk` and `download/app.json` (the website serves them),
and keeps the signed bundle (.aab) as the run's artifact for Google Play. `.well-known/assetlinks.json` lists the key fingerprints
(add Google Play's app signing key after the first Play upload) so PakkaBill links open in the app.

Publishing on Google Play: see `play-store/README.md` (listing text, data safety answers, images).
Account deletion (`/delete-account` and in My account) and the privacy policy (`/privacy`) are
required by Google Play.

## Meesho listing

`#/listing` makes the Excel for Meesho's bulk catalog upload. The seller adds Meesho's category
template (a prefilled one works too), fills product details and sizes once, drops in the front, back
and side photo of each colour, and pastes the links from Meesho's Images Bulk Upload. The tool writes
the rows into the seller's own template, so Meesho's instructions, dropdowns and formulas stay as they
were. Manufacturer and packer details start from Shop settings.

- `listing.js` the whole tool, loaded with the app but only started when the page opens. It carries
  JSZip 3.10.1 (MIT) so it works offline. The app calls `window.pbListingMount(el)`.
- Template, details, sizes and the current batch stay on the device (`pb-listing` in localStorage and
  the `pakkabill-listing` IndexedDB). They are not part of the Shop backup.

## Meesho P&L

`#/pnl` is profit and loss and payment reconciliation from Meesho's payment report (Excel with
Order Payments, Ads Cost, Referral Payments and Compensation and Recovery) and, optionally, the orders
CSV. Every settlement row is checked against Meesho's Final Settlement Amount, money received ties to
bank credits, and the P&L covers GST (output GST, input credit on Meesho charges and ads, TCS), TDS,
cost of goods with returns and RTO back in stock or written off, packaging and other expenses. Combo
size comes from the product name ("Combo of 2", "Pack of 5"), or from the letters before the number in
the SKU (BPYG05 = 4 pieces) when the seller's names show their SKUs follow that rule. Downloads the P&L as
Excel and PDF.

"What your numbers say" (`E.insights`, on the P&L tab, in the Excel file's Insights sheet, on page 2 of
the full report and in the easy summary) works from the same totals as the statement, so it always agrees
with it: one kept order step by step (the parts of "every Rs 100" divided by the orders kept, adding up to
the profit per order to the paisa), this month against the month before (totals and the biggest reason
when both months are complete in the files, otherwise product profit per kept order, which a part-month
cannot bend), how much of the product profit the top products make, how many extra kept orders the ads
must bring to pay for themselves, days from order to Meesho's payment, a product that pays much more
shipping per order than the rest, and what Rs 10 more on the best seller adds in a month (less its GST
and any commission). A sale Meesho took back counts as a customer return even when the status column
still says delivered or is blank. Returns not reversed yet show the profit they will really take (the
sale less its GST and the goods back in stock, plus a return fee), not the sale. Whole rupees are rounded,
not cut. Tests: `node test/pnl-audit.js` (950 checks).

- `pnl.html` the whole tool, shown inside PakkaBill in a frame (`pnl.html?embed=1`) with PakkaBill's
  colours, fonts and light/dark setting. Shop name and GSTIN start from Shop settings.
- `pnl-libs.js` SheetJS (xlsx-js-style), jsPDF, jsPDF-AutoTable and JSZip, loaded only by `pnl.html`.
- Uploaded reports stay on the device in the `hisaab` IndexedDB; costs, expenses, return marks and
  settings in localStorage under `hisaab.v1.`. Settings > Download backup moves them to another device.

## Low shipping image (Meesho)

Meesho can show a different shipping charge for photos of the same product that look almost the
same. Tools that cut this charge make many versions of the seller's own photo and test each one in
Meesho's catalogue upload. `#/lowship` (the **Image** tab, in place of Listing, which moved to More
tools) does the same, professionally: the product stays full size and every version still looks like
the seller's photo. 12, 24 (default) or 40 versions, the seller's own photo first, then small changes:
zoom in or out 3-9%, a 1-3° turn (drawn a little bigger so no corners show), a small shift, a
little more or less light, contrast or colour, warmer or cooler, a clean white background (found by
flood-filling the plain background from the border), a thin border, sharpening and JPEG quality.
Same shape as the photo (1000-1500 px) or square 1000×1000, each under 1 MB.

**Smart look (default)**, after what other low-shipping tools change most: the product is cut out from
a plain background and placed in a 1000×1000 square at 52-90% of its size (white, sitting low, or the
photo's own background), soft studio backgrounds (cream, light grey, blush, sky, mint), mixed with the
small changes and coloured frames. On a busy photo the versions that need the cut-out are skipped and
the next ones take their place, so the count stays 12 / 24 / 40. Versions that were cheapest before in
the chosen categories (`ranking`) go first. After a check, **Try 12 more like the cheapest** (`around`)
makes small steps round the winner (size ±2-8%, background or frame colour, 1° turn, light, warmth,
sharpening) and sends only those, with the seller's photo, to the Meesho check; their keys hold their
settings (`x-f65_bdcream`, `encode`/`decode`) so names survive a reload. Each version shows Meesho's
photo check: size, file weight and how much of it the product fills (`photoCheck`). Download one, the
cheapest of each photo, or all as a ZIP. Runs in the browser; photos never leave the device. Code:
`lowship.js` (engine `window.PBShip`); tests: `node test/lowship-audit.js`.

**No extension: the shipping bookmark** (phone or laptop Chrome). The Image tab offers a bookmark
(`shipmark.js`, built by `lens/build.py` from `lens/shipcore.js`, `shiphook.js` and `lens/shipbm.js`, with the
site's own address put in when the bookmark is made). "Open Meesho" opens supplier.meesho.com from the
Image tab; the seller taps the bookmark there (phone: types `pbship` in the address bar), and it starts
watching the page's own requests, the same way the extension does. The seller uploads their own photo
once; it learns Meesho's shipping request, checks it gets back the same number, then prices every
version in each chosen category and sends each price straight back to the Image tab by window
messages (`pbsb`, checked against the PakkaBill and Meesho addresses). Nothing is installed, nothing
goes anywhere but Meesho, and it never submits a catalogue. Other "low shipping" websites that show a
price under each image without an extension are estimating it; Meesho's real number can only come from
the seller's own Meesho tab.

Lens 3.5 also works on pakkabill-one.vercel.app, starts the check by itself once it has learned your
photo's price, tries versions with no answer once more, stops with a clear message when Meesho says the
seller is logged out, and lists the versions cheapest first with the saving against the seller's photo.

**Real shipping from Meesho, live** (laptop, PakkaBill Lens 2.2+): "Check in Meesho" hands every
version to the extension (`lens/bridge.js`). On supplier.meesho.com, `lens/ship.js` shows a panel:
in Catalog Upload → Add Single Catalog it finds Meesho's photo box and the shipping charge (or the
seller points to each once), puts each version into the photo box, waits for Meesho's charge to
settle, reads it and sends it back. The Image tab shows each price as it comes, which version is
being checked, progress, the cheapest, and the saving against the seller's own photo; it remembers
the best version per category. "Put it in Meesho's photo box" puts the cheapest in. It never
submits a catalogue. On a phone the seller types the shipping Meesho shows.

## Labels & packing chart

`#/labels` (also `/labels.html` on its own) takes the label PDFs Meesho gives for Ready to Ship orders
and the manifest PDF, reads the Product Details table on each label (SKU, size, quantity, colour, order
number) and the courier, and makes one PDF: a pick list (pieces of each SKU and size, with tick boxes),
the labels in SKU-then-size or size-then-SKU order (optionally grouped by courier, orders with two or
more products last), then the manifest. Labels are checked against the manifest both ways. "Label
only, 4×6 inch" cuts each label away from its invoice for thermal printers. Pages it cannot read are
kept at the end in their original order.

Packing chart: Meesho's Supplier Manifest PDF has "Picklist" pages (SKU, Color, Size, Total Quantity) and
then one table per courier (S. No., Sub Order No., AWB, SKU, Qty., Size), where one parcel's order number,
AWB and size run over two or three lines. Every parcel is read from the courier tables and the result is
checked against the picklist. The chart has a row per SKU and a column per size with totals; for blouses
inch sizes count as letter sizes (26–30 L, 32–34 XL, 36–40 XXL, a free-size range by its middle), the same
rule as the P&L's Returns tab. It shows for all parcels or one courier, and downloads as a PDF (all, then
each courier), Excel (CSV) or WhatsApp text. With labels only, the chart is made from the labels.

Page: Full page, Label only 4×6 inch, or **Cut empty space** (label and invoice as Meesho made them, the blank
white area at the bottom of each label page cut off, as in the Label cropper; rotated pages too; manifest pages are
not cut).

- `labels.html` the whole tool; the engine (first script) runs in Node for `test/labels-audit.js`.
- `labels-libs.js` PDF.js 3.11.174 (reads text, `isEvalSupported: false`) and pdf-lib 1.17.1 (builds the
  PDF); `pdf.worker.min.js` is PDF.js's worker. Files never leave the device.
- `labels-pdf.js` the designed PDF pages (packing chart, first page of the sorted PDF) in the P&L PDF's
  doodle style: indigo band with doodles, PakkaBill mark, size cards, size split bar, size-mix bars and a
  "PAKKA" stamp when the manifest matches Meesho's picklist. It uses PakkaBill's fonts from
  `pnl-pdf-fonts.js` through `pdf-fontkit.js` (fontkit 1.1.1, MIT). All three load only when a PDF is made;
  without them the plain pages in `labels.html` are used.

## GST number lookup

In a new bill (Bill to), a party and the Shop page, a **Fetch details** button under the GSTIN box fills
the registered name (trade name, else legal name, only when the name box is empty), the address and the
state, and shows the status (Active / Cancelled), taxpayer type, constitution, registration date and legal
name. A cancelled number is shown in red.

- `gst.js` (browser) asks `GET /api/config?gstin=...` (part of the config endpoint, because the Hobby plan allows 12 functions). Offline, or with no lookup service, it still fills the
  state and shows the PAN's kind of business (company, proprietor...).
- `api/_lib/gst.js` checks the number (pattern, state code, check digit), then ask the service
  chosen in admin (Settings > GST number lookup): **Cashfree Verification** (client ID and secret) or any
  other GSTIN API (an https address with `{gstin}` in it and an optional header for its key). Environment
  variables do the same: `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` (`CASHFREE_SANDBOX=1`), or
  `GST_LOOKUP_URL` / `GST_LOOKUP_HEADER`. Answers in the GST portal's shape (`lgnm`, `tradeNam`, `pradr`...)
  or with longer names (`legal_name_of_business`, `principal_place_address`...) are both read.
- Each number's answer is kept for 30 days, so it is paid for once; 30 lookups an hour per visitor and
  2,000 a day in all protect the credits. Tests: `test/gst-audit.js`.

## PakkaBill Pro (paid plans)

| | Free | Pro (monthly or yearly) |
|---|---|---|
| Bills a month | set in admin (15) | unlimited |
| Shops (GSTINs) | 1 | up to 10 |
| Cloud backup and sync | only if the admin allows (first shop, 3 MB) | every shop, 30 MB |
| Designs | Carbon, Modern, Classic, Ledger, Plain | + Royal, Elegant, Boutique |
| Logo and signature, PDF / share / WhatsApp, GSTR-1 JSON | – | ✓ |

- **Free trial:** every new account gets Pro free for `trialDays` (admin → Settings, default 7, 0 turns
  it off). The Plan page shows the days left.
- **Renewals:** the last 3 days of Pro show a reminder in the app once a day, and a daily job
  (`api/cron.js`, Vercel Cron at 09:00 IST) sends a phone notification 3 days before and on the day
  Pro ends. Set `CRON_SECRET` in Vercel to lock that endpoint to the scheduler.
- **Paying:** after paying in the UPI app, "Paste" finds the 12-digit UTR in whatever was copied.
  Renewing adds the new time on top of what is left.

Payment is by UPI QR: the customer scans the shop owner's UPI QR (amount filled in), pays from any UPI
app and submits the 12-digit transaction number (UTR). The owner finds that UTR in their bank or UPI
app and approves it in `/admin`, which turns Pro on. A UTR can only be submitted once. Until a UPI ID
is saved in `/admin` > Settings, everything stays free.

**Razorpay** (optional, recommended): with a Key ID and Key Secret saved in `/admin` > Settings > Razorpay
(or `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`), the Pay button opens Razorpay's checkout (UPI, cards,
net banking, wallets) and Pro turns on by itself, with nothing to approve. The server makes the
Razorpay order at the plan price (coupon applied), checks checkout's signature, then asks Razorpay
for the payment itself (same order, full amount, captured; an authorised payment is captured) before
adding Pro, once per order. If the app closes right after paying, Razorpay's webhook
(`/api/pay?razorpay=webhook`, events `payment.captured`, `order.paid` and `refund.processed`) or the next
visit to the plan page catches up. A full refund made in the Razorpay dashboard takes back the Pro time
that payment added (a part refund keeps Pro; use Remove Pro in admin if needed). With a UPI ID saved too, customers can still choose the UPI QR. Code:
`api/_lib/razorpay.js`; tests: `node test/razorpay-audit.js`.

Trying Razorpay locally with test keys: copy `.env.example` to `.env` (never committed or deployed), put in
the `rzp_test_` Key ID and Secret, run `npm install` then `npm run dev` and open http://localhost:3000.
It runs the app and every `/api` function in one process with an in-memory database: sign up with any
mobile number, open the Plan page, pick a plan and tap Pay; in Razorpay's test checkout use a test UPI
ID such as `success@razorpay` or a test card. Pro turns on, and Payments in `/admin` shows it (set
`ADMIN_PASSWORD` in `.env` to log in). Keep test keys off the live site: with them anyone could get Pro
by paying with a test card.

- `api/` Vercel functions: `auth` (sign up, log in), `me`, `config`, `pay` (submit a UTR, Razorpay
  orders, confirmations and webhook, list my payments), `admin`.
- `pro.js` plan checks, upgrade dialog, UPI payment screen and the Plan page inside the app.
- `admin.html` admin panel at `/admin`: earnings chart, customers (last seen, CSV export), payments to
  approve, Pro-ending reminders over WhatsApp, prices and UPI ID.
- Offers tab: publish messages shown as a card in the app and on the Plan page, to everyone, free
  users, Pro users, people not logged in, or chosen numbers, with optional start/end dates, a button
  (Pro plans or a link) and free Pro days customers claim once. Coupon codes (% or ₹ off, use limit,
  end date) and gifting Pro days to a group.
- `api/news.js` messages for the viewer and claiming free days.

### Setting it up on Vercel

1. Storage: Vercel project > Storage > Create > Upstash for Redis, connected to this project
   (adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
2. Environment variable `ADMIN_PASSWORD` (8+ characters) for `/admin`. Redeploy.
3. In `/admin` > Settings, save your Razorpay keys (Test keys first) and/or your UPI ID and the name
   customers should see.

Plan checks run in the browser, so a technical user could get around them. UPI QR payments are only
counted after the owner approves them; Razorpay payments once Razorpay confirms them to the server.

## Multiple shops (GSTINs)

`shops.js` (loaded before the app) keeps several shops in one browser. Each shop has its own database
(`pakkabill` for the first, `pakkabill-<id>` for others; localStorage prefix to match), so bills,
parties, items, numbering, GST summary and backup files never mix. The app asks `pbShopDb()` /
`pbShopPrefix()` which one to open; switching sets the active shop and reopens the app.

- Switcher: the shop button in the phone top bar (when there are 2+ shops) and the shop card in the
  desktop side menu. `#/shops` ("Shops & cloud" in the menu and Tools) lists shops, adds one (name,
  GSTIN → state filled in, copy items / parties / bank, UPI, logo, design, terms; bill prefix from the
  initials) and deletes one (not the first shop, and not the open one).
- More than one shop is a Pro feature (`pbGate('shops')`). If Pro ends, every shop stays usable.

## Cloud backup and sync

`sync.js` + `api/sync.js` (`api/_lib/sync.js`). When a customer is logged in and backup is part of
their plan, each shop is gzip-compressed on the device and uploaded in 500 KB parts whenever it
changes (checked every 30 s, when the app is hidden, and before switching shops).

- Redis: `sync:<phone>` index (per shop: version, parts, size, name, GSTIN, device, time) and
  `sync:<phone>:<shop>:<a|b>:<n>` parts; uploads alternate between two slots so the last good copy is
  never half-overwritten, and `synclock:` allows one upload per shop at a time.
- Versions: an upload names the version it started from; if another device saved first, it gets a
  conflict, downloads, merges and uploads again. Merge is per record (bills, parties, items): the
  newer edit wins, records deleted on one device stay deleted, new records from both are kept; shop
  settings take the side that changed.
- New device: logging in on the Plan page downloads every shop straight away ("Restored N bills").
  If that device already had a different business in its first shop, it is kept as a separate shop.
- The open shop is only replaced when it is safe (not while a bill is being made); otherwise a
  "Changes from your other device are ready" bar waits for the customer.
- Restoring always works, even after Pro ends; only uploads need Pro (or the admin's free setting).
- The admin sees each customer's cloud use (shops, MB) in Customers.

## Label cropper

`#/crop` (under "More tools" in the side menu and the All tools sheet; not in the phone tabs or on Home)
cuts the empty white space under shipping labels. Each page is drawn on a canvas, the lowest
non-white pixels are found (a row needs 2+ dark pixels, so specks are ignored) and the page's
MediaBox / CropBox / TrimBox / BleedBox / ArtBox are set just below them, with the "Space kept" gap
(0–40 pt). "Also cut top and sides" trims all four edges. Nothing is redrawn, so text and barcodes stay
sharp. Rotated pages are cut along their visual bottom; blank pages are left as they are; a page is
never cut below 18 pt. Files are done one at a time (phones), the result can be downloaded, shared,
or joined into one PDF, and changing a setting crops every file again.

- `cropper.js` the page (`window.pbCropMount`) and the engine (`window.PBCrop`, tested in Node by
  `test/cropper-audit.js`). It loads `labels-libs.js` (PDF.js + pdf-lib) and `pdf.worker.min.js` only
  when the page opens. Files never leave the device.

## Meesho Lens (competitor insights)

`#/lens` lists every competitor product you opened on Meesho: price and price changes,
estimated bank settlement and earning after GST, rating and ratings, estimated orders per
day (from how fast ratings grow, about the last week), share of poor and average ratings,
and seller followers and products. Everything stays on the device.

Products come in two ways:
- **Laptop:** the Chrome/Edge extension, `pakkabill-lens.zip` (download from the Lens page).
  It shows a panel on Meesho product pages and syncs into PakkaBill when the Lens page opens.
- **Phone:** the Lens bookmark (copy it from the Lens page). On a Meesho product page it reads
  the page and opens PakkaBill with that product.

Source is in `lens/`: `core.js` (reading and estimates, shared by all three), `page.js`
(PakkaBill page), and the extension files. Run `python3 lens/build.py` after editing to
rebuild `lens.js` and `pakkabill-lens.zip`.

## Help & support (tickets)

`#/support` (`support.js`) lets anyone raise a ticket: topic, subject, message and an optional
screenshot (shrunk to ~430 KB JPEG in the browser). Logged-in customers' tickets belong to their
account; guests give a mobile number and the device keeps a private key per ticket
(`pb-support-guest` in localStorage). Basic app details go with each ticket (app version, last page,
browser, screen, plan). Replies from support show as a dot on the Tools button, the Help menu link
and the Tools card until read. The Plan page links to a payment ticket.

- `api/support.js`: create, list, get, reply, image, unread (rate limited).
- `api/_lib/support.js`: storage in Redis: `ticket:{id}` (conversation), `ticketimg:{id}:{n}`
  (screenshots), sorted sets `tickets` and `tickets:u:{phone}`, numbers from `ticket:seq` (PB-1001…).
- Admin panel, **Support** tab: filter and search, conversation with screenshots, customer's app
  details, WhatsApp and call buttons, quick replies, status (Open, In progress, Waiting for customer,
  Resolved, Closed) and priority. Payment tickets start as High. The tab shows how many tickets wait
  for a reply, and the Overview shows open tickets.

### Chat assistant

The top of the Help page is a chat with the PakkaBill assistant (`#/support?chat=1`,
`api/_lib/chat.js`). Customers ask in their own words, in English or Hinglish (voice input in
Chrome), and get an answer in seconds with one-tap buttons and follow-up suggestions:

- **How to use**: `api/_lib/guide.js` has 34 how-to articles written from the app's real screens
  (making bills, estimates, WhatsApp, PDF, printing, items, parties, shop details, logo, designs,
  UPI and bank, numbering, GST rules, GST summary, GSTR-1 JSON, backup, install, Meesho tools,
  Pro and payments…). The built-in search understands common Hinglish and answers 76 of 76 test
  questions correctly.
- **Problems**: the same checks as tickets (account, plan, payments, UTR, app version) run first,
  so "paid but Pro not active" gets that customer's real payment status.
- **Talk to a person** sends the chat to the team as a ticket (straight to a person).
- Chats stay on the device for 3 days; 👍/👎 and questions it could not answer show in the admin
  Support tab, so you can see what to add.

With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5`, adaptive thinking, low effort for fast
replies) answers the chat from the whole guide plus the customer's facts, in any language, and
remembers the conversation. The guide sits in a cached system prompt, so repeat chats cost less.
Greetings, payment approvals and refunds never go to the AI.

### Free assistant upgrades (no AI key needed)

- Understands Hindi in Devanagari ("बिल कैसे बनाएं"), Hinglish and spelling mistakes ("invoce",
  "whatsap"); 112 of 112 test questions answered correctly.
- 47 answers, including honest ones for what PakkaBill does not do yet (credit notes, e-invoice,
  stock, purchases, staff logins, other languages) with what to do instead.
- Answers from the customer's own records: "Am I on Pro?" (end date, days left, pending payment),
  "Is my app up to date?", "Any reply on my ticket?".
- Suggestions match the page the customer came from (New bill, Shop, GST summary, Plan…).
- **Help Center** (`#/support?guide=1`, deep links `&a=<id>`): every answer by topic, with search,
  buttons, related topics and "Ask a follow-up".
- 🔊 Read aloud on answers (the phone's own voice, Hindi or English).
- **Teach the assistant** (admin → Support): questions it could not answer have "Answer this";
  your answer (with other wordings and an optional button) is used straight away in the chat and
  the Help Center. Stored in Redis `guide:custom`.

### Guided help and finding it

Help is one tap away everywhere: a **Help** button in the phone top bar (with a red dot when there
is a reply), a **Need help?** card in the desktop side menu, and Help first in the Tools panel.

The Help page asks before it tickets: pick a topic (Bills, Payment, App not working, GST, Meesho,
Login, Suggestion, Something else), then the exact problem, then answer one or two quick taps
(device, page, printer, UTR…). The **quick fix** for that problem, checked against the customer's
own account and app, shows straight away (`preview`, no ticket stored). "Yes, that fixed it" ends
there; "No, I still need help" opens a short form that sends the answers, app details, optional
screenshot and an **urgent** flag. Tickets whose quick fix did not help skip the repeat answer and go
straight to the team (High, or Urgent) with a phone alert to the admin.

The Help page shows the team's real typical first-reply time (median of the last 30 tickets) and,
if set in the admin Support tab, a **WhatsApp us** button. The admin sees which quick fixes are
shown and how often they fix the problem, "Quick fix didn't help" tags, and how long each ticket
has waited (red after 2 hours).

### Automatic answers (PakkaBill assistant)

Every new ticket is investigated straight away (`api/_lib/assist.js`) and usually answered in a few
seconds, with one-tap fixes under the answer (Update PakkaBill now, Refresh my plan, Open Plan page,
Shop, GST summary, Parties, Items, Meesho tools). What it checks:

- the account and Pro plan, the customer's payments, and any 12-digit UTR in the message
  (pending, approved, rejected, not submitted, or submitted from another account);
- whether the app on the phone is out of date (the ticket carries the installed and the latest version);
- known problems: blank screen, PDF, printing, free-bill limit, designs, logo, lost bills, backup
  and new phone, CGST/SGST vs IGST, GSTR-1, Meesho listing, P&L and Lens, login, installing.

The customer answers "Yes, it's solved" (ticket resolved) or "I still need help" (goes to you, High).
A follow-up the same answer can't fix, a payment waiting for approval, a refund, a UTR from another
account or lost bills always go to a person. It never approves payments or changes accounts.
Approving or rejecting a payment in **Payments** posts the result in the customer's open payment
tickets automatically. Answered tickets with no reply for 3 days are resolved automatically.

In the admin **Support** tab: turn auto-answers on or off, see "What the assistant found" on each
ticket, **Re-check and suggest a reply** (fills your reply box, with the fix buttons), or
**Let the assistant answer**.

**Claude AI (optional).** Add `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables and
redeploy. Claude then writes the answers from the same findings, in the customer's language (English,
Hindi or Hinglish), and reads attached screenshots. It uses `claude-opus-5` with adaptive thinking,
structured JSON output and Anthropic's server-side fallback (`fallbacks: "default"`), and falls back
to the built-in answers on any error. Optional: `PB_AI_MODEL` (another model) and `PB_AI_PER_DAY`
(daily cap on AI answers, default 300). Money cases (payment waiting, refund, disputed UTR) always
use the exact built-in answer.

### Phone notifications

Customers can turn on notifications on the Help page (and after submitting a UTR): support replies,
"ticket resolved" and "payment approved / not approved" then reach the phone even when PakkaBill is
closed (Web Push, `api/_lib/push.js`, handled in `sw.js`). The admin can turn on alerts for new
payments and tickets that need a person from the Support tab. The signing keys are created
automatically and kept in Redis (`push:vapid`); set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` to use
your own. On iPhone, notifications work once PakkaBill is added to the Home Screen.
