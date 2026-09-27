# PakkaBill

GST tax invoices and GSTR-1 JSON for Indian sellers. One static page that works offline.

- Bills with Original / Duplicate / Triplicate copies, CGST+SGST or IGST by place of supply,
  the garment 5% / 18% slab, UPI QR, PDF, printing and WhatsApp sharing.
- GSTR-1 JSON built from Meesho's sales, sales return and tax invoice reports.
- Meesho listing: the bulk catalog upload Excel from catalogue photos and a Meesho template.
- Meesho P&L: profit and loss and payment reconciliation from Meesho's payment report, with Excel and PDF.
- Everything stays in the browser on the device. No server, no accounts, no data leaves the phone or laptop.

## Deploying

Static site, no build step. Vercel serves the repository root as-is.

## Installing on a phone

Open the deployed address once, then:
- Android (Chrome): menu > Install app
- iPhone (Safari): Share > Add to Home Screen

After that it opens from the home screen with no internet. Bills stay on each device;
move them with Shop > Download backup and Restore.

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

- `pnl.html` the whole tool, shown inside PakkaBill in a frame (`pnl.html?embed=1`) with PakkaBill's
  colours, fonts and light/dark setting. Shop name and GSTIN start from Shop settings.
- `pnl-libs.js` SheetJS (xlsx-js-style), jsPDF, jsPDF-AutoTable and JSZip, loaded only by `pnl.html`.
- Uploaded reports stay on the device in the `hisaab` IndexedDB; costs, expenses, return marks and
  settings in localStorage under `hisaab.v1.`. Settings > Download backup moves them to another device.

## PakkaBill Pro (paid plans)

Free users get a monthly bill limit and the Carbon, Ledger and Plain designs. Pro (monthly or yearly)
unlocks unlimited bills, the Royal design, logo and signature, PDF / share / WhatsApp and GSTR-1 JSON.

Payment is by UPI QR: the customer scans the shop owner's UPI QR (amount filled in), pays from any UPI
app and submits the 12-digit transaction number (UTR). The owner finds that UTR in their bank or UPI
app and approves it in `/admin`, which turns Pro on. A UTR can only be submitted once. Until a UPI ID
is saved in `/admin` > Settings, everything stays free.

- `api/` Vercel functions: `auth` (sign up, log in), `me`, `config`, `pay` (submit a UTR, list my
  payments), `admin`.
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
3. In `/admin` > Settings, save your UPI ID and the name customers should see.

Plan checks run in the browser, so a technical user could get around them. Payments are only counted
after the owner approves them.

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
