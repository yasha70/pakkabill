// PakkaBill assistant: investigates a support ticket the moment it is raised (and each time the
// customer writes again) and answers it straight away when it can.
//
// It looks at real data: the customer's account and Pro plan, their payments, any UPI
// transaction number (UTR) in the message, whether the app on their phone is out of date, and
// which known problem the message describes. The reply comes with one-tap fixes (update the app,
// refresh the plan, open the right page). When ANTHROPIC_API_KEY is set in Vercel, Claude writes
// the reply from the same findings (and can read the screenshot); otherwise, or if Claude is
// unavailable, the built-in answers below are used.
//
// It never approves payments, refunds, or changes an account or password. Anything it cannot
// settle is handed to the support team with its findings.
const db = require('./db');
const core = require('./core');
const orders = require('./orders');

const MODEL = process.env.PB_AI_MODEL || 'claude-opus-5';
const AI_PER_DAY = Math.max(0, Number(process.env.PB_AI_PER_DAY || 300));
const MAX_BOT_REPLIES = 3;
const SETTINGS_KEY = 'assist:settings';

// One-tap fixes the app knows how to run. Labels live in the app (support.js).
const ACTIONS = ['update', 'refresh_plan', 'plan', 'login', 'shop', 'reports', 'new_bill', 'items', 'parties', 'listing', 'lens', 'pnl'];
const OUTCOMES = ['answered', 'escalate', 'ack'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const RANK = { low: 0, normal: 1, high: 2, urgent: 3 };

// Problems a customer can pick on the Help page, and the known answer each one leads to
// ('payment' = the payment check, '' = no ready answer: straight to the team).
const PROBLEM_KB = {
  pdf: 'pdf', print: 'print', limit: 'limit', design: 'design', logo: 'logo', lost: 'lost',
  paid_not_active: 'payment', utr_error: 'payment', renew: 'payment', refund: 'payment',
  tax_wrong: 'gst', hsn: 'gst', gstr1: 'gstr1',
  listing: 'listing', pnl: 'pnl', lens: 'lens',
  blank: 'blank', slow: 'blank', button: '', error: '',
  login: 'login', forgot: 'login', newphone: 'backup', install: 'install',
};

async function getSettings() {
  const s = (db.configured() && (await db.getJSON(SETTINGS_KEY))) || {};
  return {
    auto: s.auto !== false, // answer new tickets automatically
    ai: s.ai !== false, // let Claude write the answer when a key is set
    aiReady: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
    whatsapp: s.whatsapp || '', // optional support WhatsApp number shown on the Help page
  };
}
async function saveSettings({ auto, ai, whatsapp }) {
  const prev = (await db.getJSON(SETTINGS_KEY)) || {};
  const s = { ...prev, auto: !!auto, ai: !!ai };
  if (whatsapp !== undefined) {
    const w = String(whatsapp || '').trim() ? core.normPhone(whatsapp) : '';
    if (String(whatsapp || '').trim() && !w) throw new core.HttpError(400, 'Enter a 10-digit WhatsApp number, or leave it empty.');
    s.whatsapp = w;
  }
  await db.setJSON(SETTINGS_KEY, s);
  return getSettings();
}

// How long the team takes to send its first reply (the last 30 tickets), shown on the Help page
// so customers know what to expect.
const REPLY_TIMES = 'support:replytimes';
async function recordReplyTime(ms) {
  if (!(ms > 0)) return;
  const list = (await db.getJSON(REPLY_TIMES)) || [];
  list.push(Math.round(ms / 60000));
  await db.setJSON(REPLY_TIMES, list.slice(-30));
}
async function teamReplyMinutes() {
  const list = ((await db.getJSON(REPLY_TIMES)) || []).slice().sort((a, b) => a - b);
  return list.length >= 3 ? list[Math.floor(list.length / 2)] : null;
}
function replyText(min) {
  if (min == null) return 'usually within a few hours';
  if (min < 45) return 'usually within an hour';
  if (min < 24 * 60) return `usually within about ${Math.max(1, Math.round(min / 60))} hour${Math.round(min / 60) > 1 ? 's' : ''}`;
  return 'usually within a day';
}

// Counts how often each quick fix is shown on the Help page and how often it solved the problem.
const QF_KEY = 'assist:quickfix';
async function quickFixStat(problem, field) {
  if (!PROBLEM_KB.hasOwnProperty(problem) && problem !== 'other') return;
  const all = (await db.getJSON(QF_KEY)) || {};
  const row = all[problem] || { shown: 0, solved: 0, help: 0 };
  row[field] = (row[field] || 0) + 1;
  all[problem] = row;
  await db.setJSON(QF_KEY, all);
}
const quickFixStats = async () => (await db.getJSON(QF_KEY)) || {};

/* ---------------- small helpers ---------------- */
const IST = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' };
const dateStr = (t) => new Date(t).toLocaleDateString('en-IN', IST);
const rupees = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const tail = (utr) => 'ending ' + String(utr).slice(-4);
const planName = (p) => (p === 'yearly' ? 'yearly' : 'monthly');
function since(t) {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
const ver = (s) => {
  const m = /v(\d+)/i.exec(String(s || ''));
  return m ? Number(m[1]) : 0;
};
const maxPrio = (a, b) => (RANK[b] > RANK[a] ? b : a);

// 12-digit UPI transaction numbers, also when typed as 4-4-4 or 6-6 groups.
function findUtrs(text) {
  const s = String(text || '');
  const out = new Set();
  for (const m of s.matchAll(/(?<!\d)(\d{4}[ -]\d{4}[ -]\d{4}|\d{6}[ -]\d{6}|\d{12})(?!\d)/g)) out.add(m[1].replace(/\D/g, ''));
  return [...out];
}

const UTR_HELP = 'You can find the UTR in your payment app: PhonePe shows it as "UTR", Google Pay as "UPI transaction ID" and Paytm as "UPI Ref No."';

/* ---------------- investigation ---------------- */
// Collects what can be checked about this ticket. `findings` is a readable list for the admin.
async function investigate(t) {
  const now = Date.now();
  const d = t.diag || {};
  const f = { account: !!t.account, findings: [], orders: [], utrs: [] };
  const note = (s) => f.findings.push(s);
  const settings = await core.getSettings();
  f.freeBills = Number(settings.freeBills);
  f.paymentsOn = core.paymentsReady(settings);
  f.locked = f.paymentsOn && !!settings.enforce;
  f.prices = { monthly: settings.monthly, yearly: settings.yearly };

  if (ver(d.app) && ver(d.latest)) {
    f.app = { version: d.app, latest: d.latest, outdated: ver(d.app) < ver(d.latest) };
    note(f.app.outdated ? `⚠ App on this phone is ${d.app}; the latest is ${d.latest}.` : `✓ App is up to date (${d.app}).`);
  } else if (d.app) note(`ℹ App version ${d.app} (latest unknown).`);
  if (d.online === 'false') note('⚠ The phone was offline when the ticket was sent.');
  f.appPlan = d.plan || '';

  let user = null;
  if (t.account) {
    user = await core.getUser(t.phone);
    if (!user) note('⚠ The account for this ticket no longer exists.');
  } else if (t.phone) {
    const other = await core.getUser(t.phone);
    // Guests typed this number themselves, so what we know about it is for the admin only.
    note(other
      ? `ℹ Not logged in. ${t.phone} has an account: ${other.paidUntil > now ? `Pro until ${dateStr(other.paidUntil)}` : 'free plan'}.`
      : `ℹ Not logged in, and no account uses ${t.phone}.`);
  } else {
    note('ℹ Not logged in.');
  }
  if (user) {
    f.plan = { pro: (user.paidUntil || 0) > now, paidUntil: user.paidUntil || 0, lastPlan: user.lastPlan || '' };
    f.orders = (await orders.mine(user.phone)).map((o) => ({
      id: o.id, plan: o.plan, amount: o.amount, utr: o.utr, state: o.state, createdAt: o.createdAt, paidAt: o.paidAt || 0, rejectedAt: o.rejectedAt || 0,
    }));
    note(f.plan.pro
      ? `✓ Pro is active until ${dateStr(f.plan.paidUntil)}${f.plan.lastPlan ? ` (${f.plan.lastPlan})` : ''}.`
      : f.plan.paidUntil ? `ℹ Pro ended on ${dateStr(f.plan.paidUntil)}; on the free plan now.` : 'ℹ Free plan, never had Pro.');
    if (f.plan.pro && f.appPlan === 'free') note('⚠ The app showed the free plan although the account is Pro: the app needs to refresh the plan.');
    if (!f.orders.length) note('ℹ No payments submitted from this account.');
    f.orders.forEach((o) => note(`${o.state === 'PENDING' ? '⏳' : o.state === 'COMPLETED' ? '✓' : '✗'} Payment ${rupees(o.amount)} ${planName(o.plan)}, UTR ${o.utr}, ${o.state.toLowerCase()}, sent ${since(o.createdAt)}.`));
  }

  const said = t.messages.filter((m) => m.by === 'customer').map((m) => m.text).join('\n');
  for (const utr of findUtrs(`${t.subject}\n${said}`).slice(0, 3)) {
    let o = f.orders.find((x) => x.utr === utr);
    if (!o) {
      const id = await db.cmd(['GET', `utr:${utr}`]);
      const found = id ? await orders.getOrder(id) : null;
      if (found) o = { ...found, other: found.phone !== t.phone };
    }
    const e = o
      ? { utr, found: true, mine: !o.other, state: o.state, amount: o.amount, plan: o.plan, createdAt: o.createdAt }
      : { utr, found: false };
    f.utrs.push(e);
    note(o ? `🔎 UTR ${utr} matches a ${o.state.toLowerCase()} payment of ${rupees(o.amount)}${o.other ? ` from a different number (${o.phone})` : ''}.` : `🔎 UTR ${utr} has not been submitted in PakkaBill.`);
  }
  return f;
}

/* ---------------- built-in answers ---------------- */
const RE = {
  pay: /\b(pay|paid|payment|utr|upi|pro|premium|plan|subscri|renew|refund|money|debit|deduct|amount|rs\.?|₹|rupees?|paise|recharge|transaction|txn|bhugtan|paisa|paise|kat gaya|kat gye)/i,
  refund: /refund|money back|paisa wapas|paise wapas|return (my|the) money|cancel (my )?(plan|subscription)/i,
  debited: /debit|deduct|kat gay|kat gye|kat liya|money (has )?(gone|went)|paid but|payment (done|successful|success)/i,
  notPro: /not (active|activated|showing|working|unlock)|still (free|locked|showing)|locked|didn'?t (get|activate)|no pro|pro nahi|activate nahi|active nahi/i,
};

// Known problems. `re` is matched against the subject and the customer's latest message.
const KB = [
  {
    id: 'pdf', cats: ['bills', 'bug'],
    re: /pdf|download|share|sharing|whatsapp/i,
    text: (f) => (f.locked && f.plan && !f.plan.pro) || (f.locked && !f.account && /asks me to upgrade/i.test(f.said))
      ? 'Downloading bills as PDF and sharing them on WhatsApp are part of PakkaBill Pro. On the free plan you can still make bills and print them. Tap "Open Plan page" to see the Pro plans.'
      : f.plan && f.plan.pro && /asks me to upgrade/i.test(f.said)
      ? `Your Pro plan is active until ${dateStr(f.plan.paidUntil)}, so PDF should work. The app on this phone has not caught up yet: tap "Refresh my plan" below and try the PDF again.`
      : 'To download a bill: open the bill and tap "PDF". If nothing happens:\n1. Tap "Update PakkaBill now" below so you have the latest version.\n2. Open PakkaBill in Chrome (not inside another app\'s browser), and allow downloads if Chrome asks.\n3. Look in your phone\'s Downloads folder or the Files app.\n\nIf it still fails, reply with a screenshot of the screen.',
    actions: (f) => ((f.locked && f.plan && !f.plan.pro) || (f.locked && !f.account && /asks me to upgrade/i.test(f.said)) ? ['plan'] : f.plan && f.plan.pro && /asks me to upgrade/i.test(f.said) ? ['refresh_plan'] : ['update']), outcome: 'answered',
  },
  {
    id: 'print', cats: ['bills'],
    re: /print|printer|thermal|a4|a5|page size|cut off|cutting/i,
    text: (f) => /thermal/i.test(f.said)
      ? 'For a small thermal printer:\n1. Change the bill to the Plain design (Design picker when you make or edit the bill); it is made for narrow paper.\n2. Tap "Print", choose your printer, and set the paper size to your roll width (58 mm or 80 mm) with margins "None".\n3. If the printer app only accepts PDFs, tap "PDF" first and print the file from the printer app.\n\nIf it still cuts off, reply with a photo of the printout and your printer model.'
      : /save as pdf/i.test(f.said)
      ? 'To save a bill as a PDF, open the bill and tap "PDF": it keeps the exact layout. The browser\'s "Save as PDF" in the print screen can shrink or cut the page; if you use it, set paper size to A4, margins "Default", scale 100% and turn on "Background graphics".'
      : 'To print: open the bill and tap "Print". In the print screen choose your printer, set paper size to A4 (or A5 if your paper is half size), margins "Default", scale 100%, and turn on "Background graphics" so colours and the logo print.\n\nIf part of the bill is cut off, reply with a photo of the printout and your printer model.',
    actions: [], outcome: 'answered',
  },
  {
    id: 'limit', cats: ['bills', 'bug', 'payment'],
    re: /limit|free bills?|(can'?t|cannot|unable to|not able to) (make|create|add|save)|(new|next) bill (not|nahi)|bill nahi ban|upgrade (popup|message)|asks? (me )?to upgrade/i,
    text: (f) => (f.plan && f.plan.pro) || !f.locked
      ? 'You can make as many bills as you like on your plan. If the app still asks you to upgrade, tap "Refresh my plan" below and try again.'
      : `The free plan includes ${f.freeBills} bills every month (estimates don't count), and the count starts again on the 1st of each month. For unlimited bills, PDF and WhatsApp sharing, take PakkaBill Pro: ₹${f.prices.monthly} a month or ₹${f.prices.yearly} a year.`,
    actions: (f) => ((f.plan && f.plan.pro) || !f.locked ? ['refresh_plan'] : ['plan']), outcome: 'answered',
  },
  {
    id: 'design', cats: ['bills'],
    re: /design|template|royal|elegant|boutique|colou?r|look(s)? of (the )?bill|format/i,
    text: (f) => `You can change the bill design from the Design picker when you make or edit a bill. Carbon, Modern, Classic, Ledger and Plain are free${f.locked ? '; Royal, Elegant and Boutique are part of PakkaBill Pro' : ', and so are Royal, Elegant and Boutique right now'}. You can also pick your brand colour on the Shop page.`,
    actions: ['shop'], outcome: 'answered',
  },
  {
    id: 'logo', cats: ['bills'],
    re: /logo|signature|stamp|sign\b/i,
    text: (f) => `Add your logo and signature on the Shop page; they then appear on every bill.${f.locked && f.plan && !f.plan.pro ? ' Logo and signature on bills are part of PakkaBill Pro.' : ''} Use a clear PNG or JPG picture; a logo on a white or transparent background looks best.`,
    actions: (f) => (f.locked && f.plan && !f.plan.pro ? ['shop', 'plan'] : ['shop']), outcome: 'answered',
  },
  {
    id: 'lost', cats: ['bug', 'bills', 'other'],
    re: /(bills?|data|invoices?|items?|parties|customers?|everything|sab).{0,30}(gone|lost|missing|delet|disappear|vanish|gayab|chala gaya|udd? gay|nahi dikh)|lost (my|all)|data (gone|lost)/i,
    text: () => 'PakkaBill keeps your bills on this phone, inside the browser, so they are private to you. They can disappear if the browser\'s data or storage was cleared, if you opened PakkaBill in a different browser, or on a new phone.\n\nIf you saved a backup file: open the Shop page and tap "Restore from backup". If you used PakkaBill in another browser (for example Chrome vs the installed app), open it there, save a backup from the Shop page, and restore it here.\n\nWe do not keep a copy of bills on our server, so please save a backup from the Shop page every week.',
    actions: ['shop'], outcome: 'escalate', priority: 'high',
  },
  {
    id: 'backup', cats: ['bills', 'account', 'other'],
    re: /backup|back up|restore|new (phone|mobile)|another (phone|mobile|device)|change (phone|mobile)|transfer|laptop|computer|pc\b|sync/i,
    text: () => 'To move PakkaBill to another phone or computer:\n1. On the old device, open the Shop page and tap "Save backup". A PakkaBill-backup file is saved.\n2. Send that file to the new device (WhatsApp to yourself, email or Drive).\n3. On the new device, open PakkaBill, go to the Shop page and tap "Restore from backup", then pick the file.\n\nYour Pro plan follows your account: just log in on the Plan page with the same mobile number.',
    actions: ['shop'], outcome: 'answered',
  },
  {
    id: 'gst', cats: ['gst', 'bills'],
    re: /igst|cgst|sgst|utgst|place of supply|inter.?state|intra.?state|other state|tax (is )?(wrong|galat)|gst (is )?(wrong|galat|not)|wrong (gst|tax)|gst rate|hsn/i,
    text: () => 'PakkaBill picks the tax from the two states on the bill: when the buyer\'s state is the same as your shop\'s state it charges CGST + SGST (half each), and when it is a different state it charges IGST.\n\nSo please check: 1) your state and GSTIN on the Shop page, 2) the buyer\'s state or GSTIN on the Parties page, 3) the GST rate and HSN code of the item on the Items page. Edit the bill after fixing them and the tax updates.',
    actions: ['shop', 'parties', 'items'], outcome: 'answered',
  },
  {
    id: 'gstr1', cats: ['gst'],
    re: /gstr|gstr-?1|json|return|filing|file (my )?gst|b2b|b2cs?|summary|report|amazon|mtr/i,
    text: (f) => `Open "GST summary", choose the month, and you get the B2B, B2C and HSN tables from your bills.${f.locked && f.plan && !f.plan.pro ? ' The GSTR-1 JSON file for the GST portal is part of PakkaBill Pro.' : ' Tap the GSTR-1 JSON button to download the file and upload it on the GST portal (Returns → GSTR-1 → Prepare offline → Upload).'} Cancelled bills and estimates are left out automatically. For Amazon or Meesho sales, add the marketplace report on the same page.`,
    actions: (f) => (f.locked && f.plan && !f.plan.pro ? ['reports', 'plan'] : ['reports']), outcome: 'answered',
  },
  {
    id: 'listing', cats: ['meesho'],
    re: /listing|catalog|catalogue|template|bulk|upload|size chart|attribute/i,
    text: () => 'In "Meesho listing", first download the category\'s bulk upload template from your Meesho supplier panel (Catalog Uploads → Bulk upload → Download template), then add it in PakkaBill. Pick a preset or fill the product details once, and PakkaBill fills every row, size and colour for you. Download the filled file and upload it back on Meesho.\n\nIf Meesho rejects the file, reply with a screenshot of the error and the category name.',
    actions: ['listing'], outcome: 'answered',
  },
  {
    id: 'pnl', cats: ['meesho'],
    re: /p ?& ?l|pnl|profit|loss|payout|payment file|settlement|return|rto|claim|combo|pack of|pieces|sku|cost/i,
    text: () => 'In "Meesho P&L", upload the payments file from your Meesho supplier panel (Payments → Download the payments report for the dates you want) and your orders file. Add the cost price of each SKU on the Costs tab; for combos, the pack size is read from the SKU (for example RGWM(GREY)05 is a pack of 5) and you can change it there.\n\nIf a number looks wrong, reply with a screenshot and the SKU or order number.',
    actions: ['pnl'], outcome: 'answered',
  },
  {
    id: 'lens', cats: ['meesho'],
    re: /lens|competitor|rival|price check|other sellers?|insight/i,
    text: () => 'Meesho Lens compares a product with other sellers. Open "Meesho Lens", paste the Meesho product link or search words, and it shows prices, ratings and what the top listings do differently. It needs internet, and Meesho sometimes limits how often it can be checked; if it shows no results, wait a few minutes and try again.',
    actions: ['lens'], outcome: 'answered',
  },
  {
    id: 'login', cats: ['account'],
    re: /log ?in|sign ?in|password|otp|logged out|log out|can'?t (open|access) (my )?account|number change|mobile change/i,
    text: (f) => /forgot|reset|password (bhool|galat|wrong)|wrong password/i.test(f.said)
      ? 'We can reset your password for you. Our support team will check that this account is yours and reply here with the next step. For your safety we never ask for your OTP or bank details.'
      : 'To log in, open the Plan page and enter your mobile number and password. If it says "Mobile number or password is wrong", check the number has 10 digits with no +91, and try the password again carefully. If you have forgotten the password, reply here and our team will help you reset it.',
    actions: ['login'], outcome: (f) => (/forgot|reset|password (bhool|galat|wrong)|wrong password|bhool gay/i.test(f.said) ? 'escalate' : 'answered'),
  },
  {
    id: 'install', cats: ['other', 'bug', 'account'],
    re: /install|home screen|play ?store|apk|app download|download (the )?app|icon/i,
    text: () => 'PakkaBill works as an app without the Play Store. In Chrome, open PakkaBill, tap the ⋮ menu and choose "Install app" (or "Add to Home screen"). On iPhone, open it in Safari, tap Share, then "Add to Home Screen". It then opens from its own icon and works offline too.',
    actions: [], outcome: 'answered',
  },
  {
    id: 'blank', cats: ['bug', 'other'],
    re: /(blank|white|black|empty) (screen|page)|not (open|load|start|work)|won'?t (open|load|start)|(does|is)n'?t (open|load|work)|crash|stuck|hang|freez|keeps? loading|loading (only|forever)|khul(ta|ti|na)? nahi|nahi khul|band ho|chal nahi|kaam nahi|error aa|not responding|slow/i,
    text: () => 'This usually happens when the phone is still running an older copy of PakkaBill. Tap "Update PakkaBill now" below: it downloads the latest version and restarts the app. Your bills and settings stay safe on this phone.\n\nIf it still happens after that, reply here with a screenshot and tell us which page you were on.',
    actions: ['update'], outcome: 'answered',
  },
];

function pick(t, f) {
  const lastCustomer = [...t.messages].reverse().find((m) => m.by === 'customer');
  const latest = (lastCustomer && lastCustomer.text) || '';
  const hay = `${t.subject}\n${latest}`;
  let best = null;
  let bestScore = 0;
  for (const k of KB) {
    const hits = (hay.match(new RegExp(k.re.source, 'gi')) || []).length;
    if (!hits) continue;
    const score = hits + (k.cats.includes(t.category) ? 1 : 0);
    if (score > bestScore) { best = k; bestScore = score; }
  }
  return best;
}
const val = (v, f) => (typeof v === 'function' ? v(f) : v);

function paymentAnswer(t, f, said) {
  const out = { lines: [], actions: [], outcome: 'answered', priority: 'normal', hard: false, kb: 'payment' };
  const utrText = f.utrs.length ? '' : `\n\n${UTR_HELP}`;
  if (RE.refund.test(said)) {
    out.lines.push('We have noted your refund request. Someone from our team will check your payment and reply here personally, usually within a day.');
    return { ...out, outcome: 'escalate', priority: 'high', hard: true };
  }
  if (!t.account && !t.phone) {
    out.lines.push('To check a payment we need to know which PakkaBill account it is for. Please log in on the Plan page with the mobile number you use in PakkaBill, then come back here and we can check it straight away.',
      `If you are not able to log in, raise a ticket below with the 12-digit UTR and our team will look it up.${utrText}`);
    out.actions.push('login');
    return out;
  }
  const u = f.utrs[0];
  if (u) {
    if (!u.found) {
      out.lines.push(`We could not find a payment with UTR ${u.utr} in PakkaBill yet. A payment reaches us only after its UTR is submitted on the Plan page.`,
        `Open the Plan page${t.account ? '' : ' (log in first with your mobile number)'}, choose your plan and enter this 12-digit UTR. We check it with our bank and switch on Pro, usually within a few hours.`);
      out.actions.push(t.account ? 'plan' : 'login');
      if (RE.debited.test(said)) out.lines.push('If you already submitted it and money was debited, reply with a screenshot of the payment and we will check it by hand.');
      return out;
    }
    if (!u.mine) {
      out.lines.push('This UTR has been submitted from a different PakkaBill account, so we need to check it by hand. Our team will look into it and reply here. For your safety we never ask for your OTP, PIN or bank password.');
      return { ...out, outcome: 'escalate', priority: 'urgent', hard: true };
    }
    if (u.state === 'COMPLETED') {
      out.lines.push(`Good news: your payment of ${rupees(u.amount)} (UTR ${tail(u.utr)}) is approved.${f.plan && f.plan.pro ? ` PakkaBill Pro is active until ${dateStr(f.plan.paidUntil)}.` : ''}`,
        'If the app still shows the free plan, tap "Refresh my plan" below.');
      out.actions.push(t.account ? 'refresh_plan' : 'login');
      if (!t.account) out.lines.push('Log in on the Plan page with the mobile number you paid from to use Pro on this phone.');
      return out;
    }
    if (u.state === 'PENDING') {
      const old = Date.now() - u.createdAt > 24 * 3600e3;
      out.lines.push(`We have your payment of ${rupees(u.amount)} for the ${planName(u.plan)} plan (UTR ${tail(u.utr)}), sent ${since(u.createdAt)}. It is waiting for our check against the bank statement${old ? ', which is taking longer than usual. We have marked it urgent' : ', which usually takes a few hours'}.`,
        'You will get a message here as soon as Pro is switched on. You do not need to pay again.');
      return { ...out, outcome: 'escalate', priority: old ? 'urgent' : 'high', hard: true };
    }
    if (u.state === 'REJECTED') {
      out.lines.push(`The payment with UTR ${tail(u.utr)} was not approved because we could not find it in our bank statement. This usually means a digit of the UTR was mistyped.`,
        `Please check the 12-digit UTR in your payment app and submit it again on the Plan page. If money was debited, reply here with a screenshot of the payment.\n\n${UTR_HELP}`);
      out.actions.push('plan');
      return out;
    }
  }
  if (!t.account) {
    out.lines.push('To check a payment we need to know which PakkaBill account it is for. Please log in on the Plan page with the mobile number you use in PakkaBill, then open this ticket again.',
      `You can also reply here with the 12-digit UTR from your payment app and we will look it up.${utrText}`);
    out.actions.push('login');
    return out;
  }
  if (!f.plan) {
    out.lines.push('We could not find your PakkaBill account. Our team will check and reply here.');
    return { ...out, outcome: 'escalate', priority: 'high', hard: true };
  }
  const pending = f.orders.filter((o) => o.state === 'PENDING');
  if (pending.length) {
    const o = pending[0];
    const old = Date.now() - o.createdAt > 24 * 3600e3;
    out.lines.push(`We have your payment of ${rupees(o.amount)} for the ${planName(o.plan)} plan (UTR ${tail(o.utr)}), sent ${since(o.createdAt)}. It is waiting for our check against the bank statement${old ? ', which is taking longer than usual. We have marked it urgent' : ', which usually takes a few hours'}.`,
      'You will get a message here as soon as Pro is switched on. You do not need to pay again.');
    return { ...out, outcome: 'escalate', priority: old ? 'urgent' : 'high', hard: true };
  }
  if (f.plan.pro) {
    out.lines.push(`Your PakkaBill Pro is active until ${dateStr(f.plan.paidUntil)}${f.plan.lastPlan ? ` (${f.plan.lastPlan} plan)` : ''}.`);
    out.lines.push(f.appPlan === 'free'
      ? 'The app on this phone had not caught up yet. Tap "Refresh my plan" below and Pro switches on straight away.'
      : 'If anything still looks locked, tap "Refresh my plan" below. If you use PakkaBill on another phone, log in there with the same mobile number.');
    out.actions.push('refresh_plan');
    return out;
  }
  const rejected = f.orders.find((o) => o.state === 'REJECTED' && Date.now() - (o.rejectedAt || o.createdAt) < 30 * 86400e3);
  if (rejected) {
    out.lines.push(`Your payment with UTR ${tail(rejected.utr)} was not approved because we could not find it in our bank statement. This usually means a digit of the UTR was mistyped.`,
      `Please check the 12-digit UTR in your payment app and submit it again on the Plan page. If money was debited, reply here with a screenshot of the payment.\n\n${UTR_HELP}`);
    out.actions.push('plan');
    return out;
  }
  if (f.plan.paidUntil) {
    out.lines.push(`Your Pro plan ended on ${dateStr(f.plan.paidUntil)}, so the app is on the free plan now. You can renew in a minute from the Plan page: ₹${f.prices.monthly} a month or ₹${f.prices.yearly} a year.`);
    out.actions.push('plan');
    return out;
  }
  out.lines.push(`We don't see a payment from this account (${t.phone}) yet. If you have paid, open the Plan page, choose the plan and enter the 12-digit UTR from your payment app; we then switch on Pro, usually within a few hours.`,
    `If you paid while logged in with a different number, log in with that number instead.${utrText}`);
  out.actions.push('plan');
  if (RE.debited.test(said)) {
    out.lines.push('If money was debited and the Plan page does not accept the UTR, reply here with a screenshot of the payment and we will check it by hand.');
  }
  return out;
}

// The built-in answer: always available, and the safety floor for the AI answer.
function rulesAnswer(t, f) {
  const said = t.messages.filter((m) => m.by === 'customer').map((m) => m.text).join('\n');
  const lastCustomer = [...t.messages].reverse().find((m) => m.by === 'customer');
  const latest = `${t.subject}\n${(lastCustomer && lastCustomer.text) || ''}`;
  f.said = said;
  let a;
  // The problem the customer picked on the Help page decides the answer; otherwise read the words.
  const pk = t.problem && PROBLEM_KB.hasOwnProperty(t.problem) ? PROBLEM_KB[t.problem] : null;
  const aboutPay = pk === 'payment' || (pk === null && (t.category === 'payment' || f.utrs.length > 0 || RE.debited.test(latest) || RE.refund.test(latest)
    || /\b(utr|paid|payment|pay kiya|paise diye|purchased?|bought|subscription|renew)\b/i.test(latest)
    || (/\b(pro|premium)\b/i.test(latest) && RE.notPro.test(latest))));
  if (aboutPay) {
    a = paymentAnswer(t, f, said);
  } else if (t.category === 'idea') {
    a = { lines: ['Thank you for the suggestion! We read every idea, and the popular ones go into the next updates of PakkaBill. We will reply here if we have a question.'], actions: [], outcome: 'ack', priority: 'low', kb: 'idea' };
  } else {
    const k = pk ? KB.find((x) => x.id === pk) : pk === '' ? null : pick(t, f);
    if (k) a = { lines: [val(k.text, f)], actions: [...val(k.actions, f)], outcome: val(k.outcome, f), priority: k.priority || 'normal', kb: k.id };
  }
  if (f.app && f.app.outdated && (!a || a.kb !== 'payment')) {
    const line = `Your PakkaBill app is an older version (${f.app.version}; the latest is ${f.app.latest}). Tap "Update PakkaBill now" below: it takes a few seconds and your bills stay safe.`;
    if (!a) a = { lines: [line, 'If the problem is still there after the update, reply here and our team will look into it.'], actions: ['update'], outcome: 'answered', priority: 'normal', kb: 'update' };
    else if (a.kb !== 'blank') { a.lines.unshift(line); a.actions.unshift('update'); }
  }
  if (!a) {
    a = { lines: [`Thank you for the details. I have passed this to our support team with your app details, and they will reply here, ${f.teamText || 'usually within a few hours'}. If you have a screenshot, please add it; it helps us fix it faster.`], actions: [], outcome: 'escalate', priority: 'normal', kb: '' };
  }
  if (f.findings.some((x) => x.startsWith('⚠ The phone was offline')) && a.kb !== 'payment') {
    a.lines.push('Your phone seemed to be offline when you wrote. Logging in, payments and the Meesho tools need internet.');
  }
  return {
    text: a.lines.join('\n\n'),
    actions: [...new Set(a.actions)].filter((x) => ACTIONS.includes(x)).slice(0, 3),
    outcome: a.outcome,
    priority: a.priority || 'normal',
    hard: !!a.hard,
    kb: a.kb,
    source: 'rules',
  };
}

/* ---------------- Claude ---------------- */
const SYSTEM = `You are the PakkaBill support assistant. PakkaBill is a GST billing app (a web app that installs on the phone) for small Indian sellers and Meesho/Amazon sellers. You answer support tickets inside the app, right after the customer writes.

What PakkaBill does:
- Bills: GST invoices, estimates, credit notes. Tax is CGST+SGST when the buyer's state equals the shop's state, IGST otherwise. Items page holds products with HSN and GST rate; Parties page holds customers with state/GSTIN; Shop page holds shop details, logo, signature, brand colour, and "Save backup" / "Restore from backup".
- Bills are stored only on the customer's device (in the browser). PakkaBill has no server copy of bills. Lost data can only come back from a backup file or from another browser/device where it still exists.
- Designs: Carbon, Modern, Classic, Ledger and Plain are free; Royal, Elegant and Boutique are Pro (when Pro is enforced).
- Free plan: a monthly number of bills (given in the findings), estimates don't count, resets on the 1st. Pro adds unlimited bills, PDF download, WhatsApp sharing, logo and signature, GSTR-1 JSON export, Pro designs.
- Pro payment: the customer pays the shop's UPI QR on the Plan page and submits the 12-digit UTR. A person checks the UTR against the bank statement and approves it, usually within a few hours. Nobody can approve a payment automatically.
- GST summary page: monthly B2B/B2C/HSN tables and GSTR-1 JSON (Pro).
- Meesho tools: "Meesho listing" fills Meesho's bulk-upload template; "Meesho Lens" compares a product with competitors; "Meesho P&L" reads Meesho payment/order files and shows profit per SKU (pack size is read from SKUs like RGWM(GREY)05 = 5 pieces).
- Most "app not opening / blank / old behaviour" problems are fixed by updating the app (the "update" action).

You receive the ticket, the conversation so far, the findings of an automatic investigation of the customer's account, payments and app, and a draft answer written by rules. The findings are facts from our database: rely on them and do not contradict them. Write the reply the customer will read.

Rules:
- Reply in the customer's language and script (English, Hindi or Hinglish), in plain text with no markdown, headings or asterisks. Short numbered steps are fine. Keep it under 120 words unless steps are needed.
- Be specific: use the dates, amounts and states from the findings. Never invent features, prices, dates or policies.
- Never say a payment is approved unless the findings say so. Never promise refunds. Never ask for OTP, UPI PIN, passwords or bank details.
- Only mention another account's details in general terms ("a different account"); never reveal anyone else's phone number.
- If the customer is not logged in, do not describe any account details from the findings.
- If a screenshot is attached, read it and use what it shows.
- outcome: "answered" if your reply should fix it or asks the customer for something specific; "escalate" when a person must act (payment approval, refund, password reset, lost data, a bug you cannot explain); "ack" for suggestions.
- actions: the one-tap buttons shown under your reply, most useful first, at most 3. update = update the app; refresh_plan = reload the Pro status from the server; plan = open the Plan page; login = open the log-in page; shop, reports (GST summary), new_bill, items, parties, listing, lens, pnl = open that page. Mention the button by its purpose in the reply ("tap Update PakkaBill now below").
- If already_tried_quick_fix is true, the customer has already read the draft answer and it did not help: do not repeat it. Give a different next step if there is one, tell them the team has their ticket, and use outcome "escalate".
- summary: one line for the support team saying what the problem is and what you found.`;

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'The message to the customer. Plain text, no markdown.' },
    outcome: { type: 'string', enum: OUTCOMES },
    actions: { type: 'array', items: { type: 'string', enum: ACTIONS } },
    priority: { type: 'string', enum: PRIORITIES },
    summary: { type: 'string', description: 'One line for the support team.' },
  },
  required: ['reply', 'outcome', 'actions', 'priority', 'summary'],
  additionalProperties: false,
};

let client = null;
function anthropic() {
  if (!client) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    client = new Anthropic({ timeout: 45000, maxRetries: 1 });
  }
  return client;
}

// What Claude may see: no guest key, no other customers' numbers.
function briefFor(t, f, draft) {
  return {
    ticket: {
      number: t.no, topic: t.category, subject: t.subject, logged_in: !!t.account, customer_name: t.account ? t.name : undefined,
      picked_problem: t.problem || undefined,
      // the customer already saw the quick fix (the draft answer) on the Help page and it did not help
      already_tried_quick_fix: t.tried ? true : undefined,
      urgent: t.priority === 'urgent' || undefined,
    },
    conversation: t.messages.slice(-12).map((m) => ({ from: m.by, text: m.text, screenshot: m.img ? true : undefined })),
    findings: {
      checks: f.findings.map((x) => x.replace(/from a different number \(\d+\)/, 'from a different account').replace(/^ℹ Not logged in.*$/, 'ℹ Not logged in.')),
      free_bills_per_month: f.freeBills,
      pro_features_locked_for_free_users: f.locked,
      prices: f.prices,
      app: f.app || null,
      app_showed_plan: f.appPlan || null,
      plan: t.account ? f.plan || null : undefined,
    },
    draft_answer: { text: draft.text, outcome: draft.outcome, actions: draft.actions },
  };
}

async function aiAnswer(t, f, draft) {
  const content = [{ type: 'text', text: `Ticket and investigation:\n${JSON.stringify(briefFor(t, f, draft), null, 1)}` }];
  const withPic = [...t.messages].reverse().find((m) => m.by === 'customer' && m.img);
  if (withPic) {
    const data = await db.cmd(['GET', `ticketimg:${t.id}:${withPic.img}`]);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(data || ''));
    if (m) content.unshift({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  const params = {
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  };
  // Server-side fallback: if the model declines, the API re-runs the request on Anthropic's
  // recommended fallback model within the same call.
  if (MODEL === 'claude-opus-5') Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  const res = await anthropic().beta.messages.create(params);
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(`AI stopped: ${res.stop_reason}`);
  const block = res.content.find((b) => b.type === 'text');
  const out = JSON.parse(block ? block.text : '');
  const reply = String(out.reply || '').replace(/\*\*|__|^#+\s*/gm, '').trim().slice(0, 1800);
  if (reply.length < 10) throw new Error('AI reply was empty');
  return {
    text: reply,
    actions: [...new Set(Array.isArray(out.actions) ? out.actions : [])].filter((x) => ACTIONS.includes(x)).slice(0, 3),
    outcome: OUTCOMES.includes(out.outcome) ? out.outcome : draft.outcome,
    priority: PRIORITIES.includes(out.priority) ? out.priority : draft.priority,
    summary: String(out.summary || '').slice(0, 240),
    source: 'ai',
    model: res.model,
  };
}

// Counts AI answers per day so a flood of tickets cannot run up the bill.
async function aiAllowed() {
  if (!AI_PER_DAY) return false;
  const k = `assist:ai:${new Date().toISOString().slice(0, 10)}`;
  const n = await db.cmd(['INCR', k]);
  if (n === 1) await db.cmd(['EXPIRE', k, 2 * 86400]);
  return n <= AI_PER_DAY;
}

// Investigates the ticket and returns the answer to post (or null when the assistant should
// stay quiet because a person is already handling the ticket).
async function answer(t, { force = false, rulesOnly = false } = {}) {
  const s = await getSettings();
  if (!force && !s.auto) return null;
  const f = await investigate(t);
  f.teamText = replyText(await teamReplyMinutes());
  const draft = rulesAnswer(t, f);
  let a = draft;
  // When only a person can finish the job (a payment to approve, a refund, a UTR from another
  // account) the exact built-in answer is used, so nothing wrong is ever said about money.
  if (!rulesOnly && !draft.hard && s.ai && s.aiReady && (await aiAllowed())) {
    try {
      a = await aiAnswer(t, f, draft);
      if ((draft.outcome === 'escalate' || t.tried) && a.outcome !== 'escalate') a.outcome = 'escalate';
      a.priority = maxPrio(a.priority, draft.priority);
    } catch (e) {
      console.error('assistant AI failed, using built-in answer:', e && e.message);
      a = { ...draft, aiError: String((e && e.message) || e).slice(0, 160) };
    }
  }
  return { ...a, findings: f.findings, kb: draft.kb, teamText: f.teamText };
}

module.exports = {
  ACTIONS, PROBLEM_KB, MAX_BOT_REPLIES, getSettings, saveSettings, investigate, rulesAnswer, answer, findUtrs, dateStr, rupees, tail,
  recordReplyTime, teamReplyMinutes, replyText, quickFixStat, quickFixStats,
};
