// Storage: Upstash Redis over its REST API (what Vercel's Redis/KV integration provides).
// PB_DEV_MEMORY_DB=1 swaps in an in-memory store for local testing only.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const MEMORY = process.env.PB_DEV_MEMORY_DB === '1';

function configured() {
  return MEMORY || !!(URL_ && TOKEN);
}

// One HTTP call to Upstash. Each call has a time limit, and a network error or a 5xx from Upstash
// is tried once more, so a slow or dropped connection does not hang a request.
async function call(path, payload) {
  for (let attempt = 0; ; attempt++) {
    let res, data;
    try {
      res = await fetch(URL_ + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt < 1) { await new Promise((r) => setTimeout(r, 200)); continue; }
      throw new Error(`Database unreachable: ${e.message}`);
    }
    if (res.status >= 500 && attempt < 1) { await new Promise((r) => setTimeout(r, 200)); continue; }
    if (!res.ok || data.error) throw new Error(`Database error: ${data.error || res.status}`);
    return data;
  }
}

async function redis(cmd) {
  return (await call('', cmd)).result;
}

// Several commands in one round trip; returns their results in order.
async function redisPipe(cmds) {
  const out = await call('/pipeline', cmds);
  return out.map((r) => {
    if (r.error) throw new Error(`Database error: ${r.error}`);
    return r.result;
  });
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
    case 'INCR':
    case 'DECR': {
      const v = (memAlive(a[0]) ? Number(mem.kv.get(a[0])) : 0) + (op.toUpperCase() === 'INCR' ? 1 : -1);
      mem.kv.set(a[0], String(v));
      return v;
    }
    case 'TTL':
      if (!memAlive(a[0])) return -2;
      return mem.exp.has(a[0]) ? Math.ceil((mem.exp.get(a[0]) - Date.now()) / 1000) : -1;
    case 'PING':
      return 'PONG';
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
    case 'ZREM': {
      const z = mem.z.get(a[0]);
      return z ? a.slice(1).reduce((n, m) => n + (z.delete(m) ? 1 : 0), 0) : 0;
    }
    case 'SADD': {
      const s = mem.z.get('set:' + a[0]) || new Map();
      const before = s.size;
      a.slice(1).forEach((m) => s.set(String(m), 1));
      mem.z.set('set:' + a[0], s);
      return s.size - before;
    }
    case 'SISMEMBER':
      return (mem.z.get('set:' + a[0]) || new Map()).has(String(a[1])) ? 1 : 0;
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
async function pipe(cmds) {
  if (!MEMORY) return redisPipe(cmds);
  const out = [];
  for (const c of cmds) out.push(await memory(c));
  return out;
}

async function getJSON(key) {
  const v = await cmd(['GET', key]);
  return v ? JSON.parse(v) : null;
}
async function setJSON(key, value, ttlSeconds) {
  const c = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds) c.push('EX', ttlSeconds);
  return cmd(c);
}
// Reads many keys, 100 per call, a few calls at a time (fast even with thousands of accounts).
async function mgetJSON(keys) {
  const chunks = [];
  for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));
  const out = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += 6) {
    await Promise.all(chunks.slice(i, i + 6).map(async (chunk, j) => {
      out[i + j] = (await cmd(['MGET', ...chunk])).map((v) => (v ? JSON.parse(v) : null));
    }));
  }
  return out.flat();
}

module.exports = { configured, cmd, pipe, getJSON, setJSON, mgetJSON };
