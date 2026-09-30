// Legal and info pages: fills in the business details and prices saved in the admin panel
// (Settings → Business details) from /api/config, and adds the shared footer.
(function () {
  var D = { name: 'PakkaBill', monthly: 99, yearly: 999 };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fill(c) {
    var b = (c && c.biz) || {};
    var v = {
      name: b.name || D.name,
      email: b.email ? '<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>' : '',
      phone: b.phone ? '<a href="tel:' + esc(b.phone.replace(/[^\d+]/g, '')) + '">' + esc(b.phone) + '</a>' : '',
      address: esc(b.address || ''),
      grievance: esc(b.grievance || b.name || ''),
      monthly: '₹' + ((c && c.monthly) || D.monthly),
      yearly: '₹' + ((c && c.yearly) || D.yearly),
      trial: String((c && c.trialDays) || 0),
    };
    document.querySelectorAll('[data-biz]').forEach(function (el) {
      var k = el.getAttribute('data-biz'), val = k === 'name' ? esc(v.name) : v[k];
      if (val && val !== '0') { el.innerHTML = val; el.closest('[data-biz-row]') && el.closest('[data-biz-row]').removeAttribute('hidden'); }
    });
    document.querySelectorAll('[data-biz-if]').forEach(function (el) {
      if (v[el.getAttribute('data-biz-if')] && v[el.getAttribute('data-biz-if')] !== '0') el.removeAttribute('hidden');
    });
  }
  fill(null);
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(fill).catch(function () {});
  var f = document.createElement('footer');
  f.className = 'lg-foot';
  f.innerHTML = '<nav><a href="/">Open PakkaBill</a><a href="/about">About us</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refunds</a><a href="/contact">Contact</a></nav><p>© ' + new Date().getFullYear() + ' PakkaBill. Made in India for GST sellers.</p>';
  (document.querySelector('main') || document.body).appendChild(f);
})();
