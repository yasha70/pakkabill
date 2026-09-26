#!/usr/bin/env python3
"""Builds ../lens.js (PakkaBill's Meesho Lens page) and ../pakkabill-lens.zip (the extension)
from the files in this folder. Run from anywhere: python3 lens/build.py"""
import json, os, subprocess, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
read = lambda n: open(os.path.join(HERE, n), encoding='utf-8').read()

core, page = read('core.js'), read('page.js')
# The phone bookmark carries its own copy of core.js: comments stripped (bookmark addresses
# lose their line breaks) and every statement ended with a semicolon by the TypeScript printer.
bm = subprocess.run(['node', '-e', '''
const ts = require('typescript'); let src = '';
process.stdin.on('data', d => src += d).on('end', () => {
  const out = ts.transpileModule(src, { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ES2018 } }).outputText;
  process.stdout.write(out.split('\\n').map(s => s.trim()).filter(Boolean).join(' '));
});'''], input=core.replace("if (typeof module !== 'undefined') module.exports = PBLensCore;", ''), capture_output=True, text=True, check=True,
    env={**os.environ, 'NODE_PATH': subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()}).stdout
assert 'PBLensCore' in bm and '\n' not in bm and 'module' not in bm

js = ('// PakkaBill: Meesho Lens page. Built by lens/build.py from lens/core.js and lens/page.js; edit those.\n'
      '(function () {\n' + core + '\nvar PBL_BM_CORE = ' + json.dumps(bm, ensure_ascii=False) + ';\n' + page + '\n})();\n')
open(os.path.join(ROOT, 'lens.js'), 'w', encoding='utf-8').write(js)

files = ['manifest.json', 'core.js', 'content.js', 'bridge.js', 'popup.html', 'popup.js', 'README.txt']
with zipfile.ZipFile(os.path.join(ROOT, 'pakkabill-lens.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        info = zipfile.ZipInfo('pakkabill-lens/' + f, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, read(f))
print('lens.js', len(js), 'bytes; bookmark core', len(bm), 'bytes; zip', os.path.getsize(os.path.join(ROOT, 'pakkabill-lens.zip')), 'bytes')
