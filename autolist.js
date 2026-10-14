// PakkaBill: Auto listing for Meesho.
// Save a product type once as a template (category, every detail, sizes with price and stock, name and
// description patterns), add products with their photos, and send them to Meesho's supplier panel,
// where the PakkaBill Lens extension fills the catalogue form in one click. Templates can also be
// saved straight from a form filled in Meesho. The seller checks and submits each form in Meesho.
// Photos stay on the device (IndexedDB); nothing goes to a server.
// The app calls window.pbAutoListMount(el) when #/autolist opens. Logic shared with the extension is
// in lens/listcore.js (PBListCore), loaded before this file.
(function () {
  'use strict';
  const root = window;
  const C = root.PBListCore;
  const KEY = 'pb-autolist', NEED = '2.3.0', FREE_TPL = 1, FREE_SEND = 5;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pro = () => (typeof root.pbPro === 'function' ? root.pbPro() : true);
  const toast = (m) => { if (typeof root.pbToast === 'function') return root.pbToast(m); const t = document.createElement('div'); t.className = 'pal-toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const verLess = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };

  /* ---------- saved data: templates and products in localStorage, photos in IndexedDB ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const S = Object.assign({ templates: [], products: [], removed: [], defTpl: '', perPhoto: true }, load(), { ext: '', stat: {}, edit: null, photos: new Map() });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ templates: S.templates, products: S.products, removed: S.removed.slice(-200), defTpl: S.defTpl, perPhoto: S.perPhoto })); } catch { toast('Could not save on this device: storage is full.'); } };

  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('pb-autolist', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('photos', mode); const out = fn(t.objectStore('photos')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  const putPhoto = (p) => tx('readwrite', (s) => s.put(p));
  const delPhoto = (id) => tx('readwrite', (s) => s.delete(id));
  const getPhoto = async (id) => { if (S.photos.has(id)) return S.photos.get(id); const p = await tx('readonly', (s) => s.get(id)); if (p) S.photos.set(id, p); return p; };

  // A photo made ready for Meesho: at most 1500 px on the long side, JPEG.
  async function readPhoto(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return { id: uid('ph'), name: file.name.replace(/\.[^.]+$/, '') + '.jpg', data: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
  }
  // "Maroon cotton blouse.jpg" -> "Maroon cotton blouse"; camera names like IMG_2034 -> ""
  const nameFromFile = (n) => { const b = String(n).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(); return /^(img|dsc|pxl|whatsapp|image|photo|screenshot|wa)\b|^\d[\d\s]*$/i.test(b) || !/[a-z]{3}/i.test(b) ? '' : b; };

  /* ---------- starter templates ---------- */
  const COMMON = ['Fabric', 'Pattern', 'Sleeve Length', 'Occasion', 'Color', 'Net Quantity (N)', 'Country of Origin', 'Manufacturer Details', 'Packer Details', 'Importer Details', 'Brand Name', 'GST', 'HSN Code', 'Net Weight (gms)', 'Ornamentation', 'Wash Care', 'Neck', 'Closure', 'Length', 'Blouse', 'Blouse Fabric', 'Border', 'Saree Fabric', 'Stitch Type', 'Product Description'];
  const sz = (list) => list.map((size) => ({ size, price: '', rprice: '', mrp: '', stock: '' }));
  const STARTERS = {
    blank: { name: 'New template', category: '', fields: [], sizes: [] },
    blouse: { name: 'Readymade blouse', category: 'Women Fashion > Ethnic Wear > Blouses', fields: [['Fabric', 'Cotton'], ['Pattern', ''], ['Sleeve Length', 'Short Sleeves'], ['Occasion', 'Festive'], ['Net Quantity (N)', '1'], ['Country of Origin', 'India'], ['GST', '5'], ['HSN Code', '620630'], ['Net Weight (gms)', '200'], ['Manufacturer Details', ''], ['Packer Details', '']], sizes: sz(['S', 'M', 'L', 'XL', 'XXL']) },
    saree: { name: 'Saree', category: 'Women Fashion > Ethnic Wear > Sarees', fields: [['Saree Fabric', ''], ['Blouse', 'Separate Blouse Piece'], ['Blouse Fabric', ''], ['Pattern', ''], ['Border', ''], ['Occasion', ''], ['Net Quantity (N)', '1'], ['Country of Origin', 'India'], ['GST', '5'], ['HSN Code', ''], ['Net Weight (gms)', '500'], ['Manufacturer Details', ''], ['Packer Details', '']], sizes: sz(['Free Size']) },
    kurti: { name: 'Kurti', category: 'Women Fashion > Ethnic Wear > Kurtis', fields: [['Fabric', ''], ['Pattern', ''], ['Sleeve Length', ''], ['Length', ''], ['Occasion', ''], ['Net Quantity (N)', '1'], ['Country of Origin', 'India'], ['GST', '5'], ['HSN Code', ''], ['Net Weight (gms)', '250'], ['Manufacturer Details', ''], ['Packer Details', '']], sizes: sz(['S', 'M', 'L', 'XL', 'XXL']) },
  };
  const starter = (k) => { const s = STARTERS[k] || STARTERS.blank; return { id: uid('t'), name: s.name, category: s.category, fields: s.fields.map(([label, value]) => ({ label, value })), sizes: JSON.parse(JSON.stringify(s.sizes)), title: '{name}', desc: '', source: 'pakkabill', updatedAt: Date.now() }; };
  const tplById = (id) => S.templates.find((t) => t.id === id) || null;

  /* ---------- talking to PakkaBill Lens ---------- */
  const post = (m) => window.postMessage(m, location.origin);
  const pushTemplates = () => { if (S.ext) post({ type: 'pb-list-templates', templates: S.templates, removed: S.removed }); };
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type !== 'pb-list-state') return;
    const first = !S.ext;
    S.ext = String(m.version || '1');
    S.stat = m.status && typeof m.status === 'object' ? m.status : {};
    // templates saved in Meesho come here; the newer copy of each wins
    let changed = false;
    (Array.isArray(m.templates) ? m.templates : []).forEach((t) => {
      if (!t || typeof t.id !== 'string' || S.removed.includes(t.id) || !Array.isArray(t.fields)) return;
      const i = S.templates.findIndex((x) => x.id === t.id);
      if (i < 0) { S.templates.push(t); changed = true; } else if ((t.updatedAt || 0) > (S.templates[i].updatedAt || 0)) { S.templates[i] = t; changed = true; }
    });
    if (changed) save();
    if (first) pushTemplates();
    paint();
  });

  /* ---------- page ---------- */
  let el = null;
  const CSS = `
.pal{max-width:1100px}
.pal .pal-card{padding:18px;margin-bottom:16px;min-width:0}
.pal h2{font-family:var(--font-display);font-size:26px;font-weight:600;line-height:1;margin:0 0 10px;padding-top:4px}
.pal h3{margin:0;font-size:16px}
.pal-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0;padding:0;list-style:none;counter-reset:s}
.pal-steps li{counter-increment:s;background:var(--carbon-tint);border-radius:12px;padding:12px 12px 12px 44px;position:relative;font-size:14px;color:var(--ink-2)}
.pal-steps li:before{content:counter(s);position:absolute;left:12px;top:11px;width:24px;height:24px;border-radius:50%;background:var(--carbon);color:#fff;font-weight:700;display:grid;place-items:center;font-size:13px}
.pal-steps b{display:block;color:var(--ink);font-size:14.5px}
@media (width<720px){.pal-steps{grid-template-columns:1fr}}
.pal-ext{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:14px;padding:10px 14px;border-radius:12px;background:var(--desk);font-size:14px}
.pal-ext.is-ok{background:var(--green-soft);color:var(--green)}
.pal-btn{font:inherit;font-weight:700;font-size:15px;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;color:var(--btn-fg,#fff);background:var(--btn-bg,#6c4dff);background-image:var(--btn-grad,none);text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.pal-btn--ghost{background:var(--carbon-tint);background-image:none;color:var(--carbon);border:1.5px solid var(--carbon)}
.pal-btn--sm{font-size:13px;padding:6px 10px;border-radius:8px}
.pal-btn:disabled{opacity:.55;cursor:default}
.pal-link{background:none;border:0;color:var(--carbon);font:inherit;font-weight:700;cursor:pointer;padding:0;text-decoration:underline}
.pal-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pal-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;margin-bottom:12px}
.pal-tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.pal-tpl{border:1.5px solid var(--rule);border-radius:14px;padding:12px;display:grid;gap:6px;background:var(--paper);min-width:0}
.pal-tpl b{font-size:15.5px;overflow-wrap:anywhere}
.pal-tpl small{color:var(--ink-3);font-size:12.5px;overflow-wrap:anywhere}
.pal-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:var(--carbon-tint);color:var(--carbon);white-space:nowrap}
.pal-tag.ok{background:var(--green-soft);color:var(--green)}
.pal-tag.warn{background:color-mix(in srgb,var(--amber,#d97706) 18%,transparent);color:var(--amber,#b45309)}
.pal-ed label{display:grid;gap:4px;font-size:12.5px;font-weight:700;color:var(--ink-2);min-width:0}
.pal input,.pal select,.pal textarea{font:inherit;font-size:15px;padding:8px 10px;border:1.5px solid var(--rule);border-radius:var(--r-ctl,9px);background:var(--paper);color:var(--ink);min-width:0;width:100%}
.pal textarea{min-height:70px;resize:vertical}
.pal-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (width<640px){.pal-grid2{grid-template-columns:1fr}}
.pal-tbl{width:100%;border-collapse:collapse;font-size:14px}
.pal-tbl th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3);text-align:left;padding:4px 4px}
.pal-tbl td{padding:3px 4px;vertical-align:middle}
.pal-tbl input{padding:6px 8px;font-size:14px}
.pal-x{border:0;background:none;font-size:20px;line-height:1;color:var(--ink-3);cursor:pointer;padding:2px 6px}
.pal-sec{margin-top:16px}
.pal-sec>p{margin:4px 0 8px;color:var(--ink-3);font-size:13px}
.pal-drop{display:grid;place-items:center;gap:6px;text-align:center;border:2px dashed var(--rule);border-radius:16px;padding:22px 16px;cursor:pointer;background:var(--paper)}
.pal-drop:hover,.pal-drop.is-over{border-color:var(--carbon);background:var(--carbon-tint)}
.pal-drop b{font-size:16.5px}
.pal-drop span{color:var(--ink-3);font-size:13.5px}
.pal-prods{display:grid;gap:12px;margin-top:14px}
.pal-p{border:1.5px solid var(--rule);border-radius:14px;padding:12px;display:grid;gap:10px;background:var(--paper);min-width:0}
.pal-p.is-done{opacity:.7}
.pal-p__top{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}
.pal-p__title{font-weight:700;font-size:15px;overflow-wrap:anywhere;min-width:0}
.pal-thumbs{display:flex;gap:6px;flex-wrap:wrap}
.pal-thumb{position:relative;width:64px;height:64px}
.pal-thumb img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--rule)}
.pal-thumb button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:var(--ink);color:var(--paper);font-size:12px;line-height:20px;cursor:pointer;padding:0}
.pal-add{width:64px;height:64px;border:1.5px dashed var(--rule);border-radius:8px;display:grid;place-items:center;color:var(--ink-3);font-size:24px;cursor:pointer}
.pal-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
@media (width<520px){.pal-fields label:first-child{grid-column:1/-1}}
.pal-fields label{display:grid;gap:3px;font-size:12px;font-weight:700;color:var(--ink-2);min-width:0}
.pal-fields input,.pal-fields select{padding:7px 9px;font-size:14px}
.pal-probs{margin:0;padding-left:18px;color:var(--red);font-size:13px}
.pal-send{position:sticky;bottom:calc(78px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;background:var(--paper);box-shadow:0 10px 30px -12px #1a143066,0 0 0 1px var(--rule);margin-top:14px;z-index:5}
@media (width>=1024px){.pal-send{bottom:12px}}
.pal-note{font-size:13px;color:var(--ink-3);margin:8px 0 0}
.pal-toast{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:10px 16px;border-radius:10px;z-index:1000;font-size:14px;max-width:90vw}
.pal .pal-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;border:0!important;overflow:hidden;clip:rect(0,0,0,0)}
`;

  function extHtml() {
    if (!S.ext) return `<div class="pal-ext"><span>On a laptop, the free <b>PakkaBill Lens</b> extension (Chrome or Edge) fills Meesho's form.</span><a class="pal-btn pal-btn--ghost pal-btn--sm" href="/pakkabill-lens.zip" download>⬇ Get PakkaBill Lens</a><a class="pal-link" href="#/lens">How to install</a><span class="pal-note" style="margin:0">Already have it? Download it again (version ${NEED}), load it the same way and reload this page.</span></div>`;
    if (verLess(S.ext, NEED)) return `<div class="pal-ext"><span>Your PakkaBill Lens is version ${esc(S.ext)}. Auto listing needs ${NEED}.</span><a class="pal-btn pal-btn--ghost pal-btn--sm" href="/pakkabill-lens.zip" download>⬇ Update PakkaBill Lens</a><span class="pal-note" style="margin:0">Unzip it over the old folder, tap Reload on the extension, then reload this page.</span></div>`;
    return `<div class="pal-ext is-ok">✓ PakkaBill Lens ${esc(S.ext)} is connected. Templates you save in Meesho appear here.</div>`;
  }

  function tplCard(t) {
    const n = S.products.filter((p) => p.tplId === t.id).length;
    return `<div class="pal-tpl"><div class="pal-row" style="justify-content:space-between"><b>${esc(t.name)}</b>${t.source === 'meesho' ? '<span class="pal-tag ok">Saved in Meesho</span>' : ''}</div>
      <small>${esc(t.category || 'No category yet')}</small>
      <small>${t.fields.filter((f) => f.value).length} details · ${t.sizes.length} ${t.sizes.length === 1 ? 'size' : 'sizes'}${t.sizes.length ? ' (' + esc(t.sizes.map((s) => s.size).join(', ')) + ')' : ''}${n ? ` · ${n} product${n > 1 ? 's' : ''}` : ''}</small>
      <div class="pal-row"><button type="button" class="pal-btn pal-btn--ghost pal-btn--sm" data-edit="${t.id}">Edit</button><button type="button" class="pal-link" data-copy="${t.id}">Copy</button><button type="button" class="pal-link" data-deltpl="${t.id}">Delete</button></div></div>`;
  }

  function editorHtml() {
    const t = S.edit;
    const rows = t.sizes.map((s, i) => `<tr><td><input data-sz="${i}" data-k="size" value="${esc(s.size)}" aria-label="Size"></td>${['price', 'rprice', 'mrp', 'stock'].map((k) => `<td><input data-sz="${i}" data-k="${k}" inputmode="numeric" value="${esc(s[k])}" aria-label="${k}"></td>`).join('')}<td><button type="button" class="pal-x" data-delsz="${i}" aria-label="Remove size">×</button></td></tr>`).join('');
    const quick = ['Free Size', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].filter((z) => !t.sizes.some((s) => C.norm(s.size) === C.norm(z)));
    const fields = t.fields.map((f, i) => `<tr><td><input data-fl="${i}" data-k="label" list="pal-labels" value="${esc(f.label)}" placeholder="Meesho's label" aria-label="Label"></td><td><input data-fl="${i}" data-k="value" value="${esc(f.value)}" placeholder="Value, as Meesho shows it" aria-label="Value"></td><td><button type="button" class="pal-x" data-delfl="${i}" aria-label="Remove detail">×</button></td></tr>`).join('');
    return `<section class="paper pal-card pal-ed" aria-labelledby="pal-ed-h"><div class="pal-head"><h2 id="pal-ed-h" style="margin:0">${tplById(t.id) ? 'Edit template' : 'New template'}</h2><button type="button" class="pal-x" data-cancel aria-label="Close">×</button></div>
      <div class="pal-grid2"><label>Template name<input data-t="name" value="${esc(t.name)}"></label><label>Meesho category<input data-t="category" value="${esc(t.category)}" placeholder="Women Fashion > Ethnic Wear > Blouses"></label></div>
      <div class="pal-sec"><h3>Sizes, prices and stock</h3><p>Meesho price is what you get before Meesho's fees. Return price is for wrong or defective returns (usually the same).</p>
        <div style="overflow-x:auto"><table class="pal-tbl"><thead><tr><th>Size</th><th>Meesho price</th><th>Return price</th><th>MRP</th><th>Stock</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="pal-row" style="margin-top:6px">${quick.map((z) => `<button type="button" class="pal-btn pal-btn--ghost pal-btn--sm" data-addsz="${esc(z)}">+ ${esc(z)}</button>`).join('')}<button type="button" class="pal-link" data-addsz="">Other size</button>${t.sizes.length > 1 ? '<button type="button" class="pal-link" data-samesz>Same price and stock for all</button>' : ''}</div></div>
      <div class="pal-sec"><h3>Details</h3><p>Use Meesho's own labels and values (Fabric: Cotton, Sleeve Length: Short Sleeves). For a multi-choice, separate values with commas. Easiest: fill one product in Meesho and tap <b>Save this form as a template</b> in the PakkaBill panel there.</p>
        <datalist id="pal-labels">${COMMON.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div style="overflow-x:auto"><table class="pal-tbl"><thead><tr><th>Label</th><th>Value</th><th></th></tr></thead><tbody>${fields}</tbody></table></div>
        <div class="pal-row" style="margin-top:6px"><button type="button" class="pal-btn pal-btn--ghost pal-btn--sm" data-addfl>+ Add detail</button></div></div>
      <div class="pal-sec pal-grid2"><label>Product name<input data-t="title" value="${esc(t.title)}" placeholder="{name}"></label><label>Description<textarea data-t="desc" placeholder="{color} {Fabric} blouse, {Sleeve Length}. Sizes {sizes}.">${esc(t.desc)}</textarea></label></div>
      <p class="pal-note">In the name and description, {name}, {color}, {sku} and {sizes} come from each product, and {Fabric} or any other {Label} from the details above.</p>
      <div class="pal-row" style="margin-top:12px"><button type="button" class="pal-btn" data-savetpl>Save template</button><button type="button" class="pal-btn pal-btn--ghost" data-cancel>Cancel</button></div></section>`;
  }

  function statusOf(p) {
    const st = S.stat[p.id];
    if (!st) return p.sent ? '<span class="pal-tag">Sent to Meesho</span>' : '';
    if (st.state === 'done') return '<span class="pal-tag ok">✓ Submitted</span>';
    return `<span class="pal-tag ${st.missing && st.missing.length ? 'warn' : 'ok'}">Filled ${st.filled}/${st.total}</span>`;
  }
  function prodHtml(p) {
    const t = tplById(p.tplId), probs = C.problems(t, { ...p, photos: p.photos });
    const title = t ? C.render(t.title || '{name}', t, p) : p.name;
    const st = S.stat[p.id];
    return `<div class="pal-p${st && st.state === 'done' ? ' is-done' : ''}" data-p="${p.id}">
      <div class="pal-p__top"><span class="pal-p__title">${esc(title || 'Product without a name')} ${statusOf(p)}</span><button type="button" class="pal-x" data-delp="${p.id}" aria-label="Remove product">×</button></div>
      <div class="pal-thumbs">${p.photos.map((id, i) => `<span class="pal-thumb"><img data-ph="${id}" alt="Photo ${i + 1}"><button type="button" data-delph="${p.id}|${id}" aria-label="Remove photo">×</button></span>`).join('')}${p.photos.length < 10 ? `<label class="pal-add" title="Add photos">+<input type="file" accept="image/*" multiple class="pal-sr" data-addph="${p.id}"></label>` : ''}</div>
      <div class="pal-fields">
        <label>Name<input data-pf="name" value="${esc(p.name)}" placeholder="Maroon cotton blouse"></label>
        <label>Colour<input data-pf="color" value="${esc(p.color)}" placeholder="Maroon"></label>
        <label>SKU<input data-pf="sku" value="${esc(p.sku)}" placeholder="BL-MRN-01"></label>
        <label>Template<select data-pf="tplId">${S.templates.map((x) => `<option value="${x.id}"${x.id === p.tplId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Price (all sizes)<input data-pf="price" inputmode="numeric" value="${esc(p.price)}" placeholder="${esc(t && t.sizes[0] ? t.sizes[0].price : '')}"></label>
        <label>MRP<input data-pf="mrp" inputmode="numeric" value="${esc(p.mrp)}" placeholder="${esc(t && t.sizes[0] ? t.sizes[0].mrp : '')}"></label>
        <label>Stock per size<input data-pf="stock" inputmode="numeric" value="${esc(p.stock)}" placeholder="${esc(t && t.sizes[0] ? t.sizes[0].stock : '')}"></label>
      </div>
      ${probs.length ? `<ul class="pal-probs">${probs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${st && st.missing && st.missing.length && st.state !== 'done' ? `<p class="pal-note" style="margin:0">Not filled in Meesho: ${esc(st.missing.join(', '))}. Point to them in the panel once, or fill them there by hand.</p>` : ''}
    </div>`;
  }

  function ready() { return S.products.filter((p) => { const st = S.stat[p.id]; return !(st && st.state === 'done') && !C.problems(tplById(p.tplId), p).length; }); }

  // redraws the page; a change event fired while the old page is being replaced waits for the next turn
  let painting = false;
  function paint() {
    if (!el) return;
    if (painting) { setTimeout(paint, 0); return; }
    painting = true;
    try { paintNow(); } finally { painting = false; }
  }
  function paintNow() {
    const keepY = window.scrollY;
    if (S.templates.length && !tplById(S.defTpl)) S.defTpl = S.templates[0].id;
    const r = ready(), done = S.products.filter((p) => S.stat[p.id] && S.stat[p.id].state === 'done').length;
    el.innerHTML = `<div class="pal">
      <div class="page-head"><div><h1 class="page-title">Auto listing</h1><p class="page-sub">Fill Meesho's catalogue form in one click: details, sizes, prices, stock and photos, from a template you save once.</p></div></div>
      <section class="paper pal-card"><ol class="pal-steps">
        <li><b>Save a template</b>Fill one product in Meesho and tap Save in the PakkaBill panel, or make one below.</li>
        <li><b>Add products</b>Photos, name, colour and anything that differs. One photo set per product.</li>
        <li><b>Fill in Meesho</b>Open Add Single Catalog, tap Fill in the PakkaBill panel, check and submit.</li>
      </ol>${extHtml()}</section>
      ${S.edit ? editorHtml() : ''}
      <section class="paper pal-card" aria-labelledby="pal-t-h"><div class="pal-head"><h2 id="pal-t-h" style="margin:0">Templates</h2>
        <div class="pal-row"><label class="pal-sr" for="pal-start">Start from</label><select id="pal-start" style="width:auto" data-start><option value="">New template from…</option><option value="blouse">Readymade blouse</option><option value="saree">Saree</option><option value="kurti">Kurti</option><option value="blank">Blank</option></select></div></div>
        ${S.templates.length ? `<div class="pal-tpls">${S.templates.map(tplCard).join('')}</div>` : '<p class="pal-note" style="margin:0">No templates yet. The quickest way: in Meesho, fill one product by hand and tap <b>Save this form as a template</b> in the PakkaBill panel. It appears here.</p>'}
        ${!pro() ? `<p class="pal-note">Free plan: ${FREE_TPL} template and ${FREE_SEND} products at a time. <button type="button" class="pal-link" data-pro>Pro: unlimited</button></p>` : ''}
      </section>
      <section class="paper pal-card" aria-labelledby="pal-p-h"><div class="pal-head"><h2 id="pal-p-h" style="margin:0">Products</h2>${S.products.length ? `<span class="pal-note" style="margin:0">${S.products.length} products · ${done} submitted</span>` : ''}</div>
        ${S.templates.length ? `<div class="pal-row" style="margin-bottom:10px"><label style="display:flex;gap:6px;align-items:center;font-size:14px">Template for new products<select style="width:auto" data-deftpl>${S.templates.map((t) => `<option value="${t.id}"${t.id === S.defTpl ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
          <label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" style="width:auto" data-perphoto${S.perPhoto ? ' checked' : ''}> One product per photo</label></div>
        <label class="pal-drop" data-drop><b>📷 Add product photos</b><span>${S.perPhoto ? 'Each photo becomes a product. Add more photos to a product later.' : 'All photos you pick now become one product (front photo first).'}</span><input type="file" accept="image/*" multiple class="pal-sr" data-files></label>` : '<p class="pal-note" style="margin:0">Make a template first; products use it.</p>'}
        <div class="pal-prods">${S.products.map(prodHtml).join('')}</div>
        ${S.products.length ? `<div class="pal-send"><span><b>${r.length}</b> ready to fill${S.products.length - r.length - done > 0 ? ` · ${S.products.length - r.length - done} need something` : ''}</span><span class="pal-row">${done ? '<button type="button" class="pal-link" data-cleardone>Remove submitted</button>' : ''}<button type="button" class="pal-btn" data-send${r.length && S.ext && !verLess(S.ext, NEED) ? '' : ' disabled'}>Send ${r.length || ''} to Meesho</button></span></div>
          ${!S.ext ? '<p class="pal-note">Get PakkaBill Lens (above) on a laptop to send products to Meesho.</p>' : ''}` : ''}
      </section></div>`;
    window.scrollTo(0, keepY);
    wire();
    el.querySelectorAll('img[data-ph]').forEach(async (img) => { const p = await getPhoto(img.dataset.ph); if (p) img.src = p.data; });
  }

  const findP = (id) => S.products.find((p) => p.id === id);
  async function addPhotos(files, toProduct) {
    files = [...files].filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    const got = [];
    for (const f of files) { try { const p = await readPhoto(f); await putPhoto(p); S.photos.set(p.id, p); got.push({ p, f }); } catch (e) { toast(`${f.name} could not be read as a photo.`); } }
    if (toProduct) { const p = findP(toProduct); if (p) p.photos = p.photos.concat(got.map((x) => x.p.id)).slice(0, 10); }
    else if (S.perPhoto) got.forEach(({ p, f }) => S.products.push({ id: uid('p'), tplId: S.defTpl, name: nameFromFile(f.name), color: '', sku: '', price: '', mrp: '', stock: '', photos: [p.id], createdAt: Date.now() }));
    else if (got.length) S.products.push({ id: uid('p'), tplId: S.defTpl, name: nameFromFile(got[0].f.name), color: '', sku: '', price: '', mrp: '', stock: '', photos: got.map((x) => x.p.id).slice(0, 10), createdAt: Date.now() });
    save(); paint();
  }

  async function send() {
    let list = ready();
    if (!pro() && list.length > FREE_SEND) { toast(`Free plan: ${FREE_SEND} products at a time. Sending the first ${FREE_SEND}.`); list = list.slice(0, FREE_SEND); }
    const items = [];
    for (const p of list) {
      const photos = [];
      for (const id of p.photos) { const ph = await getPhoto(id); if (ph) photos.push({ name: ph.name, data: ph.data }); }
      items.push({ id: p.id, tpl: tplById(p.tplId), prod: { name: p.name, color: p.color, sku: p.sku, price: p.price, mrp: p.mrp, stock: p.stock, photos } });
      p.sent = Date.now();
    }
    pushTemplates();
    post({ type: 'pb-list-queue', items, fresh: true });
    save(); paint();
    toast(`${items.length} product${items.length > 1 ? 's' : ''} sent. In Meesho, open Catalog Upload → Add Single Catalog and tap Fill in the PakkaBill panel.`);
  }

  function wire() {
    const q = (s) => el.querySelector(s), qa = (s) => el.querySelectorAll(s);
    const on = (s, ev, fn) => qa(s).forEach((n) => n.addEventListener(ev, fn));
    // templates
    on('[data-start]', 'change', (e) => {
      const k = e.target.value; e.target.value = '';
      if (!k) return;
      if (!pro() && S.templates.length >= FREE_TPL) { if (root.pbUpgrade) root.pbUpgrade('autolist'); return; }
      S.edit = starter(k); paint(); el.querySelector('.pal-ed').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    on('[data-edit]', 'click', (e) => { S.edit = JSON.parse(JSON.stringify(tplById(e.currentTarget.dataset.edit))); S.edit.fields = S.edit.fields || []; S.edit.sizes = S.edit.sizes || []; paint(); el.querySelector('.pal-ed').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    on('[data-copy]', 'click', (e) => {
      if (!pro() && S.templates.length >= FREE_TPL) { if (root.pbUpgrade) root.pbUpgrade('autolist'); return; }
      const t = JSON.parse(JSON.stringify(tplById(e.currentTarget.dataset.copy)));
      S.edit = { ...t, id: uid('t'), name: t.name + ' (copy)', source: 'pakkabill', updatedAt: Date.now() }; paint();
    });
    on('[data-deltpl]', 'click', (e) => {
      const id = e.currentTarget.dataset.deltpl, t = tplById(id), n = S.products.filter((p) => p.tplId === id).length;
      if (!confirm(`Delete the template "${t.name}"?${n ? ` ${n} product${n > 1 ? 's use' : ' uses'} it.` : ''}`)) return;
      S.templates = S.templates.filter((x) => x.id !== id); S.removed.push(id);
      save(); pushTemplates(); paint();
    });
    on('[data-pro]', 'click', () => root.pbUpgrade && root.pbUpgrade('autolist'));
    // the editor: typing changes the copy being edited; structure changes redraw
    if (S.edit) {
      const t = S.edit;
      on('[data-t]', 'input', (e) => { t[e.target.dataset.t] = e.target.value; });
      on('[data-sz]', 'input', (e) => { t.sizes[+e.target.dataset.sz][e.target.dataset.k] = e.target.value.trim(); });
      on('[data-fl]', 'input', (e) => { t.fields[+e.target.dataset.fl][e.target.dataset.k] = e.target.value; });
      on('[data-addsz]', 'click', (e) => { const z = e.currentTarget.dataset.addsz; const prev = t.sizes[t.sizes.length - 1] || {}; t.sizes.push({ size: z, price: prev.price || '', rprice: prev.rprice || '', mrp: prev.mrp || '', stock: prev.stock || '' }); t.sizes = C.sortSizes(t.sizes); paint(); });
      on('[data-samesz]', 'click', () => { const a = t.sizes[0]; t.sizes.forEach((s) => { s.price = a.price; s.rprice = a.rprice; s.mrp = a.mrp; s.stock = a.stock; }); paint(); });
      on('[data-delsz]', 'click', (e) => { t.sizes.splice(+e.currentTarget.dataset.delsz, 1); paint(); });
      on('[data-addfl]', 'click', () => { t.fields.push({ label: '', value: '' }); paint(); const ins = el.querySelectorAll('[data-fl][data-k=label]'); if (ins.length) ins[ins.length - 1].focus(); });
      on('[data-delfl]', 'click', (e) => { t.fields.splice(+e.currentTarget.dataset.delfl, 1); paint(); });
      on('[data-cancel]', 'click', () => { S.edit = null; paint(); });
      on('[data-savetpl]', 'click', () => {
        t.name = (t.name || '').trim() || 'Template';
        t.fields = t.fields.filter((f) => f.label && f.label.trim()).map((f) => ({ ...f, label: f.label.trim(), value: String(f.value || '').trim() }));
        t.sizes = C.sortSizes(t.sizes.filter((s) => s.size && s.size.trim()));
        t.updatedAt = Date.now();
        const i = S.templates.findIndex((x) => x.id === t.id);
        if (i >= 0) S.templates[i] = t; else S.templates.push(t);
        if (!S.defTpl) S.defTpl = t.id;
        S.edit = null; save(); pushTemplates(); paint();
        toast(`Template "${t.name}" saved.`);
      });
    }
    // products
    on('[data-deftpl]', 'change', (e) => { S.defTpl = e.target.value; save(); });
    on('[data-perphoto]', 'change', (e) => { S.perPhoto = e.target.checked; save(); paint(); });
    on('[data-files]', 'change', (e) => addPhotos(e.target.files));
    const drop = q('[data-drop]');
    if (drop) {
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addPhotos(e.dataTransfer.files); });
    }
    on('[data-addph]', 'change', (e) => addPhotos(e.target.files, e.target.dataset.addph));
    on('[data-delph]', 'click', (e) => { const [pid, id] = e.currentTarget.dataset.delph.split('|'); const p = findP(pid); p.photos = p.photos.filter((x) => x !== id); if (!S.products.some((x) => x.photos.includes(id))) delPhoto(id); save(); paint(); });
    on('[data-delp]', 'click', (e) => { const p = findP(e.currentTarget.dataset.delp); S.products = S.products.filter((x) => x !== p); p.photos.forEach((id) => { if (!S.products.some((x) => x.photos.includes(id))) delPhoto(id); }); save(); paint(); });
    on('[data-pf]', 'input', (e) => { const p = findP(e.target.closest('[data-p]').dataset.p); p[e.target.dataset.pf] = e.target.value; save(); });
    on('[data-pf]', 'change', () => paint());
    on('[data-cleardone]', 'click', () => {
      const gone = S.products.filter((p) => S.stat[p.id] && S.stat[p.id].state === 'done');
      S.products = S.products.filter((p) => !gone.includes(p));
      gone.forEach((p) => p.photos.forEach((id) => { if (!S.products.some((x) => x.photos.includes(id))) delPhoto(id); }));
      save(); paint();
    });
    on('[data-send]', 'click', send);
  }

  root.pbAutoListMount = function (target) {
    if (!document.getElementById('pal-css')) { const st = document.createElement('style'); st.id = 'pal-css'; st.textContent = CSS; document.head.appendChild(st); }
    if (el === target && el.childNodes.length) return;
    el = target;
    paint();
    post({ type: 'pb-list-hello' }); // PakkaBill Lens answers when installed
  };
})();
