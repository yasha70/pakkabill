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
