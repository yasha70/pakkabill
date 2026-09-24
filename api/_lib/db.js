// Storage: Upstash Redis over its REST API (what Vercel's Redis/KV integration provides).
// PB_DEV_MEMORY_DB=1 swaps in an in-memory store for local testing only.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const MEMORY = process.env.PB_DEV_MEMORY_DB === '1';

function configured() {
  return MEMORY || !!(URL_ && TOKEN);
}

async function redis(cmd) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Database error: ${data.error || res.status}`);
  return data.result;
}

// Minimal in-memory Redis for the commands used here.
const mem = { kv: new Map(), exp: new Map(), z: new Map() };
function memAlive(k) {
  const e = mem.exp.get(k);
  if (e && e <= Date.now()) {
    mem.kv.delete(k);
    mem.exp.delete(k);
  }
  return mem.kv.has(k);
}
async function memory([op, ...a]) {
  switch (op.toUpperCase()) {
    case 'GET':
      return memAlive(a[0]) ? mem.kv.get(a[0]) : null;
    case 'MGET':
      return a.map((k) => (memAlive(k) ? mem.kv.get(k) : null));
    case 'SET': {
      const [k, v, ...opts] = a;
      const up = opts.map((o) => String(o).toUpperCase());
      if (up.includes('NX') && memAlive(k)) return null;
      mem.kv.set(k, String(v));
      mem.exp.delete(k);
      const ex = up.indexOf('EX');
      if (ex >= 0) mem.exp.set(k, Date.now() + Number(opts[ex + 1]) * 1000);
      return 'OK';
    }
    case 'DEL':
      return a.reduce((n, k) => n + (mem.kv.delete(k) ? 1 : 0), 0);
    case 'INCR': {
      const v = (memAlive(a[0]) ? Number(mem.kv.get(a[0])) : 0) + 1;
      mem.kv.set(a[0], String(v));
      return v;
    }
    case 'EXPIRE':
      if (!memAlive(a[0])) return 0;
      mem.exp.set(a[0], Date.now() + Number(a[1]) * 1000);
      return 1;
    case 'ZADD': {
      const z = mem.z.get(a[0]) || new Map();
      z.set(a[2], Number(a[1]));
      mem.z.set(a[0], z);
      return 1;
    }
    case 'ZCARD':
      return (mem.z.get(a[0]) || new Map()).size;
    case 'ZREVRANGE': {
      const z = [...(mem.z.get(a[0]) || new Map()).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
      const stop = Number(a[2]) < 0 ? z.length : Number(a[2]) + 1;
      return z.slice(Number(a[1]), stop);
    }
    default:
      throw new Error(`memory db: ${op} not supported`);
  }
}

const cmd = (c) => (MEMORY ? memory(c) : redis(c));

async function getJSON(key) {
  const v = await cmd(['GET', key]);
  return v ? JSON.parse(v) : null;
}
async function setJSON(key, value, ttlSeconds) {
  const c = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds) c.push('EX', ttlSeconds);
  return cmd(c);
}
async function mgetJSON(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    if (!chunk.length) break;
    const vals = await cmd(['MGET', ...chunk]);
    vals.forEach((v) => out.push(v ? JSON.parse(v) : null));
  }
  return out;
}

module.exports = { configured, cmd, getJSON, setJSON, mgetJSON };
