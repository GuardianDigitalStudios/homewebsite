#!/usr/bin/env node
// Lightweight sanity checks for the static site. Run before committing:
//   node scripts/sanity-check.mjs
//
// Shared, near-verbatim, with the commander-index repo's copy. Both sites are
// the same shape: static HTML, one stylesheet, one script, no build step. If
// you fix a bug in one, carry it across.
//
// Pure Node, no dependencies. Exits non-zero on any failure.
//
// Checks:
//   1. Every .js file parses (classic-script semantics via vm.Script).
//   2. Every .mjs file parses (`node --check`, ES-module-aware).
//   3. Every inline <script> (non-module, no src) parses.
//   4. Every local <script src=>, <link href=>, and href to a *.html resolves.
//   5. Every onclick/onfoo handler references a function defined somewhere
//      in the project's JS surface (or a known browser/JS builtin).

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Vendored or non-source directories we should not lint.
//
// design-system/ is deliberately NOT skipped. Those pages are checked like any
// other: they are the reference for how the site is built, and a component
// preview pointing at a stylesheet that moved is exactly the kind of quiet rot
// this script exists to catch. They are excluded from the deploy, not the lint.
const SKIP_DIR_RELS = [
  '.git',
  'node_modules',
];

function isUnderSkipDir(rel) {
  return SKIP_DIR_RELS.some(d => rel === d || rel.startsWith(d + sep));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(REPO_ROOT, full);
    if (isUnderSkipDir(rel)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL_FILES  = walk(REPO_ROOT);
const HTML_FILES = ALL_FILES.filter(f => f.endsWith('.html'));
const JS_FILES   = ALL_FILES.filter(f => f.endsWith('.js'));
const MJS_FILES  = ALL_FILES.filter(f => f.endsWith('.mjs'));

const failures = [];
function fail(file, msg) {
  failures.push({ file: relative(REPO_ROOT, file), msg });
}

function checkAsModule(code) {
  // node --check requires a file path; write a temp .mjs.
  const tmp = join(tmpdir(), `sanity-check-${process.pid}-${Math.random().toString(36).slice(2, 8)}.mjs`);
  writeFileSync(tmp, code);
  try {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    if (r.status === 0) return null;
    return ((r.stderr || r.stdout || '').split('\n').find(Boolean) || 'parse failure');
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ── 1. .js syntax (classic if no module syntax, ESM otherwise) ──────────
for (const f of JS_FILES) {
  const code = readFileSync(f, 'utf8');
  if (/^\s*(?:export|import)\b/m.test(code)) {
    const err = checkAsModule(code);
    if (err) fail(f, `JS module parse error: ${err}`);
    continue;
  }
  try {
    new vm.Script(code, { filename: relative(REPO_ROOT, f) });
  } catch (e) {
    fail(f, `JS parse error: ${String(e.message).split('\n')[0]}`);
  }
}

// ── 2. .mjs syntax via node --check ─────────────────────────────────────
for (const f of MJS_FILES) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || 'unknown error').split('\n').find(Boolean) || 'unknown';
    fail(f, `MJS parse error: ${msg}`);
  }
}

// ── 3. Inline <script> blocks ───────────────────────────────────────────
const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function isModuleScript(attrs) {
  return /\btype\s*=\s*["']?(module|importmap|application\/json|application\/ld\+json)/i.test(attrs);
}

for (const f of HTML_FILES) {
  const html = readFileSync(f, 'utf8');
  let m;
  let i = 0;
  SCRIPT_BLOCK_RE.lastIndex = 0;
  while ((m = SCRIPT_BLOCK_RE.exec(html)) !== null) {
    i += 1;
    const attrs = m[1];
    const body  = m[2];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (isModuleScript(attrs))   continue;
    if (!body.trim())            continue;
    try {
      new vm.Script(body, { filename: `${relative(REPO_ROOT, f)}<script#${i}>` });
    } catch (e) {
      fail(f, `inline <script #${i}> parse error: ${String(e.message).split('\n')[0]}`);
    }
  }
}

// ── 4. Local resource paths ─────────────────────────────────────────────
function resolveLocal(fileDir, p) {
  const clean = p.replace(/[?#].*$/, '');
  if (!clean) return null;
  if (/^[a-z]+:\/\//i.test(clean) || clean.startsWith('//')) return null;
  if (clean.startsWith('mailto:') || clean.startsWith('tel:') || clean.startsWith('javascript:')) return null;
  if (clean.startsWith('#')) return null;
  return clean.startsWith('/') ? join(REPO_ROOT, clean.slice(1)) : resolve(fileDir, clean);
}

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const LINK_HREF_RE  = /<link\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const A_HREF_RE     = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

for (const f of HTML_FILES) {
  const html = readFileSync(f, 'utf8');
  const dir  = dirname(f);
  for (const { re, label, htmlOnly } of [
    { re: SCRIPT_SRC_RE, label: 'script src', htmlOnly: false },
    { re: LINK_HREF_RE,  label: 'link href',  htmlOnly: false },
    { re: A_HREF_RE,     label: 'a href',     htmlOnly: true  },
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[1] || m[2];
      const abs = resolveLocal(dir, url);
      if (!abs) continue;
      // Anchors point at lots of things (assets, pdfs); only verify .html targets.
      if (htmlOnly && !/\.html$/i.test(url.replace(/[?#].*$/, ''))) continue;
      if (!existsSync(abs)) fail(f, `broken ${label}: "${url}"`);
    }
  }
}

// ── 5. Event-handler reference integrity ────────────────────────────────
const DEFINED = new Set();

function harvestDefinitions(code) {
  for (const m of code.matchAll(/(?:^|[^.\w$])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) DEFINED.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) DEFINED.add(m[1]);
  for (const m of code.matchAll(/\b(?:window|self|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g)) DEFINED.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{\s*([^}]+)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(/[:\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(id)) DEFINED.add(id);
    }
  }
}

for (const f of JS_FILES) harvestDefinitions(readFileSync(f, 'utf8'));
for (const f of HTML_FILES) {
  const html = readFileSync(f, 'utf8');
  let m;
  SCRIPT_BLOCK_RE.lastIndex = 0;
  while ((m = SCRIPT_BLOCK_RE.exec(html)) !== null) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/type\s*=\s*["']?(importmap|application\/(?:json|ld\+json))/i.test(attrs)) continue;
    harvestDefinitions(m[2]);
  }
}

const BUILTINS = new Set([
  // Keywords / pseudo-keywords
  'if','else','for','while','do','switch','case','return','throw','new','typeof','instanceof','delete',
  'void','await','async','try','catch','finally','in','of','yield','this','super','class','extends',
  'export','import','default','break','continue','let','const','var','function','true','false','null','undefined',
  // Globals
  'window','document','console','navigator','location','history','self','globalThis','event','top','parent',
  'frames','screen','localStorage','sessionStorage','crypto','performance','indexedDB','caches','origin',
  // Timers / scheduling
  'setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame','queueMicrotask',
  // Built-in constructors
  'Array','Object','String','Number','Boolean','Date','RegExp','Error','TypeError','RangeError','SyntaxError',
  'Promise','Map','Set','WeakMap','WeakSet','Symbol','BigInt','Function','Proxy','Reflect',
  // Util fns / namespaces
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI',
  'JSON','Math','eval','structuredClone','atob','btoa',
  // Browser APIs
  'alert','confirm','prompt','fetch','URL','URLSearchParams','FormData','Blob','File','FileReader',
  'Image','Audio','Worker','SharedWorker','MessageChannel','BroadcastChannel','Notification','Intl',
  'Element','HTMLElement','Node','NodeList','MutationObserver','IntersectionObserver','ResizeObserver',
  'AbortController','AbortSignal','Headers','Request','Response','EventSource','WebSocket','Range',
  // Inline-handler pseudo-globals
  'arguments',
]);

const HANDLER_ATTR_RE = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CALL_RE = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;

for (const f of HTML_FILES) {
  const html = readFileSync(f, 'utf8');
  HANDLER_ATTR_RE.lastIndex = 0;
  let h;
  while ((h = HANDLER_ATTR_RE.exec(html)) !== null) {
    const expr = h[1] || h[2];
    if (!expr) continue;
    CALL_RE.lastIndex = 0;
    let c;
    while ((c = CALL_RE.exec(expr)) !== null) {
      const name = c[1];
      if (BUILTINS.has(name)) continue;
      if (DEFINED.has(name))  continue;
      fail(f, `handler refs unknown function: ${name}() in "${expr.slice(0, 80)}"`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────
const summary = `${HTML_FILES.length} HTML, ${JS_FILES.length} JS, ${MJS_FILES.length} MJS`;
if (failures.length === 0) {
  console.log(`OK sanity-check: ${summary} — clean`);
  process.exit(0);
}

console.log(`FAIL sanity-check: ${failures.length} issue(s) across ${summary}\n`);
for (const { file, msg } of failures) console.log(`  ${file}: ${msg}`);
process.exit(1);
