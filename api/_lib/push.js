// Phone notifications (Web Push). The signing keys (VAPID) are made once and kept in the
// database, so nothing has to be set up in Vercel. Subscriptions are kept per account
// (push:u:<phone>), per guest ticket (push:t:<id>) and for the admin (push:admin); one the
// browser has dropped is removed the first time a send to it fails.
const webpush = require('web-push');
const db = require('./db');
const core = require('./core');

const MAX_SUBS = 6;
const KEEP_DAYS = 400;
// Only real browser push services, so the server never posts to an address a visitor made up.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;

let keys = null;
async function vapid() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  let k = await db.getJSON('push:vapid');
  if (!k) {
    await db.cmd(['SET', 'push:vapid', JSON.stringify(webpush.generateVAPIDKeys()), 'NX']);
    k = await db.getJSON('push:vapid');
  }
  keys = k;
  return keys;
}
const publicKey = async () => (await vapid()).publicKey;

function cleanSub(s) {
  if (!s || typeof s !== 'object' || !s.keys) return null;
  const endpoint = String(s.endpoint || '');
  const p256dh = String(s.keys.p256dh || '');
  const auth = String(s.keys.auth || '');
  let host = '';
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:') host = u.hostname;
  } catch {
    /* not a URL */
  }
  if (!host || !PUSH_HOSTS.test(host) || endpoint.length > 1000) return null;
  if (!/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}={0,2}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

async function subscribe(listKey, sub) {
  const s = cleanSub(sub);
  if (!s) throw new core.HttpError(400, 'This browser cannot receive notifications.');
  const list = (await db.getJSON(listKey)) || [];
  const next = [s, ...list.filter((x) => x.endpoint !== s.endpoint)].slice(0, MAX_SUBS);
  await db.setJSON(listKey, next, KEEP_DAYS * 86400);
  return true;
}

async function unsubscribe(listKey, endpoint) {
  const list = (await db.getJSON(listKey)) || [];
  const next = list.filter((x) => x.endpoint !== String(endpoint || ''));
  if (next.length !== list.length) await db.setJSON(listKey, next, KEEP_DAYS * 86400);
}

// payload: { title, body, url, tag }. Returns how many devices it reached. Never throws:
// a failed notification must not fail the reply or approval that triggered it.
async function send(listKey, payload) {
  try {
    const list = (await db.getJSON(listKey)) || [];
    if (!list.length) return 0;
    const k = await vapid();
    const opts = {
      vapidDetails: { subject: process.env.VAPID_SUBJECT || 'https://pakkabill1.vercel.app', publicKey: k.publicKey, privateKey: k.privateKey },
      TTL: 3 * 86400,
      urgency: 'high',
      timeout: 4000,
    };
    const body = JSON.stringify({
      title: String(payload.title || 'PakkaBill').slice(0, 80),
      body: String(payload.body || '').replace(/\s+/g, ' ').slice(0, 180),
      url: String(payload.url || '/#/support').slice(0, 200),
      tag: String(payload.tag || 'pakkabill').slice(0, 60),
    });
    const gone = [];
    let sent = 0;
    await Promise.all(list.map(async (s) => {
      try {
        await webpush.sendNotification(s, body, opts);
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
        else console.error('push failed', e && (e.statusCode || e.message));
      }
    }));
    if (gone.length) await db.setJSON(listKey, list.filter((s) => !gone.includes(s.endpoint)), KEEP_DAYS * 86400);
    return sent;
  } catch (e) {
    console.error('push error', e && e.message);
    return 0;
  }
}

const userKey = (phone) => `push:u:${phone}`;
const ticketKey = (id) => `push:t:${id}`;
const ADMIN = 'push:admin';

// A ticket's customer: their account's devices, or the guest devices that follow this ticket.
const toTicket = (t, payload) => send(t.account ? userKey(t.phone) : ticketKey(t.id), payload);
const toUser = (phone, payload) => send(userKey(phone), payload);
const toAdmin = (payload) => send(ADMIN, payload);

module.exports = { publicKey, subscribe, unsubscribe, send, toTicket, toUser, toAdmin, userKey, ticketKey, ADMIN, cleanSub };
