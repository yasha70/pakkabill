# PakkaBill

GST tax invoices and GSTR-1 JSON for Indian sellers. One static page that works offline.

- Bills with Original / Duplicate / Triplicate copies, CGST+SGST or IGST by place of supply,
  the garment 5% / 18% slab, UPI QR, PDF, printing and WhatsApp sharing.
- GSTR-1 JSON built from Meesho's sales, sales return and tax invoice reports.
- Everything stays in the browser on the device. No server, no accounts, no data leaves the phone or laptop.

## Deploying

Static site, no build step. Vercel serves the repository root as-is.

## Installing on a phone

Open the deployed address once, then:
- Android (Chrome): menu > Install app
- iPhone (Safari): Share > Add to Home Screen

After that it opens from the home screen with no internet. Bills stay on each device;
move them with Shop > Download backup and Restore.

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
- `admin.html` admin panel at `/admin`: earnings, customers, payments to approve, prices, UPI ID.

### Setting it up on Vercel

1. Storage: Vercel project > Storage > Create > Upstash for Redis, connected to this project
   (adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
2. Environment variable `ADMIN_PASSWORD` (8+ characters) for `/admin`. Redeploy.
3. In `/admin` > Settings, save your UPI ID and the name customers should see.

Plan checks run in the browser, so a technical user could get around them. Payments are only counted
after the owner approves them.
