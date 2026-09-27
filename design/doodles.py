#!/usr/bin/env python3
"""Draws PakkaBill's background doodle tile (e-commerce and GST line icons, WhatsApp-style)
and prints the CSS that uses it. Run: python3 design/doodles.py > design/doodles.css"""
import sys, urllib.parse

TILE = 420
# Each icon is drawn in a 40x40 box around (0,0)-(40,40); placed with translate/rotate/scale.
I = {
 'bag':    '<path d="M8 13h24l-2 23H10z"/><path d="M14 13v-3a6 6 0 0 1 12 0v3"/><path d="M15 20a5 5 0 0 0 10 0"/>',
 'cart':   '<path d="M3 6h5l4 20h20l3-14H10"/><circle cx="14" cy="33" r="2.6"/><circle cx="29" cy="33" r="2.6"/>',
 'receipt':'<path d="M9 4h22v32l-3.7-2.5-3.6 2.5-3.7-2.5-3.7 2.5-3.6-2.5L9 36z"/><path d="M14 12h12M14 18h12M14 24h7"/>',
 'coin':   '<circle cx="20" cy="20" r="15"/><path d="M14 13h12M14 18h12M14 23h4c7 0 7-10 0-10M14 23l9 8"/>',
 'tag':    '<path d="M22 4h13v13L18 34a3 3 0 0 1-4 0L6 26a3 3 0 0 1 0-4z"/><circle cx="29" cy="10.5" r="2"/><path d="M13 25l8-8"/><circle cx="14" cy="19" r="1.4"/><circle cx="20" cy="25" r="1.4"/>',
 'box':    '<path d="M20 4 35 11v18L20 36 5 29V11z"/><path d="M5 11l15 7 15-7M20 18v18M12.5 7.5l15 7"/>',
 'truck':  '<path d="M3 11h20v16H3zM23 16h7l6 6v5H23z"/><circle cx="10" cy="30" r="3.2"/><circle cx="29" cy="30" r="3.2"/>',
 'calc':   '<rect x="8" y="3" width="24" height="34" rx="3"/><path d="M13 9h14v6H13z"/><path d="M14 21h.1M20 21h.1M26 21h.1M14 26h.1M20 26h.1M26 26h.1M14 31h.1M20 31h.1M26 31h.1" stroke-width="3.2"/>',
 'gst':    '<rect x="2" y="9" width="36" height="22" rx="5"/><path d="M13 16.2a4 4 0 1 0 0 7.6V20.5h-2.5M22.6 16.6c-.7-.7-1.5-.9-2.3-.9-1.3 0-2.2.8-2.2 1.8 0 2.6 4.8 1.6 4.8 4.4 0 1.1-1 1.9-2.4 1.9-.9 0-1.8-.3-2.5-1M26.5 16h6M29.5 16v8" stroke-width="1.8"/>',
 'qr':     '<rect x="5" y="5" width="11" height="11" rx="1.5"/><rect x="24" y="5" width="11" height="11" rx="1.5"/><rect x="5" y="24" width="11" height="11" rx="1.5"/><path d="M24 24h4v4M35 24v4M24 33v2h5M33 31v4h2M29 29h2"/>',
 'barcode':'<path d="M5 8v24M9 8v24M12 8v24M17 8v24M20 8v24M25 8v24M28 8v24M31 8v24M35 8v24"/>',
 'hanger': '<path d="M20 12a4 4 0 1 1 4-4"/><path d="M20 12v3L4 27a2 2 0 0 0 1 3.5h30A2 2 0 0 0 36 27L20 15"/>',
 'blouse': '<path d="M14 5c1 3 3 5 6 5s5-2 6-5l9 5-4 7-4-2v18H11V15l-4 2-4-7z"/><path d="M17 5.5c1 2 2 2.8 3 2.8s2-.8 3-2.8"/>',
 'pie':    '<path d="M20 5a15 15 0 1 0 15 15H20z"/><path d="M24 2v14h14A14 14 0 0 0 24 2z"/>',
 'chart':  '<path d="M4 4v32h32"/><path d="M11 28v-6M18 28v-11M25 28v-8M32 28V11"/><path d="M9 16l8-7 7 5 10-9M29 5h5v5"/>',
 'cal':    '<rect x="5" y="8" width="30" height="27" rx="3"/><path d="M5 16h30M13 4v8M27 4v8"/><path d="M12 23h.1M20 23h.1M28 23h.1M12 29h.1M20 29h.1" stroke-width="3.2"/>',
 'clip':   '<rect x="7" y="6" width="26" height="31" rx="3"/><path d="M15 3h10v6H15z"/><path d="M12 18l2 2 4-4M21 18h7M12 27l2 2 4-4M21 27h7"/>',
 'store':  '<path d="M4 15 7 5h26l3 10"/><path d="M6 15v20h28V15"/><path d="M4 15a4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0"/><path d="M16 35v-9h8v9"/>',
 'coins':  '<ellipse cx="20" cy="10" rx="12" ry="4.5"/><path d="M8 10v6c0 2.5 5.4 4.5 12 4.5S32 18.5 32 16v-6M8 16v6c0 2.5 5.4 4.5 12 4.5S32 24.5 32 22v-6M8 22v6c0 2.5 5.4 4.5 12 4.5S32 30.5 32 28v-6"/>',
 'star':   '<path d="M20 4l4.7 9.6 10.6 1.5-7.7 7.5 1.8 10.5L20 28.1l-9.4 5 1.8-10.5-7.7-7.5 10.6-1.5z"/>',
 'phone':  '<rect x="10" y="3" width="20" height="34" rx="4"/><path d="M17 32h6"/><path d="M16 11h8M16 15h8M16 19h2.5c4.5 0 4.5-8 0-8M16 19l6 6" stroke-width="1.8"/>',
 'percent':'<path d="M31 9 9 31"/><circle cx="11.5" cy="11.5" r="4.5"/><circle cx="28.5" cy="28.5" r="4.5"/>',
 'heart':  '<path d="M20 34S5 25 5 14.5A7.5 7.5 0 0 1 20 11a7.5 7.5 0 0 1 15 3.5C35 25 20 34 20 34z"/>',
 'invoice':'<path d="M9 3h16l7 7v27H9z"/><path d="M25 3v7h7M14 17h13M14 22h13M14 27h8"/><path d="M26 30h1" stroke-width="3"/>',
 'scissor':'<circle cx="9" cy="30" r="4.5"/><circle cx="22" cy="33" r="4.5"/><path d="M12 27 30 5M19 29 30 9"/>',
 'mega':   '<path d="M5 16v8h6l14 8V8L11 16z"/><path d="M11 24l3 10h4l-2-10M30 14a6 6 0 0 1 0 12"/>',
}
# Seamless scatter: icons are placed by a seeded Poisson-disk walk on a torus, so spacing is even
# everywhere, and anything that crosses an edge is drawn again on the opposite side.
import random
TILE = 300
ICON_PX = (21, 27)      # drawn size of an icon on screen
GAP = 37                # minimum distance between icon centres
BIT_GAP = 18            # minimum distance for the small dots, rings and sparkles
STROKE = 1.35           # on-screen line width

def torus_d(a, b):
    dx = abs(a[0] - b[0]); dy = abs(a[1] - b[1])
    dx = min(dx, TILE - dx); dy = min(dy, TILE - dy)
    return (dx * dx + dy * dy) ** 0.5

def scatter(rng, gap, existing, tries=4000):
    pts = []
    for _ in range(tries):
        c = (rng.uniform(0, TILE), rng.uniform(0, TILE))
        if all(torus_d(c, q) >= gap for q in pts) and all(torus_d(c, q) >= gap * 0.62 + 9 for q in existing):
            pts.append(c)
    return pts

def wrapped(x, y, reach, draw):
    out = []
    for ox in (-TILE, 0, TILE):
        for oy in (-TILE, 0, TILE):
            X, Y = x + ox, y + oy
            if -reach <= X <= TILE + reach and -reach <= Y <= TILE + reach:
                out.append(draw(X, Y))
    return out

def bit(kind, x, y):
    if kind == 'dot': return f'<circle cx="{x}" cy="{y}" r="1.5" fill="C" stroke="none"/>'
    if kind == 'ring': return f'<circle cx="{x}" cy="{y}" r="2.8"/>'
    if kind == 'spark': return f'<path d="M{x} {y-4}v8M{x-4} {y}h8" stroke-width="1.2"/>'
    return f'<path d="M{x-6} {y}q2-3.2 4 0t4 0 4 0" stroke-width="1.2"/>'

def tile(color, alpha):
    rng = random.Random(20260927)
    names = list(I.keys())
    centres = scatter(rng, GAP, [])
    rng.shuffle(names)
    body = []
    for k, (x, y) in enumerate(centres):
        name = names[k % len(names)]
        px = rng.uniform(*ICON_PX); sc = px / 40.0; rot = rng.uniform(-28, 28)
        sw = round(STROKE / sc, 2)
        def draw(X, Y, name=name, sc=sc, rot=rot, sw=sw):
            return (f'<use href="#{name}" transform="translate({X - 20 * sc:.1f} {Y - 20 * sc:.1f}) rotate({rot:.0f} {20 * sc:.1f} {20 * sc:.1f}) scale({sc:.3f})" stroke-width="{sw}"/>')
        body += wrapped(x, y, 20, draw)
    kinds = ['dot', 'ring', 'dot', 'spark', 'dot', 'squig', 'ring', 'dot']
    for k, (x, y) in enumerate(scatter(rng, BIT_GAP, centres)):
        kind = kinds[k % len(kinds)]
        body += wrapped(x, y, 8, lambda X, Y, kind=kind: bit(kind, round(X, 1), round(Y, 1)))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{TILE}" height="{TILE}" viewBox="0 0 {TILE} {TILE}">'
            '<defs>' + ''.join(f'<g id="{k}">{v}</g>' for k, v in I.items()) + '</defs>'
            f'<g fill="none" stroke="{color}" stroke-opacity="{alpha}" fill-opacity="{alpha}" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">'
            + ''.join(body).replace('fill="C"', f'fill="{color}"') + '</g></svg>')

def uri(svg):
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" /:=,;()'.-") + '")'

LIGHT = tile('#5b3fd6', 0.15)
DARK = tile('#c8b6ff', 0.12)
if len(sys.argv) > 1 and sys.argv[1] == 'svg':
    print(LIGHT if sys.argv[2:] != ['dark'] else DARK); sys.exit()
css = (':root{--doodle:' + uri(LIGHT) + ';--doodle-size:' + str(TILE) + 'px}'
       '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--doodle:' + uri(DARK) + '}}'
       ':root[data-theme=dark]{--doodle:' + uri(DARK) + '}'
       '@media screen{body{background-image:var(--glow),var(--doodle);background-size:auto,var(--doodle-size);background-repeat:no-repeat,repeat;background-attachment:fixed,fixed}.spine{background-image:var(--doodle);background-size:var(--doodle-size);background-attachment:fixed}}'
       ''
       '@media print{body{background-image:none!important}}')
print(css, end='')
