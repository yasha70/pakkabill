// Shared server helpers: responses, settings, accounts, sessions and plans.
const crypto = require('crypto');
const db = require('./db');

const DAY = 24 * 60 * 60 * 1000;
const PLAN_DAYS = { monthly: 30, yearly: 365 };
const DEFAULT_SETTINGS = { monthly: 99, yearly: 999, freeBills: 15, enforce: true, upiId: '', payeeName: '' };
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/;
const SESSION_DAYS = 180;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps a handler so thrown HttpErrors become JSON responses.
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Something went wrong on the server. Please try again.' });
    }
  };
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, `Use ${method}`);
}

function requireDb() {
  if (!db.configured()) throw new HttpError(503, 'Payments are not set up yet.');
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = () => crypto.randomBytes(24).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  return safeEqual(crypto.scryptSync(pw, salt, 32).toString('hex'), hash);
}

// Indian mobile number, 10 digits starting 6-9. Returns '' when invalid.
function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

// Counts attempts per key; throws once more than `max` happen inside `windowSec`.
async function rateLimit(key, max, windowSec) {
  const n = await db.cmd(['INCR', `rl:${key}`]);
  if (n === 1) await db.cmd(['EXPIRE', `rl:${key}`, windowSec]);
  if (n > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}

async function getSettings() {
  const s = db.configured() ? await db.getJSON('settings') : null;
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

// Paid features only switch on once the database is connected and a UPI ID is saved in admin.
function paymentsReady(settings) {
  return db.configured() && UPI_ID.test(settings.upiId || '');
}

function publicUser(u) {
  return {
    phone: u.phone,
    shopName: u.shopName || '',
    paidUntil: u.paidUntil || 0,
    pro: (u.paidUntil || 0) > Date.now(),
    lastPlan: u.lastPlan || '',
    createdAt: u.createdAt,
  };
}

const userKey = (phone) => `user:${phone}`;
const getUser = (phone) => db.getJSON(userKey(phone));
const saveUser = (u) => db.setJSON(userKey(u.phone), u);

async function createSession(phone) {
  const t = token();
  await db.cmd(['SET', `sess:${sha256(t)}`, phone, 'EX', SESSION_DAYS * 86400]);
  return t;
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

async function requireUser(req) {
  requireDb();
  const t = bearer(req);
  const phone = t && (await db.cmd(['GET', `sess:${sha256(t)}`]));
  const user = phone && (await getUser(phone));
  if (!user) throw new HttpError(401, 'Please log in again.');
  return user;
}

// Adds a plan period to a user, starting from today or from the end of their current plan.
function extend(user, days) {
  const from = Math.max(Date.now(), user.paidUntil || 0);
  user.paidUntil = from + days * DAY;
  return user;
}

module.exports = {
  DAY,
  UPI_ID,
  PLAN_DAYS,
  HttpError,
  send,
  handler,
  body,
  requireMethod,
  requireDb,
  sha256,
  token,
  safeEqual,
  hashPassword,
  checkPassword,
  normPhone,
  clientIp,
  rateLimit,
  getSettings,
  paymentsReady,
  publicUser,
  getUser,
  saveUser,
  createSession,
  bearer,
  requireUser,
  extend,
};
