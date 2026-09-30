// POST /api/visit { kind: 'visit' | 'pv', vid, path, ref, utm, isNew, standalone, token? }
// Counts a website or app visit for the admin Visitors tab. Always answers 204, even on errors,
// so counting can never slow down or break the app.
const core = require('./_lib/core');
const db = require('./_lib/db');
const visits = require('./_lib/visits');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST' && db.configured()) {
      const b = core.body(req);
      let phone = '';
      if (b.kind === 'visit' && b.token) {
        const v = await db.cmd(['GET', `sess:${core.sha256(String(b.token))}`]);
        phone = v ? String(v).split('|')[0] : '';
      }
      await visits.record(req, b, phone);
    }
  } catch (e) {
    console.error('visit', e.message);
  }
  res.statusCode = 204;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
