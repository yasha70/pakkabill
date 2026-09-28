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
    text: () => 'Your bills are saved on this device only. To keep them safe or move them:\n1. On the Shop page, under "Offline and backup", tap "Download backup". A PakkaBill-backup file is saved.\n2. Send the file to the other device (WhatsApp to yourself, email or Drive).\n3. On the new device open PakkaBill → Shop → "Restore from backup" and pick the file.\n\nYour Pro plan follows your account: log in on the Plan page with the same mobile number. Take a backup every week.',
    actions: ['shop'],
  },
  {
    id: 'lost', related: ['backup', 'install', 'support'], topic: 'data', title: 'My bills disappeared',
    q: ['bills gone', 'data lost', 'bills missing', 'data delete', 'sab gayab', 'bill nahi dikh raha', 'everything gone', 'data chala gaya'],
    text: () => 'PakkaBill keeps bills inside this browser on this device. They disappear if the browser\'s data or storage was cleared, or when you open PakkaBill in a different browser or on another phone.\n\nTo get them back: if you have a backup file, open Shop → "Restore from backup". If PakkaBill still has them in another browser or on the installed app, open it there, tap "Download backup" on the Shop page and restore it here. We do not keep a copy of bills on our server.',
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
    q: ['pro', 'premium', 'price', 'plan', 'subscription', 'kitne ka hai', 'kitne ka', 'kitna', 'how much', 'charges', 'fees', 'cost of pro', 'paid plan', 'upgrade', 'free plan', 'benefits', 'kya milta hai', 'monthly price', 'yearly price'],
    text: (ctx) => `PakkaBill Pro gives unlimited bills every month; Royal, Elegant and Boutique designs; your logo and signature; PDF download, share and WhatsApp; and GSTR-1 JSON from marketplace reports. It costs ₹${ctx.prices.monthly} a month or ₹${ctx.prices.yearly} a year. The free plan has ${ctx.freeBills} bills a month (estimates don't count), the other five designs and printing.\n\nTo buy: open the Plan page, log in or create an account, choose a plan, pay the UPI QR and enter the 12-digit UTR. We switch Pro on after checking it, usually within a few hours.`,
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
    text: () => 'Open the Plan page and choose "Create account" (Mobile number, Shop name, Password) or "Log in". Your account lets Pro work on every phone and laptop you log in on. Bills stay on each device; move them with a backup from the Shop page. Forgot your password? Ask here and our team will help you reset it.',
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
  hatana: 'delete', mitana: 'delete', remove: 'delete', badalna: 'change', badle: 'change', galti: 'mistake', wapas: 'restore', recover: 'restore',
};
const STOP = new Set('a an the to i my me is are am do does can how what where why when which in on of for and or with it this that please pls plz ka ki ke ko se me mein hai hain kya kaise kese kar karna kare karu karo tha thi ho hoga raha rahi want need help about you your'.split(' '));
function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9₹&\-\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => SYN[w] || w).map((w) => (w.length > 4 ? w.replace(/(ing|es|s)$/, '') : w));
}
const keyWords = (s) => words(s).filter((w) => !STOP.has(w));
const INDEX = ARTICLES.map((a) => ({
  a,
  title: new Set(keyWords(a.title)),
  qs: a.q.map((q) => ({ raw: q.toLowerCase(), w: keyWords(q) })),
  qw: new Set(a.q.flatMap(keyWords)),
}));

// Rare words count more than words that appear in many articles (like "bill").
const DF = {};
INDEX.forEach((x) => new Set([...x.title, ...x.qw]).forEach((w) => { DF[w] = (DF[w] || 0) + 1; }));
const idf = (w) => Math.log(1 + INDEX.length / (DF[w] || 1)) / Math.log(1 + INDEX.length);

// Returns the best matching articles with a score (higher is better).
function search(query, limit = 4) {
  const q = keyWords(query);
  const lower = ` ${String(query || '').toLowerCase()} `;
  if (!q.length) return [];
  return INDEX.map((x) => {
    let score = 0;
    for (const w of q) {
      if (x.title.has(w)) score += 2 * idf(w);
      if (x.qw.has(w)) score += 1.5 * idf(w);
    }
    for (const p of x.qs) {
      const weight = p.w.reduce((n, w) => n + idf(w), 0);
      if (p.raw.length > 3 && lower.includes(` ${p.raw}`)) score += 2 + 1.5 * weight; // the whole phrase
      else if (p.w.length > 1 && p.w.every((w) => q.includes(w))) score += 1.2 * weight;
    }
    return { a: x.a, score: score / Math.max(1, Math.sqrt(q.length) * 0.9) };
  }).filter((r) => r.score > 0).sort((m, n) => n.score - m.score).slice(0, limit);
}

const byId = (id) => ARTICLES.find((a) => a.id === id);
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

module.exports = { ARTICLES, search, render, asText, POPULAR, keyWords };
