// Makes the home page's pictures from the app itself, with its own sample data, so they always
// show the app as it looks now:
//   img/home-pnl.webp, img/home-insights.webp  Profit & Loss (sample data)
//   img/home-labels.webp                       packing chart, from sample labels made here
//   img/home-bill.webp                         a GST bill (sample data)
//   img/og.jpg                                 the share picture (1200 x 630)
// Run:  npm run dev   (in another terminal), then   node design/shots.cjs
// Needs Playwright (as test/autolist-browser.js does) and Python with Pillow for the WebP/JPEG files.
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SITE = process.env.PB_SITE || 'http://localhost:3000';
const IMG = path.join(__dirname, '..', 'img');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-shots-'));
const PHONE = { viewport: { width: 400, height: 866 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, colorScheme: 'light',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' };
const CLIP = { x: 0, y: 0, width: 400, height: 865.34 }; // 600 x 1298 at 1.5x
const quiet = () => { try { localStorage.setItem('pb-seen', '1'); localStorage.setItem('pb-nudge', JSON.stringify({ off: 1 })); } catch (e) {} };
// PNG to WebP or JPEG at an exact size
function save(png, out, w, h) {
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB')
if im.width != w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
im = im.crop((0, 0, w, h))
if out.endswith('.jpg'): im.save(out, 'JPEG', quality=88, optimize=True, progressive=True)
else: im.save(out, 'WEBP', quality=84, method=6)
`, png, path.join(IMG, out), String(w), String(h)]);
  console.log('made img/' + out);
}

async function pnl(b) {
  const ctx = await b.newContext(PHONE); const p = await ctx.newPage(); await p.addInitScript(quiet);
  await p.goto(SITE + '/#/pnl', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const f = p.frames().find((x) => /pnl\.html/.test(x.url()));
  await f.locator('[data-act=demo]').first().click();
  await p.waitForTimeout(6000); // the "Showing sample data" message goes away
  await f.getByText('Full details', { exact: true }).first().click(); await p.waitForTimeout(1500);
  const at = async (name, find, off) => {
    await f.evaluate(([find, off]) => { const el = find ? [...document.querySelectorAll('#p-pl *')].find((e) => !e.children.length && e.textContent.trim().startsWith(find)) : document.querySelector('#p-pl'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }, [find, off]);
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(TMP, name + '.png'), clip: CLIP });
  };
  await at('pnl', '', 60); await at('insights', 'In short', 70);
  save(path.join(TMP, 'pnl.png'), 'home-pnl.webp', 600, 1298); save(path.join(TMP, 'insights.png'), 'home-insights.webp', 600, 1298);
  await ctx.close();
}

async function labels(b) {
  const ctx = await b.newContext(PHONE); const p = await ctx.newPage(); await p.addInitScript(quiet);
  await p.goto(SITE + '/#/labels', { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const f = p.frames().find((x) => /labels\.html/.test(x.url()));
  await f.addScriptTag({ url: 'labels-libs.js' }).catch(() => {}); await p.waitForTimeout(1500);
  // sample labels in the layout the label reader's tests use (test/labels-audit.js), as one PDF
  await f.evaluate(async () => {
    const P = window.PDFLib, doc = await P.PDFDocument.create(), font = await doc.embedFont(P.StandardFonts.Helvetica);
    const orders = [['BG32', 'L', 2, 'Maroon', 'Valmo'], ['BG32', 'XL', 1, 'Maroon', 'Valmo'], ['BG32', 'XXL', 1, 'Maroon', 'Delhivery'], ['BG34', 'L', 1, 'Navy', 'Valmo'],
      ['BG34', 'XL', 3, 'Navy', 'Shadowfax'], ['BG34', 'XXL', 1, 'Navy', 'Valmo'], ['BPYG05', 'L', 1, 'Yellow', 'Delhivery'], ['BPYG05', 'XL', 2, 'Yellow', 'Valmo'],
      ['BPYG05', 'XXL', 2, 'Yellow', 'Shadowfax'], ['MN08', 'L', 1, 'Black', 'Valmo'], ['MN08', 'XL', 1, 'Black', 'Valmo'], ['MN08', 'XXL', 2, 'Black', 'Delhivery'],
      ['TP11', 'L', 2, 'Grey', 'Valmo'], ['TP11', 'XL', 1, 'Grey', 'Shadowfax'], ['TP11', 'XXL', 1, 'Grey', 'Valmo'], ['BG32', 'L', 1, 'Green', 'Delhivery']];
    orders.forEach((o, i) => {
      const pg = doc.addPage([595, 842]), t = (s, x, y, z = 8) => pg.drawText(String(s), { x, y, size: z, font });
      t('Customer Address', 28, 805, 9); t('COD: Check the payable amount on the app', 230, 805); t('Ramesh Kumar', 28, 792); t('12 MG Road, Jaipur, Rajasthan, 302001', 28, 781);
      t('If undelivered, return to:', 28, 752); t('Rangrez Blouse House, Surat 395002', 28, 741); t(o[4], 260, 760, 14); t('Pickup', 360, 760); t('VL00812345' + (60 + i), 270, 678, 10); t('Product Details', 28, 650, 9);
      t('SKU', 28, 636); t('Size', 160, 636); t('Qty', 220, 636); t('Color', 255, 636); t('Order No.', 310, 636);
      t(o[0], 28, 622); t(o[1], 160, 622); t(o[2], 224, 622); t(o[3], 255, 622); t('2600000000000' + (10 + i) + '_1', 310, 622);
      t('TAX INVOICE', 250, 435, 11); t('Original For Recipient', 470, 435, 7); t('BILL TO / SHIP TO', 28, 415); t('Sold by : Rangrez Blouse House GSTIN - 24AAXFR4821K1ZO', 300, 415);
      t('Description', 28, 350); t('HSN', 79, 350); t('Qty', 102, 350); t('Total', 315, 350); t(o[0] + ' - Blouse', 28, 338); t('6206', 143, 338); t(o[2], 168, 338);
    });
    const file = new File([await doc.save()], 'meesho-labels.pdf', { type: 'application/pdf' }), dt = new DataTransfer();
    dt.items.add(file);
    const inp = document.querySelector('input[type=file][data-act=file]'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(5000);
  await f.evaluate(() => { const el = [...document.querySelectorAll('h2,h3')].find((e) => /packing chart/i.test(e.textContent)); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(TMP, 'labels.png'), clip: CLIP });
  save(path.join(TMP, 'labels.png'), 'home-labels.webp', 600, 1298);
  await ctx.close();
}

async function bill(b) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1200 }, deviceScaleFactor: 1.3, colorScheme: 'light' }); const p = await ctx.newPage(); await p.addInitScript(quiet);
  await p.goto(SITE + '/#/bills', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.getByText('Try it with sample data').first().click(); await p.waitForTimeout(1200);
  await p.getByText('RBH/26-27/0004').first().click(); await p.waitForTimeout(1800);
  await p.locator('.sheet').first().screenshot({ path: path.join(TMP, 'bill.png') });
  save(path.join(TMP, 'bill.png'), 'home-bill.webp', 900, 851);
  await ctx.close();
}

// drawn in the site's own page, so it uses PakkaBill's fonts; run after pnl() (it shows home-pnl.webp)
async function og(b) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' }); const p = await ctx.newPage();
  await p.goto(SITE + '/?home=1', { waitUntil: 'load' }); await p.waitForTimeout(800);
  await p.evaluate(() => {
    const d = document.createElement('div'); d.id = 'og';
    d.innerHTML = `<style>
      body>#og{display:block!important}
      #og{position:fixed;inset:0;z-index:99999;width:1200px;height:630px;overflow:hidden;font-family:"PB Hind","Hind",system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#1f2670 0%,#2b3494 55%,#3a45b3 100%)}
      #og .l{position:absolute;left:72px;top:64px;width:640px}
      #og .b{display:flex;align-items:center;gap:16px;font-size:40px;font-weight:700;letter-spacing:-.02em}
      #og .b img{width:64px;height:64px;border-radius:16px;box-shadow:0 0 0 2px #ffffff40}
      #og h1{margin:54px 0 0;font-size:84px;line-height:1.04;font-weight:700;letter-spacing:-.035em}
      #og h1 em{font-style:normal;color:#b9c1ff}
      #og p{margin:26px 0 0;font-size:29px;line-height:1.4;color:#dfe2f8;max-width:19em}
      #og ul{list-style:none;display:flex;flex-wrap:wrap;gap:12px;margin:34px 0 0;padding:0}
      #og li{padding:9px 20px;border-radius:999px;background:#ffffff1f;border:1.5px solid #ffffff47;font-size:23px;font-weight:600}
      #og .ph{position:absolute;right:86px;top:58px;width:330px;border-radius:44px;background:#0d1230;padding:11px;box-shadow:0 40px 80px -30px #00000099,0 0 0 1px #ffffff1f}
      #og .ph img{display:block;width:100%;border-radius:34px}
    </style>
    <div class="l"><div class="b"><img src="icon-512.png" alt="">PakkaBill</div>
      <h1>Know your <em>real profit</em> on Meesho</h1>
      <p>Every fee, return, RTO, GST and product cost taken out, in English and हिंदी.</p>
      <ul><li>Profit &amp; Loss</li><li>Labels &amp; packing</li><li>GST bills</li></ul></div>
    <div class="ph"><img src="img/home-pnl.webp" alt=""></div>`;
    document.body.appendChild(d);
    document.documentElement.classList.remove('pb-home-on'); // only the picture shows
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(TMP, 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  save(path.join(TMP, 'og.png'), 'og.jpg', 1200, 630);
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  try { await pnl(b); await labels(b); await bill(b); await og(b); } finally { await b.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
