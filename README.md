# PakkaBill

GST tax invoices and GSTR-1 JSON for Indian sellers. One static page that works offline.

- Bills with Original / Duplicate / Triplicate copies, CGST+SGST or IGST by place of supply,
  the garment 5% / 18% slab, UPI QR, PDF, printing and WhatsApp sharing.
- GSTR-1 JSON built from Meesho's sales, sales return and tax invoice reports.
- Meesho listing: the bulk catalog upload Excel from catalogue photos and a Meesho template.
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
