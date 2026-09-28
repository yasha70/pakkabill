// PakkaBill chat assistant: answers any question on the Help page in a conversation.
//
// Every answer starts from facts: the same account, payment and app checks the ticket
// assistant uses (assist.js), the known problems it can fix, and the how-to guide (guide.js).
// When ANTHROPIC_API_KEY is set, Claude writes the reply from the whole guide and those facts,
// in the customer's language; otherwise the built-in answer is used. Money questions that only
// a person can settle (a payment to approve, a refund) always get the exact built-in answer.
const db = require('./db');
const core = require('./core');
const assist = require('./assist');
const guide = require('./guide');

const MAX_TURNS = 12;
const MAX_TEXT = 1000;
const SURE = 2.6; // search score needed to answer straight away

const RE = {
  greet: /^\s*(hi+|hello|hey|hlo|helo|namaste|namaskar|good (morning|afternoon|evening)|ram ram|jai shri krishna|jai shree krishna|salaam|नमस्ते|नमस्कार|हेलो|हाय|राम राम)[\s!.,🙏👋]*$/i,
  thanks: /^\s*(thanks?( you)?|thank u|thx|ty|dhanyavad|dhanyawad|shukriya|ok(ay)?|great|nice|super|done|solved|ho gaya|theek hai|thik hai|samajh gaya|got it|धन्यवाद|शुक्रिया|ठीक है|ओके|हो गया|समझ गया)[\s!.,🙏👍]*$/i,
  human: /(talk|speak|chat|connect)( me)? (to|with) (a |an |your )?(human|person|agent|someone|team|executive|support)|customer care|real person|call me|helpline|contact (you|support)|insaan se|baat karni|baat karna|phone karo|कस्टमर केयर|इंसान से|किसी से बात|बात करनी|बात करना/i,
  problem: /not (working|opening|loading|showing|coming|downloading|printing|saving|active|accepted)|nahi (ho|chal|khul|aa|dikh|ban|mil|hua|hota)|problem|issue|error|fail|stuck|hang|crash|blank|wrong|galat|can'?t|cannot|unable|doesn'?t|isn'?t|won'?t|missing|gone|gayab|slow|kharab|asks? (me )?to upgrade|locked|नहीं (हो|चल|खुल|आ|दिख|बन|मिल)|समस्या|दिक्कत|गलत|खराब|एरर|गायब/i,
  pay: /\b(utr|paid|payment|pay kiya|paise diye|purchased?|bought|refund|debited|deducted|kat gay|transaction)\b|\bpro\b.{0,25}(not|nahi|still|active)|भुगतान|पेमेंट|यूटीआर|पैसे कट|रिफंड/i,
  // questions about the asker's own account or app, answered from our records
  myPlan: /\b(my|mera|meri|mere|am i|kya (main|mai|mera))\b.{0,25}\b(plan|pro|subscription|validity|expiry)\b|\b(plan|pro|subscription)\b.{0,20}\b(status|kab tak|expire|expiry|ends?|end date|validity|active hai|chalu hai|kitne din)\b|when does my (plan|pro)|मेरा प्लान|प्रो कब तक|प्लान कब/i,
  myApp: /\b(my|mera|meri)\b.{0,12}\bapp\b.{0,20}\b(version|update|latest|old|purana)|\bapp version\b|\blatest version\b|\bwhich version\b|\bversion (kya|kaun|check)|\bupdate (available|hai kya|aaya)|is (my )?app (up to date|updated|latest)/i,
  myTickets: /\b(my|mera|meri|mere)\b.{0,10}\b(ticket|complaint|request|query)s?\b|\bticket (status|update)\b|\b(any|koi) reply\b|reply (aaya|mila|nahi aaya)|complaint status/i,
};

function cleanMessages(list) {
  const out = (Array.isArray(list) ? list : []).slice(-MAX_TURNS).map((m) => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    text: String((m && m.text) || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT),
  })).filter((m) => m.text);
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') throw new core.HttpError(400, 'Type a question first.');
  return out;
}

/* ---------------- answers the team adds in the admin panel ---------------- */
const CUSTOM = 'guide:custom';
async function listCustom() { return (await db.getJSON(CUSTOM)) || []; }
function cleanCustom(a) {
  const clip = (v, n) => String(v || '').replace(/\r\n/g, '\n').trim().slice(0, n);
  const title = clip(a.title, 140);
  const text = clip(a.text, 1500);
  const q = (Array.isArray(a.q) ? a.q : String(a.q || '').split(/[\n,;]+/)).map((x) => clip(x, 140)).filter(Boolean).slice(0, 15);
  if (title.length < 4) throw new core.HttpError(400, 'Write the question, for example "Can I add two shops?"');
  if (text.length < 10) throw new core.HttpError(400, 'Write the answer.');
  return {
    id: /^c_[a-z0-9]{6,20}$/.test(String(a.id || '')) ? a.id : `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    topic: 'custom', title, q: [title.toLowerCase(), ...q], text,
    actions: (Array.isArray(a.actions) ? a.actions : []).filter((x) => assist.ACTIONS.includes(x)).slice(0, 2),
    related: [], at: Date.now(),
  };
}
async function saveCustom(input) {
  const a = cleanCustom(input || {});
  const list = (await listCustom()).filter((x) => x.id !== a.id);
  list.unshift(a);
  await db.setJSON(CUSTOM, list.slice(0, 150));
  // the questions it now answers leave the "could not answer" list
  const answers = (x) => { const r = guide.search(x.q, 1, list); return r[0] && r[0].a.id === a.id && r[0].score >= SURE; };
  const un = ((await db.getJSON(UNANSWERED)) || []).filter((x) => !answers(x));
  await db.setJSON(UNANSWERED, un);
  return a;
}
async function deleteCustom(id) {
  await db.setJSON(CUSTOM, (await listCustom()).filter((x) => x.id !== String(id)));
}

// Facts about the person asking (logged in: their plan, payments and app; guest: their app).
async function facts(user, diag, question) {
  const t = {
    id: 'chat', account: !!user, phone: user ? user.phone : '', category: RE.pay.test(question) ? 'payment' : 'other',
    subject: question.slice(0, 120), diag: diag || {},
    // Hindi words are added in English ("पीडीएफ" -> pdf) so the problem checks understand them
    messages: [{ by: 'customer', text: /[\u0900-\u097F]/.test(question) ? `${question}\n${guide.keyWords(question).join(' ')}` : question, at: Date.now() }],
  };
  const f = await assist.investigate(t);
  const ctx = { freeBills: f.freeBills, prices: f.prices, locked: f.locked, pro: !!(f.plan && f.plan.pro) };
  return { t, f, ctx };
}

function suggestionsFrom(results, skipId) {
  return results.filter((r) => r.a.id !== skipId && r.a.id !== 'support' && r.score > 1).slice(0, 3).map((r) => r.a.title);
}

// The built-in answer. `sure` says whether it answered or is guessing.
function builtin(msgs, info) {
  const q = msgs[msgs.length - 1].text;
  const prevUser = msgs.slice(0, -1).reverse().find((m) => m.role === 'user');
  const { t, f, ctx } = info;
  const custom = info.custom || [];
  const done = (o) => ({ actions: [], suggestions: [], handoff: false, hard: false, sure: true, source: 'guide', ...o });
  const mine = accountAnswer(q, info);
  if (mine) return done(mine);

  if (RE.greet.test(q)) {
    return done({ kind: 'greet', text: `Namaste! 👋 I'm the PakkaBill assistant. Ask me how to do anything in PakkaBill, or tell me what is not working, and I'll check it for you.`, suggestions: guide.POPULAR.slice(0, 4) });
  }
  if (RE.thanks.test(q)) {
    return done({ kind: 'thanks', text: 'Happy to help! 😊 Ask me anything else about PakkaBill whenever you need.', suggestions: guide.POPULAR.slice(0, 3) });
  }
  if (RE.human.test(q)) {
    return done({ kind: 'human', text: 'Sure. Tap "Talk to a person" below and I will send this chat to our support team. They reply here on the Help page, and you get a notification if you turn them on.', handoff: true });
  }

  // Payments and things that are not working: check this customer's account and app first.
  const results = guide.search(q, 5, custom);
  const top = results[0];
  const payQ = RE.pay.test(q) || assist.findUtrs(q).length > 0;
  if (payQ || RE.problem.test(q)) {
    const a = assist.rulesAnswer(t, f);
    const generic = !a.kb || a.kb === 'update';
    // a clear how-to match beats a guessed problem ("how do I pay" is a how-to, not a problem)
    const howTo = top && top.score >= SURE + 2 && !payQ && !RE.problem.test(q);
    if (!howTo && (!generic || payQ)) {
      return done({
        kind: 'check', source: 'rules', text: a.text, actions: a.actions, hard: a.hard,
        handoff: a.outcome === 'escalate', suggestions: suggestionsFrom(results, a.kb),
      });
    }
    if (f.app && f.app.outdated && !top) {
      return done({ kind: 'check', source: 'rules', text: a.text, actions: a.actions, suggestions: guide.POPULAR.slice(0, 3) });
    }
  }

  // How-to questions: the guide. Follow-ups ("and on iphone?", "aur restore?") borrow the last question.
  let res = results;
  const followUp = /^\s*(and|aur|also|or|what about|how about|then|phir|fir|toh|to|uske baad|iske baad)\b|^\s*\S+\s*\?\s*$/i.test(q) || guide.keyWords(q).length <= 1;
  if ((!res[0] || res[0].score < SURE) && prevUser && followUp) {
    const joint = guide.search(`${prevUser.text} ${q}`, 5, custom);
    if (joint[0] && (!res[0] || joint[0].score > res[0].score)) res = joint;
  }
  const best = res[0];
  const words = guide.keyWords(q).length;
  // sure only when the answer is about most of the question, not one shared word ("account")
  if (best && best.score >= SURE && (best.coverage >= 0.5 || words <= 2 || best.score >= SURE * 2.5)) {
    const r = guide.render(best.a, ctx);
    let text = r.text;
    const actions = [...r.actions];
    if (f.app && f.app.outdated && RE.problem.test(q) && !actions.includes('update')) {
      text = `Your PakkaBill app is an older version (${f.app.version}); tap "Update PakkaBill now" first.\n\n${text}`;
      actions.unshift('update');
    }
    return done({ kind: 'guide', articleId: r.id, topic: r.topic, text, actions: actions.slice(0, 3), handoff: r.handoff, suggestions: r.related.length ? r.related : suggestionsFrom(res, r.id) });
  }
  if (best) {
    return done({
      kind: 'maybe', sure: false,
      text: 'I want to be sure I understood. Is it one of these? Tap one, or say it in other words.',
      suggestions: res.filter((x) => x.a.id !== 'support').slice(0, 3).map((x) => x.a.title), handoff: true,
    });
  }
  return done({
    kind: 'unsure', sure: false,
    text: 'I don\'t know the answer to that yet. You can ask it another way, pick a common question below, or tap "Talk to a person" and our team will reply here.',
    suggestions: guide.POPULAR.slice(0, 4), handoff: true,
  });
}

// "Am I on Pro?", "Is my app up to date?", "Any reply on my ticket?": answered from our records.
function accountAnswer(q, info) {
  const { t, f, ctx } = info;
  if (RE.myPlan.test(q) && !RE.problem.test(q)) {
    if (!t.account) return { kind: 'mine', text: 'Log in on the Plan page and I can tell you your plan and its end date. Without an account you are on the free plan on this device.', actions: ['login'], suggestions: ['What do I get with Pro?', 'How do I pay for Pro?'] };
    const pending = f.orders.filter((o) => o.state === 'PENDING');
    const wait = pending.length ? ` We also have your payment of ${assist.rupees(pending[0].amount)} (UTR ${assist.tail(pending[0].utr)}) waiting for our check; Pro is added as soon as it is approved.` : '';
    if (f.plan && f.plan.pro) {
      const days = Math.max(1, Math.ceil((f.plan.paidUntil - Date.now()) / 864e5));
      return { kind: 'mine', text: `You are on PakkaBill Pro until ${assist.dateStr(f.plan.paidUntil)}${f.plan.lastPlan ? ` (${f.plan.lastPlan} plan)` : ''}: ${days} day${days === 1 ? '' : 's'} left. Unlimited bills, PDF, WhatsApp sharing, logo and all designs are on.${wait}`, actions: f.appPlan === 'free' ? ['refresh_plan'] : [], suggestions: ['How do I renew Pro?', 'Add my logo and signature'] };
    }
    if (f.plan && f.plan.paidUntil) return { kind: 'mine', text: `Your Pro plan ended on ${assist.dateStr(f.plan.paidUntil)}, so you are on the free plan now (${ctx.freeBills} bills a month). Renew from the Plan page: ₹${ctx.prices.monthly} a month or ₹${ctx.prices.yearly} a year.${wait}`, actions: ['plan'], suggestions: ['How do I pay for Pro?'] };
    return { kind: 'mine', text: `You are on the free plan: ${ctx.freeBills} bills a month, printing and the Carbon, Modern, Classic, Ledger and Plain designs. Pro costs ₹${ctx.prices.monthly} a month or ₹${ctx.prices.yearly} a year.${wait}`, actions: ['plan'], suggestions: ['What do I get with Pro?', 'How do I pay for Pro?'] };
  }
  if (RE.myApp.test(q)) {
    if (f.app && f.app.outdated) return { kind: 'mine', text: `Your app is on ${f.app.version}; the latest is ${f.app.latest}. Tap "Update PakkaBill now": it takes a few seconds and your bills stay safe.`, actions: ['update'] };
    if (f.app) return { kind: 'mine', text: `You have the latest PakkaBill (${f.app.version}). Updates arrive by themselves when you open the app with internet.`, actions: [] };
    return { kind: 'mine', text: 'PakkaBill updates by itself when you open it with internet. To be sure you have the newest version, tap "Update PakkaBill now"; your bills stay safe.', actions: ['update'] };
  }
  if (RE.myTickets.test(q)) {
    if (info.tickets && info.tickets.length) {
      const open = info.tickets.filter((x) => ['open', 'progress', 'waiting'].includes(x.status));
      const label = { open: 'with our team', progress: 'being worked on', waiting: 'waiting for your reply', resolved: 'resolved', closed: 'closed' };
      const list = (open.length ? open : info.tickets.slice(0, 2)).slice(0, 3).map((x) => `${x.no} "${x.subject}": ${label[x.status] || x.status}${x.unreadUser ? ' (new reply!)' : ''}`);
      return { kind: 'mine', text: `${open.length ? `You have ${open.length} open ticket${open.length > 1 ? 's' : ''}` : 'You have no open tickets. Your latest'}:\n${list.join('\n')}\n\nOpen them on the Help page to read replies.`, actions: ['tickets'] };
    }
    return { kind: 'mine', text: t.account ? 'You have no support tickets. If you need our team, tap "Talk to a person" below.' : 'Your tickets are listed on the Help page. Tickets you raised without logging in are kept on the device you used.', actions: ['tickets'], handoff: !!t.account };
  }
  return null;
}

/* ---------------- Claude ---------------- */
const SYSTEM = `You are the PakkaBill assistant, chatting on the Help page of PakkaBill, a GST billing app (a web app that installs on the phone) for small Indian sellers and Meesho, Amazon and Flipkart sellers. You help people use the app and fix problems.

Rules:
- Answer only from the PakkaBill guide below and the facts about this customer. Use the exact button and page names from the guide. If the guide does not cover it, say you are not sure and offer a person (handoff).
- Reply in the customer's language and script (English, Hindi or Hinglish). Plain text, no markdown, no asterisks or headings. Numbered steps are fine. Keep it short: under 90 words unless steps are needed.
- Facts about the customer come from our database: use them (plan, payments, app version) and never contradict them. Never say a payment is approved unless the facts say so. Never promise refunds. Never ask for OTP, UPI PIN, passwords or bank details.
- If the customer already has Pro, Pro features are included for them; do not tell them to buy Pro.
- General GST questions: give the general rule briefly and suggest checking with their CA for their own case. Politely decline questions that have nothing to do with PakkaBill, billing or GST.
- actions: buttons shown under your reply, at most 3, only if useful: update = update the app, refresh_plan = reload the Pro status, plan = Plan page, login = log in, shop, reports (GST summary), gstr1 (GSTR-1 JSON), new_bill, items, parties, listing, lens, pnl = open that page.
- suggestions: up to 3 short follow-up questions the customer might ask next, in their language.
- handoff: true when a person from our team should take over (bugs you cannot explain, lost data, password reset, anything about money you cannot settle), or when the customer asks for a person.`;

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Message to the customer, plain text.' },
    actions: { type: 'array', items: { type: 'string', enum: assist.ACTIONS } },
    suggestions: { type: 'array', items: { type: 'string' } },
    handoff: { type: 'boolean' },
  },
  required: ['reply', 'actions', 'suggestions', 'handoff'],
  additionalProperties: false,
};

let client = null;
function anthropic() {
  if (!client) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    client = new Anthropic({ timeout: 30000, maxRetries: 1 });
  }
  return client;
}

function factsText(info) {
  const { t, f } = info;
  const lines = f.findings.map((x) => x.replace(/from a different number \(\d+\)/, 'from a different account').replace(/^ℹ Not logged in.*$/, 'ℹ Not logged in.'));
  return `Facts about this customer (from our database, ${new Date().toISOString().slice(0, 10)}):\n- ${t.account ? 'Logged in.' : 'Not logged in (a guest): do not describe any account details.'}\n${lines.map((x) => `- ${x}`).join('\n')}`;
}

async function aiAnswer(msgs, info, draft, model) {
  const guideCtx = { freeBills: info.ctx.freeBills, prices: info.ctx.prices, locked: true, pro: false };
  const messages = msgs.map((m, i) => (i === msgs.length - 1
    ? { role: 'user', content: [
      { type: 'text', text: factsText(info) },
      { type: 'text', text: `Built-in answer for reference (use it if it fits, improve it, or ignore it): ${draft.text}` },
      { type: 'text', text: m.text },
    ] }
    : { role: m.role, content: m.text }));
  const params = {
    model,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // The guide is the same for every chat, so it is cached between requests.
    system: [{ type: 'text', text: `${SYSTEM}\n\n# PakkaBill guide\n\n${guide.asText(guideCtx)}`, cache_control: { type: 'ephemeral' } }],
    messages,
  };
  // Server-side fallback: if the model declines, the API retries on Anthropic's recommended
  // fallback model within the same call.
  if (model === 'claude-opus-5') Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  const res = await anthropic().beta.messages.create(params);
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error(`AI stopped: ${res.stop_reason}`);
  const block = res.content.find((b) => b.type === 'text');
  const out = JSON.parse(block ? block.text : '');
  const text = String(out.reply || '').replace(/\*\*|__|^#+\s*/gm, '').trim().slice(0, 1600);
  if (text.length < 2) throw new Error('AI reply was empty');
  return {
    text,
    actions: [...new Set(Array.isArray(out.actions) ? out.actions : [])].filter((a) => assist.ACTIONS.includes(a)).slice(0, 3),
    suggestions: (Array.isArray(out.suggestions) ? out.suggestions : []).map((s) => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 3),
    handoff: !!out.handoff,
    source: 'ai', sure: true, kind: 'ai', model: res.model,
  };
}

/* ---------------- stats for the admin ---------------- */
const STATS = 'chat:stats';
const UNANSWERED = 'chat:unanswered';
async function bump(fields) {
  const s = (await db.getJSON(STATS)) || {};
  for (const k of fields) s[k] = (s[k] || 0) + 1;
  await db.setJSON(STATS, s);
}
async function logUnanswered(q) {
  const list = (await db.getJSON(UNANSWERED)) || [];
  list.unshift({ q: q.slice(0, 200), at: Date.now() });
  await db.setJSON(UNANSWERED, list.slice(0, 50));
}
async function stats() {
  return { ...((await db.getJSON(STATS)) || {}), unanswered: ((await db.getJSON(UNANSWERED)) || []).slice(0, 20) };
}
async function feedback(helpful) {
  await bump([helpful ? 'helpful' : 'notHelpful']);
}

// One turn of the chat. Returns { text, actions, suggestions, handoff, source }.
async function reply(input, user) {
  const msgs = cleanMessages(input.messages);
  const q = msgs[msgs.length - 1].text;
  const info = await facts(user, input.diag, q);
  info.custom = await listCustom();
  if (user && RE.myTickets.test(q)) {
    const ids = await db.cmd(['ZREVRANGE', `tickets:u:${user.phone}`, 0, 9]);
    info.tickets = (await db.mgetJSON(ids.map((id) => `ticket:${id}`))).filter(Boolean);
  }
  const draft = builtin(msgs, info);
  let a = draft;
  const s = await assist.getSettings();
  const small = draft.kind === 'greet' || draft.kind === 'thanks' || draft.kind === 'mine';
  if (!draft.hard && !small && s.ai && s.aiReady && (await assist.aiAllowed())) {
    try {
      a = await aiAnswer(msgs, info, draft, s.model);
      if (draft.kind === 'human') a.handoff = true;
    } catch (e) {
      console.error('chat AI failed, using built-in answer:', e && e.message);
      a = { ...draft, aiError: true };
    }
  }
  await bump(['questions', a.source === 'ai' ? 'ai' : 'builtin', a.sure === false ? 'unsure' : 'answered']);
  if (a.sure === false && !small) await logUnanswered(q);
  return {
    text: a.text, actions: a.actions || [], suggestions: a.suggestions || [], handoff: !!a.handoff,
    source: a.source, article: a.articleId || '', topic: a.topic || '',
  };
}

// Every answer for the Help Center page, written for this customer (their plan and prices).
async function helpCenter(user) {
  const settings = await core.getSettings();
  const ctx = { freeBills: Number(settings.freeBills), prices: { monthly: settings.monthly, yearly: settings.yearly }, locked: core.paymentsReady(settings) && !!settings.enforce, pro: !!(user && (user.paidUntil || 0) > Date.now()) };
  const custom = await listCustom();
  const articles = guide.ARTICLES.filter((a) => a.id !== 'support').map((a) => guide.render(a, ctx)).concat(custom.map((a) => guide.render(a, ctx)));
  return { topics: guide.TOPICS, articles: articles.map((a) => ({ id: a.id, topic: a.topic, title: a.title, text: a.text, actions: a.actions, related: a.related })) };
}

module.exports = { reply, stats, feedback, builtin, cleanMessages, facts, helpCenter, listCustom, saveCustom, deleteCustom };
