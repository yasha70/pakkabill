// PhonePe PG Standard Checkout (v2): OAuth token, create payment, order status.
const db = require('./db');

const ENV = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
const HOSTS = {
  sandbox: {
    token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    pg: 'https://api.phonepe.com/apis/pg',
  },
};
const host = HOSTS[ENV] || HOSTS.sandbox;
const TOKEN_URL = process.env.PHONEPE_TOKEN_URL || host.token;
const PG_URL = process.env.PHONEPE_PG_URL || host.pg;

const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || '';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';

function configured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

async function accessToken() {
  const cached = await db.getJSON('phonepe:token');
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_version: CLIENT_VERSION,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`PhonePe token failed: ${res.status} ${JSON.stringify(data)}`);
  // expires_at is in epoch seconds.
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + 30 * 60_000;
  const ttl = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000) - 60);
  await db.setJSON('phonepe:token', { token: data.access_token, expiresAt }, ttl);
  return data.access_token;
}

async function call(path, init = {}) {
  const res = await fetch(PG_URL + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${await accessToken()}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PhonePe ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// amountPaise: integer. Returns { orderId, state, redirectUrl }.
function createPayment({ merchantOrderId, amountPaise, redirectUrl, message, udf }) {
  return call('/checkout/v2/pay', {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200,
      metaInfo: udf,
      paymentFlow: { type: 'PG_CHECKOUT', message, merchantUrls: { redirectUrl } },
    }),
  });
}

// Returns { state: 'PENDING' | 'COMPLETED' | 'FAILED', amount, ... }.
function orderStatus(merchantOrderId) {
  return call(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`, { method: 'GET' });
}

module.exports = { configured, createPayment, orderStatus, ENV };
