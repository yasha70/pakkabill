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

Free users get a monthly bill limit and the Carbon, Ledger and Plain designs. Pro (monthly or yearly,
paid through PhonePe) unlocks unlimited bills, the Royal design, logo and signature, PDF / share /
WhatsApp and GSTR-1 JSON. Until the database and PhonePe are configured, everything stays free.

- `api/` Vercel functions: `auth` (sign up, log in), `me`, `config`, `pay` (start and confirm a
  PhonePe checkout), `webhook` (PhonePe callback), `admin`.
- `pro.js` plan checks, upgrade dialog and the Plan page inside the app.
- `admin.html` admin panel, served at `/admin`.

### Setting it up on Vercel

1. Storage: Vercel project > Storage > Create > Upstash for Redis, connect it to this project.
   It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Environment variables (Project > Settings > Environment Variables):
   - `ADMIN_PASSWORD` at least 8 characters, for `/admin`
   - `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` from the PhonePe Business dashboard
   - `PHONEPE_ENV` `sandbox` for test payments, `production` for real money
   - `PHONEPE_WEBHOOK_USER`, `PHONEPE_WEBHOOK_PASS` the username and password you enter when adding
     the webhook `https://<your-domain>/api/webhook` on the PhonePe dashboard
3. Redeploy. Prices and the free bill limit are changed from `/admin` > Settings.

Plan checks run in the browser, so a technical user could get around them; payments themselves are
always confirmed with PhonePe on the server.
