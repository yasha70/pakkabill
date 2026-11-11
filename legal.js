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
  // top bar: the page's own PakkaBill mark, the main links and a button into the app
  var here = location.pathname.replace(/\.html$/, '');
  var link = function (href, text) { return '<a href="' + href + '"' + (here === href ? ' aria-current="page"' : '') + '>' + text + '</a>'; };
  var main = document.querySelector('main'), head = main && main.querySelector(':scope > header');
  if (main) {
    var top = document.createElement('div');
    top.className = 'lg-top';
    top.innerHTML = '<div class="lg-top__in"><nav aria-label="PakkaBill">' + link('/about', 'About') + link('/contact', 'Contact') + link('/terms', 'Terms') + link('/privacy', 'Privacy') + link('/refund', 'Refunds') + '</nav><a class="lg-open" href="/">Open PakkaBill</a></div>';
    if (head) top.firstChild.insertBefore(head, top.firstChild.firstChild);
    document.body.insertBefore(top, main);
  }
  var f = document.createElement('footer');
  f.className = 'lg-foot';
  f.innerHTML = '<nav aria-label="More">' + link('/?home=1', 'Home') + link('/about', 'About us') + link('/contact', 'Contact') + link('/terms', 'Terms') + link('/privacy', 'Privacy') + link('/refund', 'Refunds') + link('/delete-account', 'Delete account') + '</nav><p>© ' + new Date().getFullYear() + ' <span data-biz="name">PakkaBill</span>. Made in India for GST sellers.</p>';
  document.body.appendChild(f);
  fill(null);
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(fill).catch(function () {});
  var v = document.createElement('script'); v.src = 'visit.js'; v.defer = true; document.head.appendChild(v);
})();
