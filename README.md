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
