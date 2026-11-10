// Builds the website's tool engines for the Android app, so the app and the website always work
// out the same numbers. Each engine (the part of a tool with no browser page in it) is taken from the
// website's own files, made ES5 with Babel (the app runs JavaScript in Rhino, which does not read
// every newer form), and written to <out>/pakkabill/tools/. Run by Gradle (:core:buildEngines).
//
//   labels.js    PBL         labels.html   reading Meesho labels and the manifest, sorting, packing chart
//   g1check.js   PBG1        gstr1check.js GSTR-1 JSON checks, Excel workbook writer, document series
//   g1view.js    PBG1V       gstr1view.js  GSTR-1 statement, TCS report, summary, offline-tool workbook
//   g1build.js   PBG1B       index.html    GSTR-1: reading marketplace reports and building the return
//   lowship.js   PBShip      lowship.js    low shipping image versions
//   lenscore.js  PBLensCore  lens/core.js  Meesho Lens estimates
//   listcore.js  PBListCore  lens/listcore.js  Auto listing templates
//
// The GSTR-1 builder lives inside the website's bundle (index.html). It is found by name, and every
// helper it uses is collected from the bundle with Babel's scope analysis, so nothing is copied by hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { transformSync } from '@babel/core';

const traverse = babelTraverse.default || babelTraverse;
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const testsDir = flag('--tests');
const outDir = path.resolve(args[0] || path.join(here, '..', 'core', 'build', 'generated', 'engines'), 'pakkabill', 'tools');
const read = (f) => fs.readFileSync(path.join(site, f), 'utf8');

function es5(code, name) {
  return transformSync(code, {
    filename: name, sourceType: 'script', compact: false, comments: false, babelrc: false, configFile: false,
    presets: [['@babel/preset-env', { targets: { ie: '11' }, modules: false, exclude: ['transform-typeof-symbol'] }]],
  }).code;
}

// the part of a tool file up to and including the line with `marker`, closed again
function cut(src, marker, close, file) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(`${file}: "${marker}" not found`);
  const j = src.indexOf('\n', i);
  return src.slice(0, j + 1) + close + '\n';
}

const plain = [
  ['labels.js', 'labels.html', (s) => {
    const a = s.indexOf('/* PakkaBill label engine');
    if (a < 0) throw new Error('labels.html: label engine not found');
    return s.slice(a, s.indexOf('</script>', a));
  }],
  ['g1check.js', 'gstr1check.js', (s) => cut(s, 'module.exports = root.PBG1;', '})();', 'gstr1check.js')],
  ['g1view.js', 'gstr1view.js', (s) => cut(s, 'module.exports = root.PBG1V;', '})();', 'gstr1view.js')],
  ['lowship.js', 'lowship.js', (s) => cut(s, 'root.PBShip = engine;', '})();', 'lowship.js')],
  ['lenscore.js', 'lens/core.js', (s) => s],
  ['listcore.js', 'lens/listcore.js', (s) => s],
];

/* ---------------- the GSTR-1 builder from the website's bundle ---------------- */

// Helpers of the bundle that are not plain code: given here instead. Rows come in as arrays already
// (the app reads the spreadsheets itself), so sheet_to_json and the sheet fix are not needed.
const SHIMS = {
  o8: 'function o8(sheet) { return sheet; }',
  pbFixRef: 'function pbFixRef(sheet) { return sheet; }',
};

function gstr1Builder() {
  const html = read('index.html');
  // the app's bundle: the first <script id="pb-app"> (the same text also sits inside the bundle as a string)
  const tag = html.search(/<script[^>]*\bid="pb-app"[^>]*>/);
  const s1 = html.indexOf('>', tag) + 1, s2 = html.indexOf('</script>', s1);
  const code = html.slice(s1, s2);
  if (tag < 0 || code.indexOf('function cF(){') < 0) throw new Error('index.html: GSTR-1 page (function cF) not found in the app bundle');
  const ast = parse(code, { sourceType: 'script', errorRecovery: false, allowReturnOutsideFunction: true });

  let parsePath = null, buildPath = null, carryRows = null, cmPath = null, pagePath = null;
  traverse(ast, {
    FunctionDeclaration(p) {
      const n = p.node.id && p.node.id.name;
      if (n === 'cm') cmPath = p;
      if (n === 'cp') {
        // async function cp(file) { ... return function (book, file) { ...reports... }(book, info) }
        p.traverse({
          ReturnStatement(r) {
            const a = r.node.argument;
            if (r.getFunctionParent() === p && a && a.type === 'CallExpression' && a.callee.type === 'FunctionExpression') parsePath = r.get('argument.callee');
          },
        });
      }
      if (n === 'cF') {
        pagePath = p;
        p.traverse({
          VariableDeclarator(v) {
            const i = v.node.init;
            if (v.node.id.name === 'Z' && i && i.type === 'CallExpression' && i.callee.type === 'FunctionExpression') buildPath = v.get('init.callee');
          },
        });
      }
    },
    VariableDeclarator(p) { if (p.node.id.name === 'pbCarryRows') carryRows = p; },
  });
  if (!parsePath || !buildPath || !cmPath || !carryRows) throw new Error('index.html: GSTR-1 parts not found ' + [!!parsePath, !!buildPath, !!cmPath, !!carryRows]);

  // every declaration of the bundle that the wanted code needs, by name
  const need = new Map(); // name -> {start, text}
  const globals = new Set();
  function visit(path, owner) {
    path.traverse({
      ReferencedIdentifier(r) {
        const name = r.node.name;
        const b = r.scope.getBinding(name);
        if (!b) { globals.add(name); return; }
        // declared inside the wanted code itself (its own variables and parameters)
        if (b.path === owner || b.path.findParent((x) => x === owner)) return;
        add(name, b);
      },
    });
  }
  function add(name, b) {
    if (need.has(name)) return;
    if (SHIMS[name]) { need.set(name, { start: -1, text: SHIMS[name] }); return; }
    const bp = b.path;
    if (bp.isFunctionDeclaration()) {
      need.set(name, { start: bp.node.start, text: code.slice(bp.node.start, bp.node.end) });
      visit(bp, bp);
    } else if (bp.isVariableDeclarator()) {
      const id = bp.node.id, init = bp.node.init;
      const text = 'var ' + code.slice(id.start, id.end) + (init ? ' = ' + code.slice(init.start, init.end) : '') + ';';
      need.set(name, { start: bp.node.start, text });
      if (init) visit(bp.get('init'), bp);
    } else {
      throw new Error(`GSTR-1: helper "${name}" is a ${b.kind} (${bp.type}); add a shim for it in build.mjs`);
    }
  }
  for (const p of [parsePath, buildPath]) visit(p, p);
  add('cm', cmPath.scope.parent.getBinding('cm'));
  add('pbCarryRows', carryRows.scope.getBinding('pbCarryRows'));
  // what the GSTR-1 page itself uses around the builder: operator names and PANs, GSTIN checks, months
  for (const n of ['cg', 'cB', 'cv', 'cb', 'cy', 'cC', 'o7', 'pbEcoPan', 'pbGstin', 'eL', 'eH', 'e1', 'e2', 'eY']) {
    const b = pagePath.scope.getBinding(n);
    if (!b) throw new Error(`GSTR-1: "${n}" not found next to the GSTR-1 page`);
    add(n, b);
  }

  const deps = [...need.entries()].sort((a, b) => a[1].start - b[1].start).map(([, v]) => v.text);
  const parseSrc = code.slice(parsePath.node.start, parsePath.node.end);
  const buildSrc = code.slice(buildPath.node.start, buildPath.node.end);
  const out = [
    '// GSTR-1 from the website (index.html), collected by android/engines/build.mjs. Do not edit here.',
    'var PBG1B = (function () {',
    deps.join('\n'),
    'var parseBook = ' + parseSrc + ';',
    'var build = ' + buildSrc + ';',
    'return { parseBook: parseBook, build: build, series: cm, carryRows: pbCarryRows, kinds: cv, kindNames: cb, kindFiles: cy, docNames: cg,',
    '  marketplaces: cC, ops: o7, opPan: pbEcoPan, opGstin: pbGstin, gstinCheck: eL, gstinClean: eH, monthLabel: e1, addMonths: e2, today: eY,',
    '  states: eQ, stateOf: ci, money: eR };',
    '})();',
  ].join('\n');
  return { code: out, globals: [...globals].sort(), helpers: [...need.keys()] };
}

fs.mkdirSync(outDir, { recursive: true });
for (const [name, file, pick] of plain) {
  const src = pick(read(file));
  fs.writeFileSync(path.join(outDir, name), `// ${file}, made ES5 by android/engines/build.mjs. Do not edit here.\n` + es5(src, name));
}
const g = gstr1Builder();
fs.writeFileSync(path.join(outDir, 'g1build.js'), es5(g.code, 'g1build.js'));
// The website's own tests of these engines, made ES5 the same way, so the app's tests run them in Rhino.
if (testsDir) {
  const tdir = path.resolve(testsDir, 'pakkabill', 'audits');
  fs.mkdirSync(tdir, { recursive: true });
  for (const t of ['labels-audit.js', 'gstr1-audit.js', 'gstr1view-audit.js', 'autolist-audit.js']) {
    fs.writeFileSync(path.join(tdir, t), es5(read('test/' + t), t));
  }
}
if (process.env.ENGINES_VERBOSE) console.log('GSTR-1 helpers:', g.helpers.join(' '), '\nglobals:', g.globals.join(' '));
console.log(`engines: ${plain.length + 1} files in ${path.relative(process.cwd(), outDir)}`);
