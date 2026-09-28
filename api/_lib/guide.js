// How to use PakkaBill: the assistant's how-to knowledge, written from the app's own screens.
// Each article has example questions (English and Hinglish) that the built-in search matches
// against, the answer, and one-tap buttons. The same text is Claude's knowledge when an API
// key is set, so an answer never names a button that does not exist.
//
// ctx: { freeBills, prices: { monthly, yearly }, locked, pro }
const PRO_NOTE = (ctx) => (ctx.locked && !ctx.pro ? ' (part of PakkaBill Pro)' : '');

const ARTICLES = [
  {
    id: 'make_bill', related: ['items', 'parties', 'whatsapp'], topic: 'bills', title: 'Make a new bill (tax invoice)',
    q: ['how to make a bill', 'create invoice', 'new bill', 'bill kaise banaye', 'invoice banana', 'gst bill kaise banate hai', 'first bill', 'add bill', 'generate invoice', 'billing kaise kare'],
    text: () => 'To make a bill:\n1. Tap the + button (New bill) and keep "Tax invoice" selected.\n2. Bill to: type the buyer name (saved parties show up as you type). Add their GSTIN, or leave it empty for an unregistered buyer, and pick the State.\n3. Items: tap "Add item" or pick one of your saved items. Fill HSN, Qty, Unit, Rate, Disc % and GST.\n4. Choose "Rates exclude GST" or "Rates include GST" above the items.\n5. Under Details set the due date and Payment (Unpaid or Paid).\n6. Tap "Save bill". Then Download PDF, Print or send it on WhatsApp.\n\nTip: fill your shop details on the Shop page once; they print on every bill.',
    actions: ['new_bill', 'shop'],
  },
  {
    id: 'estimate', related: ['make_bill', 'whatsapp', 'print'], topic: 'bills', title: 'Make an estimate or quotation',
    q: ['estimate', 'quotation', 'quote', 'proforma', 'performa', 'kotation', 'estimate to bill', 'convert estimate', 'turn into a bill'],
    text: () => 'For a quotation, tap + (New bill) and choose "Estimate" at the top instead of Tax invoice. Estimates get their own numbers (EST/…), are not counted in the GST summary or the free bill limit, and print as "This estimate is not a tax invoice".\n\nWhen the buyer confirms, open the estimate and tap "Turn into a bill".',
    actions: ['new_bill'],
  },
  {
    id: 'whatsapp', related: ['pdf', 'paid', 'upi_bank'], topic: 'bills', title: 'Send a bill or payment reminder on WhatsApp',
    q: ['whatsapp', 'send bill', 'share bill', 'bill bhejna', 'whatsapp pe bhejo', 'share invoice', 'payment reminder', 'remind customer', 'reminder bhejna', 'send to customer'],
    text: (ctx) => `Open the bill and tap "WhatsApp"${PRO_NOTE(ctx)}. WhatsApp opens with a message to the buyer's phone number showing the bill number, date and total. For an unpaid bill the button is called "Payment reminder" and the message also asks them to pay (with your UPI ID if you added one on the Shop page).\n\nTo attach the bill itself, tap "Download PDF" first and attach the PDF in WhatsApp. Add the buyer's phone number on the bill or on the Parties page so WhatsApp opens their chat directly.`,
    actions: [],
  },
  {
    id: 'pdf', related: ['whatsapp', 'print', 'design'], topic: 'bills', title: 'Download a bill as PDF',
    q: ['pdf', 'download pdf', 'save pdf', 'pdf kaise nikale', 'pdf download', 'bill ka pdf', 'save bill as pdf'],
    text: (ctx) => `Open the bill from the Bills list and tap "Download PDF"${PRO_NOTE(ctx)}. The file is saved in your phone's Downloads folder (or your computer's Downloads). You can then attach it in WhatsApp or email.\n\nIf nothing happens, update PakkaBill and open it in Chrome (not inside another app's browser).`,
    actions: ['update'],
  },
  {
    id: 'print', related: ['design', 'pdf', 'logo'], topic: 'bills', title: 'Print a bill (and duplicate/triplicate copies)',
    q: ['print', 'printout', 'print bill', 'print kaise kare', 'duplicate copy', 'triplicate', 'original for recipient', 'transporter copy', 'thermal printer', 'a4 print', 'three copies'],
    text: () => 'Open the bill and tap "Print". "Print all 3 copies" prints the Original, Duplicate (for transporter) and Triplicate (for supplier) together, and you can switch between them at the top of the bill.\n\nIn the print screen: paper size A4, margins "Default", scale 100% and turn on "Background graphics" so colours and your logo print. For a small thermal printer use the Plain design.',
    actions: [],
  },
  {
    id: 'edit_bill', related: ['make_bill', 'paid', 'gst_summary'], topic: 'bills', title: 'Edit, copy, cancel or delete a bill',
    q: ['edit bill', 'change bill', 'correct bill', 'mistake in bill', 'galti', 'bill change karna', 'delete bill', 'cancel bill', 'duplicate bill', 'copy bill', 'undo', 'restore bill'],
    text: () => 'Open the bill from the Bills list. At the bottom:\n- "Edit" changes anything on it.\n- "Duplicate" makes a new bill with the same items.\n- "Cancel bill" keeps it in your records as cancelled (left out of the GST summary); you can restore it later.\n- "Delete" removes it completely.\n\nFor filed GST returns, cancelling is usually better than deleting, so your numbers stay in sequence.',
    actions: [],
  },
  {
    id: 'paid', related: ['whatsapp', 'upi_bank', 'gst_summary'], topic: 'bills', title: 'Mark a bill paid and see what is still to collect',
    q: ['mark as paid', 'paid', 'unpaid', 'payment received', 'paisa mil gaya', 'outstanding', 'still to collect', 'pending payment from customer', 'due date', 'udhar', 'baki'],
    text: () => 'Open an unpaid bill and tap "Mark as paid". The Bills page shows "Still to collect" for the month, and the All / Unpaid / Paid / Estimates filters help you find bills. Set a due date under Details when you make the bill, and use "Payment reminder" to send a WhatsApp reminder.',
    actions: [],
  },
  {
    id: 'items', related: ['garment', 'make_bill', 'parties'], topic: 'bills', title: 'Add your products (Items) with HSN and GST',
    q: ['add item', 'add product', 'items', 'product list', 'hsn', 'hsn code', 'maal add', 'product kaise add kare', 'item list', 'price list', 'stock'],
    text: () => 'Open Items and tap "Add item": fill Item name, HSN code, Unit (PCS, MTR, SET…), Price (leave empty if it changes every time) and GST. Saved items show up when you type in a bill.\n\nYou can also tick "Save new items to the Items list" while making a bill. For clothing, the GST option "Garment (auto)" charges 5% up to ₹2,500 a piece after discount and 18% above. PakkaBill does not track stock quantities.',
    actions: ['items'],
  },
  {
    id: 'parties', related: ['make_bill', 'igst', 'whatsapp'], topic: 'bills', title: 'Save customers (Parties)',
    q: ['add party', 'add customer', 'customer list', 'parties', 'buyer', 'grahak', 'customer add kaise kare', 'client', 'save customer'],
    text: () => 'Open Parties and tap "Add party": Name, GSTIN (it fills the state for you), State, Phone, Email and Address. While making a bill you can also tick "Save buyer to parties". The Parties page shows how much each buyer has been billed.',
    actions: ['parties'],
  },
  {
    id: 'shop', related: ['logo', 'upi_bank', 'numbering'], topic: 'setup', title: 'Add your shop name, GSTIN and address',
    q: ['shop details', 'my gstin', 'business name', 'company name', 'address on bill', 'shop name change', 'dukan ka naam', 'setup', 'profile', 'my details'],
    text: () => 'Open the Shop page. Under "Your shop" fill Shop or business name, GSTIN, State, Phone, Email and Address. They print on every bill and save as you type. Your State decides whether bills charge CGST + SGST or IGST.',
    actions: ['shop'],
  },
  {
    id: 'logo', related: ['design', 'upi_bank', 'shop'], topic: 'setup', title: 'Add logo and signature',
    q: ['logo', 'signature', 'stamp', 'sign', 'logo kaise lagaye', 'add logo', 'dastkhat', 'seal'],
    text: (ctx) => `Open the Shop page, go to "Look of your bills" and tap "Add logo" and "Add signature"${PRO_NOTE(ctx)}. A signature signed on white paper and photographed straight works best. New bills use them straight away.`,
    actions: ['shop'],
  },
  {
    id: 'design', related: ['logo', 'print', 'pro'], topic: 'setup', title: 'Change bill design and colour',
    q: ['design', 'template', 'bill design', 'colour', 'color', 'theme of bill', 'royal', 'elegant', 'boutique', 'carbon', 'modern', 'classic', 'ledger', 'plain', 'format change', 'accent'],
    text: (ctx) => `On the Shop page under "Look of your bills", pick a Design (Carbon, Modern, Classic, Ledger, Plain, Royal, Elegant, Boutique) and an Accent colour. New bills use it. To change one bill, use the Bill design picker while making it or the design buttons on the bill itself.${ctx.locked ? ' Royal, Elegant and Boutique are part of PakkaBill Pro.' : ''}`,
    actions: ['shop'],
  },
  {
    id: 'upi_bank', related: ['whatsapp', 'paid', 'logo'], topic: 'setup', title: 'Add UPI QR and bank details to bills',
    q: ['upi', 'qr code', 'upi qr on bill', 'bank details', 'account number', 'ifsc', 'scan to pay', 'payment qr', 'bank account on bill'],
    text: () => 'On the Shop page under "Payments", add your UPI ID and turn on "Show the UPI QR on new bills": each bill then prints a QR for its exact amount (hidden automatically once the bill is paid). Add Account name, Account number, IFSC and Bank and branch to print your bank details.',
    actions: ['shop'],
  },
  {
    id: 'numbering', related: ['shop', 'edit_bill', 'inclusive'], topic: 'setup', title: 'Change invoice number or prefix',
    q: ['invoice number', 'bill number', 'prefix', 'numbering', 'serial number', 'series', 'start from', 'number change', 'financial year number'],
    text: () => 'On the Shop page under "Bill settings", set the Bill number prefix and the Estimate prefix. Numbers restart at 0001 each financial year (April to March). To continue an existing series, type the number on your next bill; the ones after it follow on.',
    actions: ['shop'],
  },
  {
    id: 'inclusive', related: ['igst', 'garment', 'numbering'], topic: 'gst', title: 'Rates including GST, round off, composition scheme',
    q: ['inclusive', 'including gst', 'rate include gst', 'gst included', 'mrp', 'round off', 'composition', 'bill of supply', 'without gst', 'no gst'],
    text: () => 'Each bill has "Rates exclude GST" and "Rates include GST" above the items. To make GST-inclusive the default, turn on "My rates include GST" on the Shop page (Bill settings). "Round totals to the nearest rupee" is also there. If you are under the composition scheme, turn on "I\'m under the composition scheme": new bills become bills of supply with no GST charged.',
    actions: ['shop'],
  },
  {
    id: 'igst', related: ['shop', 'parties', 'gst_summary'], topic: 'gst', title: 'CGST + SGST or IGST: how it is decided',
    q: ['igst', 'cgst', 'sgst', 'place of supply', 'interstate', 'other state', 'tax type', 'wrong tax', 'gst wrong'],
    text: () => 'PakkaBill compares your shop\'s State (Shop page) with the bill\'s Place of supply, which is usually the buyer\'s state. Same state: CGST + SGST (half each). Different state: IGST. The bill shows which one applies under Place of supply.\n\nIf it is wrong, check your State on the Shop page and the buyer\'s GSTIN or State on the bill, then save the bill again.',
    actions: ['shop', 'parties'],
  },
  {
    id: 'garment', related: ['items', 'igst', 'inclusive'], topic: 'gst', title: 'GST rate for clothes (5% or 18%)',
    q: ['garment gst', 'clothes gst', 'blouse gst', 'kapde ka gst', '5 or 18', 'gst rate', 'apparel', '2500'],
    text: () => 'For clothing pick GST "Garment (auto)" on the item: PakkaBill charges 5% when the price of a piece after discount is up to ₹2,500 and 18% above that, line by line. You can still choose a fixed rate (0%, 3%, 5%, 12%, 18%, 28%) for other goods. Ask your CA if you are unsure of your product\'s rate.',
    actions: ['items'],
  },
  {
    id: 'dispatch', related: ['print', 'make_bill', 'igst'], topic: 'bills', title: 'E-way bill, transporter and vehicle details',
    q: ['eway', 'e-way bill', 'transport', 'transporter', 'vehicle number', 'lr number', 'dispatch', 'shipping address', 'ship to'],
    text: () => 'While making a bill, tap "Add dispatch details" under Details for Transporter, vehicle, LR and e-way bill numbers; they print on the bill. For a different delivery address turn on "Ship to a different address" in the Bill to section. PakkaBill does not generate the e-way bill itself; create it on the e-way bill portal and type its number here.',
    actions: ['new_bill'],
  },
  {
    id: 'reverse', related: ['igst', 'gst_summary', 'make_bill'], topic: 'gst', title: 'Reverse charge',
    q: ['reverse charge', 'rcm'],
    text: () => 'Under Details on the bill, set Reverse charge to Yes only for notified goods and services. It then shows on the bill.',
    actions: [],
  },
  {
    id: 'gst_summary', related: ['gstr1_json', 'igst', 'edit_bill'], topic: 'gst', title: 'GST summary and GSTR-1 files for your CA',
    q: ['gst summary', 'gst report', 'monthly report', 'gstr1 csv', 'hsn summary', 'b2b', 'b2c', 'report for ca', 'sales report', 'tax report', 'return filing', 'gst return', 'bill register', 'excel report'],
    text: () => 'Open "GST summary". Choose Month or Financial year and use the arrows to change the period. You see bills, taxable value, CGST, SGST and IGST, a table by tax rate and the HSN summary (B2B and B2C). Tax invoices only; estimates and cancelled bills are left out.\n\nUnder "Files for GST filing" download CSV files: GSTR-1 B2B, GSTR-1 B2C summary, HSN summary and the Bill register. They open in Excel and match the GST offline tool, so you or your CA can copy them straight in.',
    actions: ['reports'],
  },
  {
    id: 'gstr1_json', related: ['gst_summary', 'pnl', 'pro'], topic: 'gst', title: 'GSTR-1 JSON from Meesho, Amazon or Flipkart reports',
    q: ['gstr1 json', 'gstr-1', 'gstr 1', 'json file', 'meesho gst', 'amazon gst', 'flipkart gst', 'tcs', 'marketplace gst', 'file gstr1', 'gst portal upload', 'tcs_sales', 'tax invoice details', 'mtr'],
    text: (ctx) => `Open "GSTR-1 JSON"${PRO_NOTE(ctx)} (in Tools, or from the GST summary page).\n1. Add your marketplace GST reports: Meesho needs three (tcs_sales.xlsx, tcs_sales_return.xlsx, Tax_invoice_details.xlsx); Amazon and Flipkart each use one GST report. You can add several at once, and the GST portal's TCS file to cross-check.\n2. Check Return details: your GSTIN, Monthly or Quarterly, the return month.\n3. Tap "Download GSTR-1 JSON".\n4. On gst.gov.in open Returns Dashboard, pick the period, GSTR-1 → Prepare Offline → Upload, select the file, check the summary, then file.\n\nThe reports are read on your device and never sent anywhere.`,
    actions: ['gstr1'],
  },
  {
    id: 'backup', related: ['install', 'account', 'lost'], topic: 'data', title: 'Backup, restore and move to a new phone',
    q: ['backup', 'restore', 'new phone', 'change phone', 'transfer data', 'laptop', 'computer', 'another device', 'data save', 'sync', 'data kaise wapas', 'mobile change'],
    text: (ctx) => `Easiest: log in on the Plan page${ctx.locked && !ctx.pro ? ' with PakkaBill Pro' : ''} and cloud backup saves your shops by themselves; on the new phone just log in with the same number and everything downloads.\n\nWith a file instead:\n1. On the Shop page, under "Offline and backup", tap "Download backup" (it saves the open shop).\n2. Send the file to the other device (WhatsApp to yourself, email or Drive).\n3. On the new device open PakkaBill → Shop → "Restore from backup" and pick the file.`,
    actions: ['shops', 'shop'],
  },
  {
    id: 'shops', related: ['cloud', 'shop', 'numbering'], topic: 'setup', title: 'More than one shop or GSTIN',
    q: ['multiple shops', 'two shops', 'second shop', 'another shop', 'second gstin', 'two gstin', 'multiple gstin', 'another gstin', 'switch shop', 'change shop', 'add shop', 'different business', 'dusri dukan', 'do gst number', 'branch'],
    text: (ctx) => `PakkaBill keeps several shops in one app, one per GSTIN${ctx.locked && !ctx.pro ? ' (more than one shop is part of PakkaBill Pro)' : ''}. Tap your shop name at the top (in the side menu on a computer) and choose "+ Add another shop (GSTIN)", or open Tools → "Shops & cloud". Give its name, GSTIN and state; you can copy your items, parties, bank, UPI, logo and design from the current shop.\n\nEach shop has its own bills, numbering, GST summary and backup, so GST figures never mix. Switch any time from the shop button.`,
    actions: ['shops'],
  },
  {
    id: 'cloud', related: ['backup', 'shops', 'account'], topic: 'data', title: 'Cloud backup: your bills on every device',
    q: ['cloud', 'cloud backup', 'sync', 'other device', 'another phone', 'new phone data', 'login other device', 'data automatically', 'online backup', 'auto backup', 'data kaise aayega', 'laptop and phone same data'],
    text: (ctx) => `Log in on the Plan page and ${ctx.locked && !ctx.pro ? 'with PakkaBill Pro ' : ''}your shops are backed up to your account by themselves whenever something changes. On another phone or laptop, open PakkaBill and log in with the same mobile number: your shops and bills download automatically. If you work on two devices, changes from both are merged.\n\nSee what is saved, and back up on demand, on the "Shops & cloud" page. You can still download a backup file from the Shop page too.`,
    actions: (ctx) => (ctx.locked && !ctx.pro ? ['shops', 'plan'] : ['shops']),
  },
  {
    id: 'lost', related: ['backup', 'install', 'support'], topic: 'data', title: 'My bills disappeared',
    q: ['bills gone', 'data lost', 'bills missing', 'data delete', 'sab gayab', 'bill nahi dikh raha', 'everything gone', 'data chala gaya'],
    text: () => 'PakkaBill keeps bills inside the browser on each device. They disappear if the browser\'s data was cleared, or when you open PakkaBill in a different browser or on another phone. Also check the shop button at the top: you may have another shop open.\n\nTo get them back: if cloud backup was on, log in on the Plan page and they download by themselves. If you have a backup file, open Shop → "Restore from backup". If they are still in another browser or the installed app, open it there, tap "Download backup" and restore the file here.',
    actions: ['shop'],
  },
  {
    id: 'install', related: ['backup', 'dark', 'account'], topic: 'setup', title: 'Install PakkaBill and use it offline',
    q: ['install', 'app download', 'play store', 'home screen', 'offline', 'without internet', 'apk', 'desktop app', 'icon', 'internet nahi'],
    text: () => 'PakkaBill installs without the Play Store. On the Shop page under "Offline and backup" tap "Install app", or in Chrome tap ⋮ → "Install app" (or "Add to Home screen"). On iPhone open it in Safari, tap Share → "Add to Home Screen". After that it opens from its own icon and making bills works without internet. Logging in, payments and the Meesho tools need internet.',
    actions: [],
  },
  {
    id: 'dark', related: ['design', 'install', 'shop'], topic: 'setup', title: 'Dark mode or light colours',
    q: ['dark mode', 'light mode', 'night mode', 'colours of app', 'theme', 'black screen', 'white screen colour'],
    text: () => 'Open the Shop page → "App colours" and choose Auto, Light or Dark (also in the Tools panel, and the moon/sun button at the top on bigger screens). Auto follows your phone\'s setting. This only changes the app, not your bills.',
    actions: ['shop'],
  },
  {
    id: 'sample', related: ['make_bill', 'shop', 'backup'], topic: 'setup', title: 'Sample data and starting fresh',
    q: ['sample data', 'demo', 'try', 'clear data', 'start fresh', 'delete all', 'reset app', 'made-up shop'],
    text: () => 'On an empty Bills page, "Try it with sample data" fills a made-up shop so you can explore. The banner "Clear it and start fresh" removes it. To wipe everything on this device, Shop → "Delete all data on this device"; download a backup first because it cannot be undone.',
    actions: ['shop'],
  },
  {
    id: 'listing', related: ['lens', 'pnl', 'gstr1_json'], topic: 'meesho', title: 'Meesho listing: bulk catalogue Excel from photos',
    q: ['meesho listing', 'catalog', 'catalogue', 'bulk upload', 'listing tool', 'meesho template', 'size chart', 'product upload meesho', 'listing kaise kare'],
    text: () => 'Open "Meesho listing" and go through the 6 steps:\n1. Template: in the Meesho supplier panel open Catalog Uploads, choose to add catalogs in bulk, pick your category and download the template. Add that .xlsx here.\n2. Details: fill the product details once, or tap a ready-made set ("Use with my template").\n3. Sizes: sizes and size chart.\n4. Photos and 5. Image links.\n6. Download the filled Excel and upload it back on Meesho.\n\nIf Meesho rejects the file, send us a screenshot of the error and the category name.',
    actions: ['listing'],
  },
  {
    id: 'lens', related: ['listing', 'pnl', 'install'], topic: 'meesho', title: 'Meesho Lens: competitor prices and sales',
    q: ['meesho lens', 'lens', 'competitor', 'competition', 'rival', 'other seller price', 'extension', 'bookmark', 'sales speed'],
    text: () => 'Meesho Lens shows what competitors charge, earn and sell, from the product pages you open.\n\nOn a laptop (Chrome or Edge): on the Meesho Lens page tap "Download the extension", unzip it, open chrome://extensions, turn on Developer mode, click "Load unpacked" and choose the pakkabill-lens folder. Then open products on meesho.com.\n\nOn a phone: tap "Copy the Lens bookmark", make a Chrome bookmark named Lens with that text as its URL, open a product on meesho.com in Chrome (not the Meesho app), type Lens in the address bar and tap the bookmark.\n\nOpening the same product again on later days shows how fast it sells.',
    actions: ['lens'],
  },
  {
    id: 'pnl', related: ['gstr1_json', 'listing', 'lens'], topic: 'meesho', title: 'Meesho P&L (Hisaab): profit, payouts and returns',
    q: ['meesho p&l', 'pnl', 'profit', 'loss', 'hisaab', 'payout', 'payment report', 'reconcile', 'return', 'rto', 'settlement', 'cost price', 'sku cost', 'combo', 'pack of'],
    text: () => 'Open "Meesho P&L". In the Meesho Supplier Panel go to Payments and download the payment report for your dates (and the orders CSV from Orders if you want pending payments too). Drop the files on the Upload tab; Excel, CSV or ZIP all work.\n\nThen open Costs and enter what one unit of each SKU costs you (combo pack sizes are read from SKUs like RGWM(GREY)05 = 5 pieces), and add Rent, packing and other costs under Expenses. The P&L and Reconcile tabs show profit, returns and missing payments. Files stay on your device.',
    actions: ['pnl'],
  },
  {
    id: 'pro', related: ['pay_how', 'limit', 'account'], topic: 'plan', title: 'PakkaBill Pro: what you get and prices',
    q: ['pro', 'premium', 'price', 'plan', 'subscription', 'kitne ka hai', 'kitne ka', 'pro kitne', 'how much', 'charges', 'fees', 'is it free', 'free hai', 'free app', 'pakkabill free', 'free to use', 'free or paid', 'cost of pro', 'paid plan', 'upgrade', 'free plan', 'benefits', 'kya milta hai', 'monthly price', 'yearly price'],
    text: (ctx) => `PakkaBill Pro gives unlimited bills every month; up to 10 shops (GSTINs); cloud backup on every device you log in on; Royal, Elegant and Boutique designs; your logo and signature; PDF download, share and WhatsApp; and GSTR-1 JSON from marketplace reports. It costs ₹${ctx.prices.monthly} a month or ₹${ctx.prices.yearly} a year${ctx.trialDays ? `, and every new account gets ${ctx.trialDays} days of Pro free` : ''}. The free plan has ${ctx.freeBills} bills a month (estimates don't count), one shop, the other five designs and printing.\n\nTo buy: open the Plan page, log in or create an account, choose a plan, pay the UPI QR and enter the 12-digit UTR. We switch Pro on after checking it, usually within a few hours.`,
    actions: ['plan'],
  },
  {
    id: 'pay_how', related: ['pro', 'account', 'support'], topic: 'plan', title: 'How to pay for Pro (UPI and UTR)',
    q: ['how to pay', 'payment kaise kare', 'utr', 'upi transaction id', 'transaction id', 'pay for pro', 'buy pro', 'pro kaise le'],
    text: () => 'Open the Plan page and log in. Pick monthly or yearly (add a coupon if you have one), scan the UPI QR with any UPI app and pay the exact amount. Then enter the 12-digit transaction number: PhonePe calls it "UTR", Google Pay "UPI transaction ID", Paytm "UPI Ref No.". We check it with our bank and switch Pro on, usually within a few hours; you get a notification if you turned them on.',
    actions: ['plan'],
  },
  {
    id: 'account', related: ['backup', 'pro', 'pay_how'], topic: 'plan', title: 'Create an account or log in',
    q: ['login', 'log in', 'sign up', 'create account', 'account', 'register', 'password', 'logout', 'log out', 'multiple devices'],
    text: () => 'Open the Plan page and choose "Create account" (Mobile number, Shop name, Password) or "Log in". Your account carries your Pro plan and cloud backup to every phone and laptop you log in on: log in on a new device and your shops download by themselves. Forgot your password? Ask here and our team will help you reset it.',
    actions: ['login'],
  },
  {
    id: 'limit', related: ['pro', 'estimate', 'pay_how'], topic: 'plan', title: 'Free bill limit',
    q: ['limit', 'bill limit', '15 bills', 'free bills', 'cannot make bill', 'upgrade popup', 'asks to upgrade', 'kitne bill free'],
    text: (ctx) => (ctx.pro || !ctx.locked
      ? 'There is no bill limit on your plan. If the app still asks you to upgrade, tap "Refresh my plan".'
      : `The free plan includes ${ctx.freeBills} bills every month; estimates don't count and the count restarts on the 1st. PakkaBill Pro removes the limit (₹${ctx.prices.monthly} a month or ₹${ctx.prices.yearly} a year).`),
    actions: (ctx) => (ctx.pro || !ctx.locked ? ['refresh_plan'] : ['plan']),
  },
  {
    id: 'search_bills', related: ['edit_bill', 'paid', 'gst_summary'], topic: 'bills', title: 'Find an old bill',
    q: ['find bill', 'search bill', 'old bill', 'purana bill', 'bill dhundo', 'bill kaha hai', 'last month bill', 'previous month', 'find invoice', 'bill number search', 'customer bills'],
    text: () => 'On the Bills page, type in the search box ("Search party, number or GSTIN"): it searches all your bills, not just this month. Or use the arrows next to the month to go back, and "Show" to see All, Unpaid, Paid or Estimates. The Parties page also shows how much each buyer has been billed.',
    actions: [],
  },
  {
    id: 'discount', related: ['make_bill', 'garment', 'inclusive'], topic: 'bills', title: 'Give a discount on a bill',
    q: ['discount', 'disc', 'less', 'chhoot', 'chhut', 'kam karna', 'offer on bill', 'discount kaise de', 'reduce price'],
    text: () => 'Each item row on the bill has a "Disc %" box: type the discount percentage and the taxable value, GST and total update straight away. GST is charged on the price after discount. For clothing with "Garment (auto)", the 5% or 18% rate is decided on the price after discount.',
    actions: ['new_bill'],
  },
  {
    id: 'terms', related: ['shop', 'make_bill', 'upi_bank'], topic: 'setup', title: 'Terms and notes on bills',
    q: ['terms', 'terms and conditions', 'notes', 'note on bill', 'goods once sold', 'declaration', 'footer', 'message on bill'],
    text: () => 'Set "Default terms and notes" on the Shop page (Bill settings); every new bill starts with them. To change them for one bill, edit "Terms and notes" under Details while making it.',
    actions: ['shop'],
  },
  {
    id: 'bill_date', related: ['make_bill', 'edit_bill', 'numbering'], topic: 'bills', title: 'Change the bill date or due date',
    q: ['date', 'bill date', 'change date', 'old date', 'back date', 'tarikh', 'due date', 'invoice date'],
    text: () => 'The Date box is at the top of the bill, next to No. Tap it to pick another date (for a saved bill, open it and tap "Edit"). The Due date is under Details. The bill lands in the month of its date in the Bills list and the GST summary.',
    actions: [],
  },
  {
    id: 'units', related: ['items', 'make_bill', 'gst_summary'], topic: 'bills', title: 'Units (PCS, MTR, KGS…)',
    q: ['unit', 'units', 'uqc', 'pcs', 'meter', 'mtr', 'kg', 'kgs', 'dozen', 'set', 'box', 'nos'],
    text: () => 'Pick the unit for each item: PCS, NOS, SET, PRS, MTR, KGS, DOZ, BOX, BDL or OTH. Set it once on the Items page, or change it in the item row of a bill. The GST summary uses these units (UQC) in the HSN table.',
    actions: ['items'],
  },
  {
    id: 'edit_item', related: ['items', 'parties', 'garment'], topic: 'bills', title: 'Edit or delete an item or party',
    q: ['edit item', 'delete item', 'change price', 'update price', 'edit party', 'delete party', 'change customer details', 'remove product', 'item price change'],
    text: () => 'Open Items (or Parties) and tap the item (or party) to edit it. The form has "Delete item" (or "Delete party") too. Bills you already made keep their old details; new bills use the changes.',
    actions: ['items', 'parties'],
  },
  {
    id: 'hsn_find', related: ['items', 'garment', 'gst_summary'], topic: 'gst', title: 'Which HSN code should I use?',
    q: ['which hsn', 'hsn code for', 'find hsn', 'hsn kya hai', 'hsn number', 'sac code', 'hsn search', 'what is hsn'],
    text: () => 'HSN is the government code for your goods. For readymade blouses PakkaBill suggests 6206 (6106 if knitted); "Add blouse presets" on the Items page adds common ones. For other products, look the code up on the GST portal\'s "Search HSN/SAC" page or ask your CA, then save it on the item once so every bill uses it.',
    actions: ['items'],
  },
  {
    id: 'gstin_state', related: ['igst', 'parties', 'shop'], topic: 'gst', title: 'GSTIN and state',
    q: ['gstin', 'gst number', 'gst no', 'state code', 'unregistered', 'without gstin', 'b2c customer', 'gstin wrong', 'invalid gstin'],
    text: () => 'When you type a buyer\'s GSTIN, PakkaBill fills their State from the first two digits (the state code). Leave GSTIN empty for an unregistered buyer (B2C) and pick their State. Your own GSTIN and State go on the Shop page. A GSTIN has 15 characters, for example 24AAXFR4821K1ZO.',
    actions: ['parties', 'shop'],
  },
  {
    id: 'credit_note', related: ['edit_bill', 'gstr1_json', 'support'], topic: 'gst', title: 'Credit note or sales return',
    q: ['credit note', 'debit note', 'sales return', 'return bill', 'goods returned', 'refund bill', 'cn', 'return entry'],
    text: () => 'PakkaBill does not make credit or debit notes yet. If a bill is wrong and not yet in a filed return, edit it or tap "Cancel bill". For goods returned after filing, issue the credit note through your CA or directly on the GST portal. Meesho returns are handled in the GSTR-1 JSON tool; B2B marketplace returns need Table 9B, which you enter on the portal.',
    actions: [],
  },
  {
    id: 'einvoice', related: ['dispatch', 'make_bill', 'gst_summary'], topic: 'gst', title: 'E-invoice (IRN) and e-way bill',
    q: ['e-invoice', 'einvoice', 'e invoice', 'irn', 'irp', 'qr code irn', 'ack number', 'e-invoicing'],
    text: () => 'PakkaBill does not generate e-invoices (IRN) or e-way bills. E-invoicing is needed only by businesses above the government\'s turnover limit; most small sellers don\'t need it (check with your CA). For an e-way bill made on the e-way bill portal, add its number under "Add dispatch details" so it prints on the bill.',
    actions: [],
  },
  {
    id: 'not_supported', related: ['items', 'backup', 'pnl'], topic: 'help', title: 'Stock, purchases and staff logins',
    q: ['stock', 'inventory', 'purchase', 'purchase bill', 'expense', 'kharcha', 'supplier bill', 'staff', 'employee', 'multiple users', 'two users', 'multi user', 'godown', 'ledger account', 'khata'],
    text: () => 'PakkaBill is a sales billing app: it does not track stock, purchase bills or staff logins yet. Items keep your price, HSN and GST; Parties show what each buyer was billed. Meesho sellers can add rent, packing and other costs in Meesho P&L → Expenses. To use the same bills on two devices, move them with Download backup / Restore from backup on the Shop page. Tell us which one you need most using "Talk to a person"; it helps us decide what to build next.',
    actions: [],
  },
  {
    id: 'language', related: ['install', 'dark', 'support'], topic: 'help', title: 'Hindi or other languages',
    q: ['hindi', 'language', 'bhasha', 'gujarati', 'marathi', 'tamil', 'hindi me bill', 'app in hindi', 'change language'],
    text: () => 'PakkaBill\'s screens and bills are in English for now. I (the assistant) understand Hindi and Hinglish, so ask me anything in the way you like. You can write Hindi in item names, addresses and terms, and it prints as typed.',
    actions: [],
  },
  {
    id: 'safety', related: ['backup', 'account', 'lost'], topic: 'data', title: 'Is my data safe and private?',
    q: ['safe', 'secure', 'privacy', 'private', 'data safe', 'who can see', 'data share', 'hack', 'surakshit'],
    text: () => 'Your bills, parties and items are saved on your own device, inside the browser. If you are logged in with cloud backup on, a compressed copy is also kept in your account so it can come back on any device you log in on; only you can open it with your login. Meesho and marketplace reports are read on your device and never sent anywhere. Without cloud backup, keep a backup file from the Shop page every week.',
    actions: ['shop'],
  },
  {
    id: 'support', related: [], topic: 'help', title: 'Talk to a person',
    q: ['talk to human', 'customer care', 'contact', 'call me', 'agent', 'support team', 'person', 'helpline', 'phone number', 'complaint'],
    text: () => 'Tap "Talk to a person" below and I will send this chat to our support team. They reply here on the Help page, and you get a notification if you turn them on.',
    actions: [], handoff: true,
  },
];

/* ---------------- built-in search ---------------- */
const SYN = {
  invoice: 'bill', invoices: 'bill', bills: 'bill', quotation: 'estimate', quote: 'estimate', customer: 'party', customers: 'party', buyer: 'party', client: 'party', grahak: 'party',
  product: 'item', products: 'item', maal: 'item', items: 'item', kaise: 'how', kese: 'how', kaisa: 'how', banaye: 'make', banana: 'make', banau: 'make', banate: 'make', create: 'make', generate: 'make', nikale: 'download', nikalna: 'download',
  bhejna: 'send', bhejo: 'send', bheje: 'send', share: 'send', chhapna: 'print', printout: 'print', dastkhat: 'signature', sign: 'signature', colour: 'color', rang: 'color',
  paisa: 'payment', paise: 'payment', bhugtan: 'payment', naya: 'new', nayi: 'new', purana: 'old', mobile: 'phone', dukan: 'shop', company: 'shop', business: 'shop',
  hatana: 'delete', mitana: 'delete', remove: 'delete', badalna: 'change', badle: 'change', galti: 'mistake', wapas: 'restore', recover: 'restore', dhundo: 'find', dhundna: 'find', dhunde: 'find', search: 'find', lagaye: 'add', lagana: 'add', lagaen: 'add', lagau: 'add', dale: 'add', daale: 'add', dalna: 'add', jode: 'add', jodna: 'add',
  // Hindi (Devanagari)
  'बिल': 'bill', 'इनवॉइस': 'bill', 'चालान': 'bill', 'कैसे': 'how', 'कैसा': 'how', 'बनाएं': 'make', 'बनाये': 'make', 'बनाए': 'make', 'बनाना': 'make', 'बनाऊं': 'make', 'बनता': 'make',
  'लोगो': 'logo', 'सिग्नेचर': 'signature', 'हस्ताक्षर': 'signature', 'पीडीएफ': 'pdf', 'प्रिंट': 'print', 'व्हाट्सएप': 'whatsapp', 'व्हाट्सऐप': 'whatsapp', 'वॉट्सऐप': 'whatsapp',
  'भेजें': 'send', 'भेजना': 'send', 'भेजे': 'send', 'बैकअप': 'backup', 'नया': 'new', 'नई': 'new', 'फोन': 'phone', 'मोबाइल': 'phone', 'जीएसटी': 'gst', 'आईजीएसटी': 'igst',
  'सीजीएसटी': 'cgst', 'रिटर्न': 'return', 'भुगतान': 'payment', 'पेमेंट': 'payment', 'प्लान': 'plan', 'प्रो': 'pro', 'ग्राहक': 'party', 'पार्टी': 'party', 'सामान': 'item',
  'आइटम': 'item', 'प्रोडक्ट': 'item', 'दुकान': 'shop', 'डिज़ाइन': 'design', 'डिजाइन': 'design', 'रंग': 'color', 'नंबर': 'number', 'डिलीट': 'delete', 'हटाएं': 'delete',
  'गलती': 'mistake', 'मीशो': 'meesho', 'लिस्टिंग': 'listing', 'मुनाफा': 'profit', 'प्रॉफिट': 'profit', 'डेटा': 'data', 'गायब': 'gone', 'लॉगिन': 'login', 'पासवर्ड': 'password',
  'अकाउंट': 'account', 'खाता': 'account', 'छूट': 'discount', 'डिस्काउंट': 'discount', 'स्टॉक': 'stock', 'एस्टिमेट': 'estimate', 'कोटेशन': 'estimate', 'यूपीआई': 'upi',
  'बैंक': 'bank', 'डार्क': 'dark', 'इंस्टॉल': 'install', 'डाउनलोड': 'download', 'कीमत': 'price', 'दाम': 'price', 'मुफ्त': 'free', 'फ्री': 'free', 'तारीख': 'date',
  'पुराना': 'old', 'ढूंढें': 'find', 'खोजें': 'find', 'हिंदी': 'hindi', 'भाषा': 'language', 'सुरक्षित': 'safe', 'यूनिट': 'unit', 'छापें': 'print', 'कितना': 'kitna', 'कितने': 'kitna',
  'नहीं': 'nahi', 'नही': 'nahi', 'बन': 'ban', 'खुल': 'khul', 'चल': 'chal', 'दिख': 'dikh',
  'लगाएं': 'add', 'लगाये': 'add', 'लगाए': 'add', 'लगाना': 'add', 'डालें': 'add', 'जोड़ें': 'add', 'जोड़ना': 'add', 'बदलें': 'change', 'बदलना': 'change', 'निकालें': 'download',
};
const STOP = new Set(('a an the to i my me is are am do does can how what where why when which in on of for and or with it this that please pls plz ka ki ke ko se me mein hai hain kya kaise kese kar karna kare karu karo tha thi ho hoga raha rahi want need help about you your pakkabill pakka '
  + 'का की के को से में है हैं क्या करें करना करे कर मेरा मेरी मुझे यह ये वह हो रहा रही था थी और या पर भी').split(' '));
const clean = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[^a-z0-9₹&\-\sऀ-ॿ]/g, ' ').replace(/[।॥]/g, ' ');
function words(s) {
  return clean(s).split(/\s+/).filter(Boolean)
    .map((w) => SYN[w] || w).map((w) => (/^[a-z]/.test(w) && w.length > 4 ? w.replace(/(ing|es|s)$/, '') : w));
}
const keyWords = (s) => words(s).filter((w) => !STOP.has(w));

function indexOf(list) {
  return list.map((a) => ({
    a,
    title: new Set(keyWords(a.title)),
    qs: (a.q || []).map((q) => ({ raw: String(q).toLowerCase(), w: keyWords(q) })),
    qw: new Set((a.q || []).flatMap(keyWords)),
  }));
}
const INDEX = indexOf(ARTICLES);

// Rare words count more than words that appear in many articles (like "bill").
const DF = {};
INDEX.forEach((x) => new Set([...x.title, ...x.qw]).forEach((w) => { DF[w] = (DF[w] || 0) + 1; }));
const idf = (w) => Math.log(1 + INDEX.length / (DF[w] || 1)) / Math.log(1 + INDEX.length);

// Spelling mistakes: a word the guide doesn't know is matched to the closest known word
// ("invoce" -> invoice, "signatur" -> signature, "whatsap" -> whatsapp).
const VOCAB = [...new Set([...Object.keys(DF), ...Object.values(SYN), ...Object.keys(SYN).filter((w) => /^[a-z]+$/.test(w))])].filter((w) => w.length >= 4);
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), prev2 = null;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
function fix(w) {
  if (DF[w] || w.length < 4 || !/^[a-z]+$/.test(w)) return w;
  const max = w.length >= 7 ? 2 : 1;
  let best = w, bestD = max + 1;
  for (const v of VOCAB) {
    if (v[0] !== w[0] && max === 1) continue;
    const d = editDistance(w, v, max);
    if (d < bestD) { best = v; bestD = d; }
  }
  return SYN[best] || best;
}

// Returns the best matching articles with a score (higher is better). `extra` are the
// answers the team added in the admin panel.
function search(query, limit = 4, extra = []) {
  const q = keyWords(query).map(fix);
  const lower = ` ${clean(query).replace(/\s+/g, ' ')} `;
  if (!q.length) return [];
  const idx = extra.length ? INDEX.concat(indexOf(extra)) : INDEX;
  return idx.map((x) => {
    let score = 0;
    const hit = new Set();
    for (const w of q) {
      if (x.title.has(w)) { score += 2 * idf(w); hit.add(w); }
      if (x.qw.has(w)) { score += 1.5 * idf(w); hit.add(w); }
    }
    for (const p of x.qs) {
      const weight = p.w.reduce((n, w) => n + idf(w), 0);
      if (p.raw.length > 3 && lower.includes(` ${p.raw}`)) { score += 2 + 1.5 * weight; p.w.forEach((w) => hit.add(w)); } // the whole phrase
      else if (p.w.length > 1 && p.w.every((w) => q.includes(w))) score += 1.2 * weight;
    }
    // coverage: how much of the question this answer is about (1 = every word)
    return { a: x.a, score: score / Math.max(1, Math.sqrt(q.length) * 0.9), coverage: q.filter((w) => hit.has(w)).length / q.length };
  }).filter((r) => r.score > 0).sort((m, n) => n.score - m.score).slice(0, limit);
}

const byId = (id) => ARTICLES.find((a) => a.id === id);
const TOPICS = { bills: 'Bills', setup: 'Shop and bill setup', gst: 'GST', data: 'Backup and data', meesho: 'Meesho tools', plan: 'Pro plan and account', help: 'Other questions', custom: 'From our team' };
function render(a, ctx) {
  return {
    id: a.id, title: a.title, topic: a.topic,
    related: (a.related || []).map(byId).filter(Boolean).map((x) => x.title),
    text: typeof a.text === 'function' ? a.text(ctx) : a.text,
    actions: typeof a.actions === 'function' ? a.actions(ctx) : a.actions || [],
    handoff: !!a.handoff,
  };
}

// The whole guide as text, for Claude's instructions.
function asText(ctx) {
  return ARTICLES.map((a) => `## ${a.title}\n${render(a, ctx).text}`).join('\n\n');
}

const POPULAR = ['How do I make a bill?', 'Add my logo and signature', 'PDF is not downloading', 'Move PakkaBill to a new phone', 'How do I file GSTR-1?', 'What do I get with Pro?'];

module.exports = { ARTICLES, TOPICS, search, render, asText, POPULAR, keyWords, byId };
