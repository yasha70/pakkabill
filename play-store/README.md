# PakkaBill on Google Play

Everything needed to publish the PakkaBill Android app. The images in this folder are ready to upload.

| File | Where it goes in Play Console |
|---|---|
| `icon-512.png` | Store listing → App icon (512 × 512) |
| `feature-graphic.png` | Store listing → Feature graphic (1024 × 500) |
| `screenshot-1…6-*.png` | Store listing → Phone screenshots (1080 × 1920) |
| `PakkaBill-2.0.aab` (sent separately, signed) | Production / Testing → Create release → App bundles |

Package name: `com.pakkabill.app` (cannot change after the first upload).

## Store listing

**App name** (27/30): `PakkaBill: Know Real Profit`

**Short description** (78/80):
`Know your real Meesho profit after fees, returns, RTO and GST. Plus GST bills.`

**Full description:**

```
KNOW YOUR REAL PROFIT.
Sales are not profit. PakkaBill takes your Meesho payment report and shows what you really earned, after every Meesho fee, return, RTO, GST and product cost, reconciled to the paisa. And it makes GST bills that work offline.

MAKE GST BILLS IN SECONDS
• Tax invoices and estimates with CGST, SGST and IGST worked out for you
• Your shop name, GSTIN, logo and bank/UPI details on every bill
• 8 bill designs: Carbon, Modern, Classic, Ledger, Plain, Royal, Elegant and Boutique
• Share the bill PDF on WhatsApp or print it
• Save parties (buyers and suppliers) and items with HSN and GST rate
• Track paid and unpaid bills and money still to collect

WORKS OFFLINE
• Your bills are saved on your phone and work without internet
• Log in to back them up and open them on any other phone or computer

GST AND RETURNS
• GST summary by month and rate
• GSTR-1 JSON file from Meesho, Amazon and Flipkart reports, ready to upload on the GST portal

MEESHO PROFIT AND LOSS
• Upload your Meesho payment report and see your real profit
• RTO, customer returns and exchanges shown separately, with the fees Meesho charged on each
• Profit by SKU and break-even price
• Reconcile every order with its payment

MANY SHOPS, ONE APP
• Keep more than one shop or GSTIN and switch in one tap
• Cloud backup and sync across all your devices

SAFE AND PRIVATE
• Lock the app with your fingerprint, face or screen lock
• No ads. We never sell your data
• Download all your data or delete your account at any time

Made in India for GST sellers.
```

**App category:** Business
**Tags:** Invoicing, Accounting, Business tools
**Website:** https://pakkabill1.vercel.app
**Email:** your support email (required, shown publicly)
**Privacy policy:** https://pakkabill1.vercel.app/privacy

## App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://pakkabill1.vercel.app/privacy` |
| Ads | No, the app does not contain ads |
| App access | "All or some functionality is restricted": give reviewers a test login (mobile number + password of an account you create for Google, ideally with Pro gifted from the admin panel). Bills work without logging in. |
| Content rating | Fill the questionnaire: category **Utility, Productivity, Communication or Other**; answer **No** to violence, sexuality, language, drugs, gambling. Users can't interact or share content with each other. Result: Everyone / 3+ |
| Target audience | **18 and over** only |
| News app | No |
| Government app | No |
| Financial features | Declare that the app does **not** offer loans, banking, money transfer, crypto or trading: it is a billing and accounting tool that makes invoices. |
| Health | No |
| Data safety | See below |
| Account deletion | In-app: My account → Delete my account. Web link: `https://pakkabill1.vercel.app/delete-account` |

### Data safety answers

- **Does your app collect or share user data?** Yes, it collects. It does **not share** data with third parties (hosting providers are service providers, which Google does not count as sharing).
- **Is all data encrypted in transit?** Yes.
- **Can users request that data be deleted?** Yes (in-app and at the web link above).

| Data type | Collected | Optional? | Purposes |
|---|---|---|---|
| Personal info → **Phone number** | Yes | Optional (only to create an account) | Account management, App functionality |
| Personal info → **Name** (shop name) | Yes | Optional | Account management, App functionality |
| Financial info → **Purchase history** (Pro payments, UPI transaction number) | Yes | Optional | Account management, App functionality |
| Financial info → **Other financial info** (bills, parties, items in cloud backup) | Yes | Optional (only if cloud backup is on) | App functionality |
| Messages → **Other in-app messages** (help requests) | Yes | Optional | Customer support |
| App activity → **App interactions** (pages opened, visit counts) | Yes | Required | Analytics |
| Location → **Approximate location** (city from the connection, not GPS) | Yes | Required | Analytics |
| App info and performance → **Diagnostics** (app version, sent with help requests) | Yes | Optional | Customer support, App functionality |

For each: data is **not processed ephemerally**, it is **not shared**. Nothing else is collected (no precise location, contacts, photos, device IDs or advertising ID).

## Payments policy (important)

Google Play only allows digital upgrades (like PakkaBill Pro) to be sold inside a Play app through **Google Play Billing**. So the Play version of the app does **not** show the UPI payment screen: it says buying Pro isn't available in the app, and an account that already has Pro works as usual. The website and the APK from the website keep UPI payments. To sell Pro inside the Play app later, add Google Play Billing subscriptions (can be built on request once the app is on Play).

## Publishing steps

1. **Developer account**: https://play.google.com/console → sign up ($25 one-time). Verify your identity and phone number (takes 1 to 3 days).
2. **Create app**: name *PakkaBill: GST Billing App*, default language English (India), App, Free.
3. **Store listing**: paste the texts above, upload the icon, feature graphic and 6 screenshots.
4. **App content**: fill every section with the answers above.
5. **Testing first (required for new personal accounts)**: Testing → Closed testing → create a track, upload `PakkaBill-2.0.aab`, add **at least 12 testers** (their Gmail addresses) and keep them opted in for **14 days**. Share the opt-in link with them.
6. **App signing**: on the first upload, keep **"Use Google-generated app signing key"** (recommended). The key sent with this app is your **upload key**; keep it and its password safe, it signs every update.
7. **After the first upload**: Play Console → Test and release → App integrity → App signing: copy the **SHA-256 certificate fingerprint** of the *App signing key* and send it to update `/.well-known/assetlinks.json`, so pakkabill1.vercel.app links open straight in the Play version of the app.
8. **Production**: after 14 days of testing, apply for production access (a few questions about your testing), then Production → Create release → upload the bundle → Review and roll out.
9. When the listing is live, set `"play"` in `download/app.json` to the Play Store link; the website's **Get the app** page then shows a Google Play button.

## Updating the app later

Every update needs a higher `versionCode` in `android/app/build.gradle.kts`. Pushing to `main` builds a new bundle on GitHub Actions (branch `apk-build`); it is signed with the upload key and uploaded as a new release.
