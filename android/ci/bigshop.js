// Makes a large Meesho account for the emulator test, like a real seller's: the website's sample
// shop with every order repeated ten times and spread over about 200 SKUs (sizes and colours).
// Usage: node android/ci/bigshop.js <out dir>   writes Meesho-big-payments.csv and Orders-big.csv
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../pnl.html'), 'utf8');
const start = html.indexOf('/* Hisaab engine');
const m = { exports: {} };
new Function('module', 'self', html.slice(start, html.indexOf('</script>', start)))(m, undefined);
const E = m.exports;
const out = process.argv[2] || 'big';
fs.mkdirSync(out, { recursive: true });

const COPIES = 10, VARIANTS = 25;
const { payBook, ordBook } = E.demo();
function csv(rows) { return rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n') + '\n'; }
function spread(rows, skip, idCol, skuCol, nameCol) {
  const res = rows.slice(0, skip);
  for (let c = 0; c < COPIES; c++) {
    for (const r of rows.slice(skip)) {
      const x = r.slice();
      const id = String(x[idCol] || '');
      if (!/^\d+/.test(id)) { if (c === 0) res.push(x); continue; }
      const nid = id.replace(/^\d+/, d => String(Number(d) + c));
      const v = (Number(id.replace(/\D/g, '').slice(-6)) + c * 7) % VARIANTS;
      x[idCol] = nid;
      if (skuCol >= 0 && x[skuCol]) x[skuCol] = x[skuCol] + '-V' + v;
      if (nameCol >= 0 && x[nameCol]) x[nameCol] = x[nameCol] + ' Style ' + v;
      res.push(x);
    }
  }
  return res;
}
const pay = payBook.sheets.find(s => s.name === 'Order Payments').rows;
const ph = pay[0];
const payBig = spread(pay, 2, ph.indexOf('Sub Order No'), ph.indexOf('Supplier SKU'), ph.indexOf('Product Name'));
const ord = ordBook.sheets[0].rows;
const oh = ord[0].map(s => String(s).toLowerCase());
const col = re => oh.findIndex(h => re.test(h));
const ordBig = spread(ord, 1, col(/sub order/), col(/sku/), col(/product name/));
fs.writeFileSync(path.join(out, 'Meesho-big-payments.csv'), csv(payBig));
fs.writeFileSync(path.join(out, 'Orders-big.csv'), csv(ordBig));
const skus = new Set(payBig.slice(2).map(r => r[ph.indexOf('Supplier SKU')]));
console.log(`big shop: ${payBig.length - 2} payment rows, ${ordBig.length - 1} order rows, ${skus.size} SKUs`);
