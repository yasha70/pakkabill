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

## Android app

PakkaBill for Android (`android/`, package `com.pakkabill.app`) is a native Kotlin app built with
Jetpack Compose and Material 3 on the newest tools (Android Gradle Plugin 9.4, Kotlin 2.4, target
Android 17 / API 37, minimum Android 7). It runs the PakkaBill web app in a WebView and adds native
parts: splash screen, edge-to-edge screens whose status bar follows the page colour, adaptive and
themed icons, launcher shortcuts (New bill, Bills, GST summary, Meesho P&L), fingerprint/face app
lock, saving bills and reports into Downloads/PakkaBill, the Android share sheet (WhatsApp, Drive),
printing, UPI/WhatsApp hand-off, file upload, Material dialogs, an offline screen, native settings,
and Google Play in-app updates and reviews. `android/app/src/main/assets/pakkabill-android.js`
connects the page to the app; the app is recognised by `PakkaBillApp/` in its user agent
(`store=play` when installed from Google Play, where Pro is not sold because Play requires its own
billing for that).

Building: pushing `android/` to `main` runs `.github/workflows/android.yml`. It builds the Play
Store bundle (.aab) and the website APK unsigned (branch `apk-build`), and tests a debug build on an
Android emulator: it drives the app and saves screenshots and results (branch `apk-shots`). Check the
newest library versions with the "Android versions" workflow.

Signing: the upload key `pakkabill-release.p12` (alias `pakkabill`) is kept by the owner and never
committed, because this repo is public. Sign the bundle with `jarsigner` and the APK with `apksigner`,
then put the APK at `download/PakkaBill.apk` and update `download/app.json`. Every update needs a
higher `versionCode` and the same key. `.well-known/assetlinks.json` lists the key fingerprints
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

- `pnl.html` the whole tool, shown inside PakkaBill in a frame (`pnl.html?embed=1`) with PakkaBill's
  colours, fonts and light/dark setting. Shop name and GSTIN start from Shop settings.
- `pnl-libs.js` SheetJS (xlsx-js-style), jsPDF, jsPDF-AutoTable and JSZip, loaded only by `pnl.html`.
- Uploaded reports stay on the device in the `hisaab` IndexedDB; costs, expenses, return marks and
  settings in localStorage under `hisaab.v1.`. Settings > Download backup moves them to another device.

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
