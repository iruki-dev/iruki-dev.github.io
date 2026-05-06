/**
 * Local admin server — npm run admin
 * Runs on http://localhost:4000
 * Reads/writes directly to the project. No auth, no API calls.
 *
 * Sections:
 *   • Posts        — markdown blog editor (with toolbar + live preview)
 *   • Projects     — markdown project editor
 *   • Pages        — visual block-based web page builder
 *   • Navigation   — header link editor
 *   • Site         — site metadata
 *   • Media        — image library (upload / copy URL / delete)
 */

import { createServer } from 'node:http';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  rmdirSync,
} from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIRS = {
  content: join(ROOT, 'content'),
  pages: join(ROOT, 'content', 'pages'),
  config: join(ROOT, 'config'),
  uploads: join(ROOT, 'public', 'uploads'),
};
const COLLECTIONS_FILE = 'collections.json';
const PORT = 4000;
const RESERVED_NAMES = new Set(['pages', 'config']);

const collectionDir = (name) => join(DIRS.content, name);

// ── Frontmatter (markdown) ───────────────────────────────────
function parseFM(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true') { data[k] = true; continue; }
    if (v === 'false') { data[k] = false; continue; }
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      data[k] = inner ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')) : [];
      continue;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[k] = v;
  }
  return { data, body: m[2].trim() };
}

function buildFM(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'boolean') { lines.push(`${k}: ${v}`); continue; }
    if (Array.isArray(v)) {
      const items = v.filter(Boolean);
      if (items.length) lines.push(`${k}: [${items.map(s => `"${s}"`).join(', ')}]`);
      continue;
    }
    lines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
  }
  lines.push('---', '', body || '');
  return lines.join('\n');
}

// ── Markdown content (any collection) ────────────────────────
function listMd(collection) {
  const dir = collectionDir(collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /\.mdx?$/.test(f))
    .map(f => {
      const slug = f.replace(/\.mdx?$/, '');
      const { data, body } = parseFM(readFileSync(join(dir, f), 'utf8'));
      return { slug, words: (body || '').split(/\s+/).filter(Boolean).length, ...data };
    })
    .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
}

function getMd(collection, slug) {
  const filePath = join(collectionDir(collection), `${slug}.md`);
  if (!existsSync(filePath)) return null;
  const { data, body } = parseFM(readFileSync(filePath, 'utf8'));
  return { slug, data, body };
}

function saveMd(collection, slug, data, body) {
  mkdirSync(collectionDir(collection), { recursive: true });
  writeFileSync(join(collectionDir(collection), `${slug}.md`), buildFM(data, body), 'utf8');
}

function deleteMd(collection, slug) {
  const filePath = join(collectionDir(collection), `${slug}.md`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ── Collection definitions (config/collections.json) ─────────
function readCollections() {
  const p = join(DIRS.config, COLLECTIONS_FILE);
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(j.collections) ? j.collections : [];
  } catch {
    return [];
  }
}

function writeCollections(list) {
  mkdirSync(DIRS.config, { recursive: true });
  writeFileSync(
    join(DIRS.config, COLLECTIONS_FILE),
    JSON.stringify({ collections: list }, null, 2) + '\n',
    'utf8'
  );
}

function listCollectionsWithStats() {
  return readCollections().map((c) => {
    const items = listMd(c.name);
    return {
      ...c,
      total: items.length,
      drafts: items.filter((i) => i.draft).length,
      featured: items.filter((i) => i.featured).length,
    };
  });
}

// ── Pages (JSON, block-based) ────────────────────────────────
function listPages() {
  const dir = DIRS.pages;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /\.json$/.test(f))
    .map(f => {
      const slug = f.replace(/\.json$/, '');
      try {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return {
          slug,
          title: data.title || slug,
          description: data.description || '',
          pubDate: data.pubDate || '',
          updatedDate: data.updatedDate || '',
          draft: !!data.draft,
          showInNav: !!data.showInNav,
          blockCount: Array.isArray(data.blocks) ? data.blocks.length : 0,
        };
      } catch {
        return { slug, title: slug, description: '(invalid JSON)', blockCount: 0 };
      }
    })
    .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
}

function getPage(slug) {
  const filePath = join(DIRS.pages, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return { slug, data };
  } catch (e) {
    return { slug, data: null, error: e.message };
  }
}

function savePage(slug, data) {
  mkdirSync(DIRS.pages, { recursive: true });
  const out = {
    title: data.title || slug,
    description: data.description || '',
    pubDate: data.pubDate || new Date().toISOString().split('T')[0],
    ...(data.updatedDate ? { updatedDate: data.updatedDate } : {}),
    draft: !!data.draft,
    showInNav: !!data.showInNav,
    ...(data.navLabel ? { navLabel: data.navLabel } : {}),
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
  };
  writeFileSync(join(DIRS.pages, `${slug}.json`), JSON.stringify(out, null, 2) + '\n', 'utf8');
}

function deletePage(slug) {
  const filePath = join(DIRS.pages, `${slug}.json`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ── Site config + nav ────────────────────────────────────────
function readJson(file) {
  const p = join(DIRS.config, file);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function writeJson(file, data) {
  mkdirSync(DIRS.config, { recursive: true });
  writeFileSync(join(DIRS.config, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── Media ────────────────────────────────────────────────────
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

function listMedia() {
  if (!existsSync(DIRS.uploads)) return [];
  return readdirSync(DIRS.uploads)
    .filter(f => IMG_RE.test(f))
    .map(f => {
      const s = statSync(join(DIRS.uploads, f));
      return {
        name: f,
        url: `/uploads/${f}`,
        size: s.size,
        mtime: s.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function safeFilename(name) {
  return String(name)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `file-${Date.now()}`;
}

function uniqueFilename(name) {
  const base = safeFilename(name);
  if (!existsSync(join(DIRS.uploads, base))) return base;
  const ext = extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let i = 1;
  while (existsSync(join(DIRS.uploads, `${stem}-${i}${ext}`))) i++;
  return `${stem}-${i}${ext}`;
}

function saveMedia(filename, base64) {
  mkdirSync(DIRS.uploads, { recursive: true });
  const final = uniqueFilename(filename || 'upload');
  const buf = Buffer.from(base64, 'base64');
  writeFileSync(join(DIRS.uploads, final), buf);
  return final;
}

function deleteMedia(filename) {
  const safe = safeFilename(filename);
  const p = join(DIRS.uploads, safe);
  if (existsSync(p) && p.startsWith(DIRS.uploads)) unlinkSync(p);
}

// ── HTTP helpers ─────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => (buf += c));
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const slugRe = /^[a-z0-9][a-z0-9-]*$/;

// ── Server ───────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // Collections registry (config/collections.json)
    const collMatch = path.match(/^\/api\/collections(?:\/([^/]+))?$/);
    if (collMatch) {
      const [, name] = collMatch;
      const all = readCollections();

      if (method === 'GET' && !name) return json(res, listCollectionsWithStats());
      if (method === 'GET' && name) {
        const c = all.find((x) => x.name === name);
        return c ? json(res, c) : json(res, { error: 'Not found' }, 404);
      }
      if (method === 'POST' && !name) {
        const body = await readBody(req);
        const newName = String(body.name || '').trim();
        if (!slugRe.test(newName))
          return json(res, { error: 'Invalid name. Use lowercase letters, numbers, dashes.' }, 400);
        if (RESERVED_NAMES.has(newName))
          return json(res, { error: `"${newName}" is reserved.` }, 400);
        if (all.some((c) => c.name === newName))
          return json(res, { error: `Collection "${newName}" already exists.` }, 400);
        const def = {
          name: newName,
          label: String(body.label || newName).trim() || newName,
          labelOne: String(body.labelOne || newName).trim() || newName,
          icon: String(body.icon || '◫').trim() || '◫',
        };
        writeCollections([...all, def]);
        mkdirSync(collectionDir(newName), { recursive: true });
        return json(res, { ok: true, collection: def });
      }
      if (method === 'PUT' && name) {
        const body = await readBody(req);
        const idx = all.findIndex((c) => c.name === name);
        if (idx < 0) return json(res, { error: 'Not found' }, 404);
        const updated = { ...all[idx] };
        if (typeof body.label === 'string') updated.label = body.label.trim() || name;
        if (typeof body.labelOne === 'string') updated.labelOne = body.labelOne.trim() || name;
        if (typeof body.icon === 'string') updated.icon = body.icon.trim() || '◫';
        // Rename: change name field + move directory.
        if (typeof body.name === 'string' && body.name !== name) {
          const nn = body.name.trim();
          if (!slugRe.test(nn))
            return json(res, { error: 'Invalid name. Use lowercase letters, numbers, dashes.' }, 400);
          if (RESERVED_NAMES.has(nn))
            return json(res, { error: `"${nn}" is reserved.` }, 400);
          if (all.some((c, i) => i !== idx && c.name === nn))
            return json(res, { error: `Collection "${nn}" already exists.` }, 400);
          const oldDir = collectionDir(name);
          const newDir = collectionDir(nn);
          if (existsSync(oldDir) && !existsSync(newDir)) {
            renameSync(oldDir, newDir);
          } else if (!existsSync(newDir)) {
            mkdirSync(newDir, { recursive: true });
          }
          updated.name = nn;
        }
        const next = [...all];
        next[idx] = updated;
        writeCollections(next);
        return json(res, { ok: true, collection: updated });
      }
      if (method === 'DELETE' && name) {
        const url2 = new URL(req.url, `http://localhost:${PORT}`);
        const wipe = url2.searchParams.get('wipe') === '1';
        const next = all.filter((c) => c.name !== name);
        if (next.length === all.length) return json(res, { error: 'Not found' }, 404);
        writeCollections(next);
        if (wipe) {
          const dir = collectionDir(name);
          if (existsSync(dir) && dir.startsWith(DIRS.content)) {
            for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
            try { rmdirSync(dir); } catch {}
          }
        }
        return json(res, { ok: true });
      }
    }

    // Items inside any collection: /api/items/<collection>[/<slug>]
    const mdMatch = path.match(/^\/api\/items\/([^/]+)(?:\/([^/]+))?$/);
    if (mdMatch) {
      const [, type, slug] = mdMatch;
      const known = readCollections().some((c) => c.name === type);
      if (!known) return json(res, { error: `Unknown collection "${type}"` }, 404);
      if (method === 'GET' && !slug) return json(res, listMd(type));
      if (method === 'GET' && slug) {
        const item = getMd(type, slug);
        return item ? json(res, item) : json(res, { error: 'Not found' }, 404);
      }
      if (method === 'POST' || method === 'PUT') {
        const body = await readBody(req);
        const finalSlug = slug || body.slug;
        if (!finalSlug || !slugRe.test(finalSlug))
          return json(res, { error: 'Invalid slug. Use lowercase letters, numbers, dashes.' }, 400);
        saveMd(type, finalSlug, body.data || {}, body.body || '');
        return json(res, { ok: true, slug: finalSlug });
      }
      if (method === 'DELETE' && slug) {
        deleteMd(type, slug);
        return json(res, { ok: true });
      }
    }

    // Pages
    const pageMatch = path.match(/^\/api\/pages(?:\/([^/]+))?$/);
    if (pageMatch) {
      const [, slug] = pageMatch;
      if (method === 'GET' && !slug) return json(res, listPages());
      if (method === 'GET' && slug) {
        const p = getPage(slug);
        return p ? json(res, p) : json(res, { error: 'Not found' }, 404);
      }
      if (method === 'POST' || method === 'PUT') {
        const body = await readBody(req);
        const finalSlug = slug || body.slug;
        if (!finalSlug || !slugRe.test(finalSlug))
          return json(res, { error: 'Invalid slug. Use lowercase letters, numbers, dashes.' }, 400);
        savePage(finalSlug, body.data || {});
        return json(res, { ok: true, slug: finalSlug });
      }
      if (method === 'DELETE' && slug) {
        deletePage(slug);
        return json(res, { ok: true });
      }
    }

    // Site config
    if (path === '/api/site') {
      if (method === 'GET') return json(res, readJson('site.json'));
      if (method === 'PUT') {
        const body = await readBody(req);
        const existing = readJson('site.json') || {};
        // Shallow merge so partial updates don't wipe nested keys (theme, features).
        // Nested keys are merged one level deep too.
        const incoming = body || {};
        const merged = { ...existing, ...incoming };
        for (const k of Object.keys(incoming)) {
          if (incoming[k] && typeof incoming[k] === 'object' && !Array.isArray(incoming[k])
              && existing[k] && typeof existing[k] === 'object' && !Array.isArray(existing[k])) {
            merged[k] = { ...existing[k], ...incoming[k] };
          }
        }
        writeJson('site.json', merged);
        return json(res, { ok: true });
      }
    }

    // (Navigation API removed — nav is driven entirely by pages with showInNav.)

    // Media
    const mediaMatch = path.match(/^\/api\/media(?:\/([^/]+))?$/);
    if (mediaMatch) {
      const [, name] = mediaMatch;
      if (method === 'GET' && !name) return json(res, listMedia());
      if (method === 'POST' && !name) {
        const body = await readBody(req);
        if (!body.filename || !body.base64)
          return json(res, { error: 'filename and base64 required' }, 400);
        const final = saveMedia(body.filename, body.base64);
        return json(res, { ok: true, name: final, url: `/uploads/${final}` });
      }
      if (method === 'DELETE' && name) {
        deleteMedia(name);
        return json(res, { ok: true });
      }
    }

    // Stats for dashboard
    if (path === '/api/stats' && method === 'GET') {
      const collections = listCollectionsWithStats();
      const pages = listPages();
      return json(res, {
        collections,
        pages: { total: pages.length, drafts: pages.filter(p => p.draft).length },
        media: { total: listMedia().length },
      });
    }

    // Serve uploaded media so previews/picker show inline
    if (path.startsWith('/uploads/')) {
      const name = decodeURIComponent(path.slice('/uploads/'.length));
      if (name.includes('..') || name.includes('/')) {
        res.writeHead(400); res.end('Bad path'); return;
      }
      const filePath = join(DIRS.uploads, name);
      if (!filePath.startsWith(DIRS.uploads) || !existsSync(filePath)) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ext = extname(name).toLowerCase();
      const mime = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.avif': 'image/avif', '.ico': 'image/x-icon',
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      res.end(readFileSync(filePath));
      return;
    }

    // Serve UI
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(UI_HTML);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Admin running at http://localhost:${PORT}\n`);
});

// ── UI ───────────────────────────────────────────────────────
const UI_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin — iruki.dev</title>
<style>
:root{
  --bg:#fff;--bg2:#fafafa;--bg3:#f4f4f5;--bg4:#e4e4e7;
  --border:#e4e4e7;--border2:#d4d4d8;
  --text:#09090b;--text2:#52525b;--text3:#a1a1aa;
  --accent:#6366f1;--accent2:#4f46e5;--accent3:#eef2ff;
  --danger:#ef4444;--danger2:#fee2e2;
  --success:#16a34a;--success2:#dcfce7;
  --warn:#f59e0b;--warn2:#fef3c7;
  --r:6px;--r2:10px;
  --shadow:0 1px 2px rgba(0,0,0,.04),0 1px 3px rgba(0,0,0,.06);
  --shadow2:0 4px 12px rgba(0,0,0,.08);
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:#09090b;--bg2:#18181b;--bg3:#27272a;--bg4:#3f3f46;
    --border:#27272a;--border2:#3f3f46;
    --text:#fafafa;--text2:#a1a1aa;--text3:#71717a;
    --accent3:#312e81;
    --danger2:#450a0a;--success2:#052e16;--warn2:#422006;
    --shadow:0 1px 2px rgba(0,0,0,.3);--shadow2:0 4px 12px rgba(0,0,0,.5);
  }
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.5}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
input,textarea,select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent3)}
textarea{resize:vertical;min-height:120px;line-height:1.5}
input[type=checkbox],input[type=radio]{width:auto;accent-color:var(--accent)}
label{display:block;font-size:12px;font-weight:500;color:var(--text2);margin-bottom:4px}
.app{display:grid;grid-template-columns:220px 1fr;height:100vh}
aside{border-right:1px solid var(--border);background:var(--bg2);display:flex;flex-direction:column;overflow:hidden}
.brand{padding:18px 20px;font-weight:700;font-size:15px;border-bottom:1px solid var(--border)}
.brand small{display:block;font-weight:400;color:var(--text3);font-size:11px;margin-top:2px}
.menu{padding:8px;overflow-y:auto;flex:1}
.menu-section{margin-top:14px;padding:0 12px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}
.menu-section:first-child{margin-top:0}
.menu-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r);font-size:13px;color:var(--text2);cursor:pointer;width:100%;text-align:left;margin-top:2px}
.menu-item:hover{background:var(--bg3);color:var(--text)}
.menu-item.active{background:var(--accent3);color:var(--accent);font-weight:500}
.menu-item .ico{font-size:14px;width:16px;text-align:center}
.menu-item .count{margin-left:auto;font-size:11px;color:var(--text3);background:var(--bg3);padding:1px 7px;border-radius:99px}
.menu-item.active .count{background:var(--bg);color:var(--accent)}
.menu-foot{padding:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)}
main{overflow-y:auto;display:flex;flex-direction:column}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:12px 28px;border-bottom:1px solid var(--border);background:var(--bg);min-height:56px}
.topbar h1{font-size:16px;font-weight:600}
.topbar .crumbs{font-size:13px;color:var(--text3)}
.topbar .actions{display:flex;align-items:center;gap:8px}
.content{padding:28px;max-width:none;flex:1}
.content.narrow{max-width:840px;margin:0 auto;width:100%}

.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r);font-size:13px;font-weight:500;cursor:pointer;transition:background .15s,border-color .15s,color .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent2)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-secondary{background:var(--bg3);color:var(--text)}.btn-secondary:hover{background:var(--bg4)}
.btn-ghost{background:transparent;color:var(--text2)}.btn-ghost:hover{background:var(--bg3);color:var(--text)}
.btn-outline{border:1px solid var(--border);color:var(--text)}.btn-outline:hover{border-color:var(--border2);background:var(--bg3)}
.btn-danger{background:transparent;color:var(--danger);border:1px solid transparent}.btn-danger:hover{background:var(--danger2);border-color:var(--danger)}
.btn-sm{padding:4px 10px;font-size:12px}
.btn-xs{padding:2px 7px;font-size:11px}
.btn-icon{padding:6px;width:30px;height:30px;justify-content:center}

.card{background:var(--bg);border:1px solid var(--border);border-radius:var(--r2);padding:18px}
.card-pad{padding:0}
.field{margin-bottom:14px}
.field-row{display:grid;gap:12px}
.field-row.cols-2{grid-template-columns:1fr 1fr}
.field-row.cols-3{grid-template-columns:1fr 1fr 1fr}
.field-row.cols-4{grid-template-columns:1fr 1fr 1fr 1fr}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)}
.toggle-row label{margin:0;font-size:13px;color:var(--text)}

.editor{font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;min-height:380px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.split>*{min-width:0}
.preview{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px;min-height:380px;overflow:auto;line-height:1.6}
.preview h1,.preview h2,.preview h3{margin:.6em 0 .4em;font-weight:600}
.preview h1{font-size:1.6em}.preview h2{font-size:1.35em}.preview h3{font-size:1.15em}
.preview p{margin:.5em 0}
.preview pre{background:var(--bg3);padding:10px;border-radius:var(--r);overflow-x:auto;font-size:.9em}
.preview code{background:var(--bg3);padding:1px 5px;border-radius:3px;font-size:.9em}
.preview pre code{background:none;padding:0}
.preview blockquote{border-left:3px solid var(--border2);padding-left:12px;color:var(--text2);margin:.5em 0}
.preview a{color:var(--accent)}.preview ul,.preview ol{padding-left:20px;margin:.5em 0}
.preview img{max-width:100%;border-radius:var(--r);margin:.5em 0}
.preview hr{border:none;border-top:1px solid var(--border);margin:1em 0}

.toolbar{display:flex;flex-wrap:wrap;gap:2px;padding:6px;background:var(--bg2);border:1px solid var(--border);border-bottom:none;border-radius:var(--r) var(--r) 0 0}
.toolbar button{padding:5px 9px;border-radius:4px;font-size:13px;color:var(--text2)}
.toolbar button:hover{background:var(--bg3);color:var(--text)}
.toolbar .sep{width:1px;background:var(--border);margin:2px 4px}
.toolbar+textarea{border-radius:0 0 var(--r) var(--r)}

.list-item{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);gap:12px;transition:background .1s}
.list-item:last-child{border-bottom:none}
.list-item:hover{background:var(--bg2)}
.item-info{flex:1;min-width:0}
.item-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.item-desc{font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-meta{font-size:12px;color:var(--text3);margin-top:2px;display:flex;gap:10px;align-items:center}
.item-actions{display:flex;gap:4px;flex-shrink:0;opacity:.7;transition:opacity .15s}
.list-item:hover .item-actions{opacity:1}
.badge{display:inline-flex;align-items:center;padding:1px 8px;border-radius:99px;font-size:11px;background:var(--bg3);color:var(--text2);font-weight:500}
.badge.draft{background:var(--warn2);color:#854d0e}
@media(prefers-color-scheme:dark){.badge.draft{color:#fde68a}}
.badge.featured{background:var(--accent3);color:var(--accent)}
.badge.published{background:var(--success2);color:var(--success)}

.alert{padding:10px 14px;border-radius:var(--r);font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.alert.error{background:var(--danger2);color:#991b1b;border:1px solid #fca5a5}
.alert.success{background:var(--success2);color:#166534;border:1px solid #86efac}
.alert.info{background:var(--accent3);color:var(--accent2);border:1px solid #c7d2fe}
@media(prefers-color-scheme:dark){
  .alert.error{color:#fca5a5;border-color:#7f1d1d}
  .alert.success{color:#86efac;border-color:#14532d}
}

.loading{text-align:center;padding:48px;color:var(--text2)}
.empty{text-align:center;padding:48px 18px;color:var(--text2);font-size:13px}
.empty .ico{font-size:32px;margin-bottom:8px;opacity:.4}
hr{border:none;border-top:1px solid var(--border);margin:18px 0}

/* Stats grid */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.stat{padding:18px;border:1px solid var(--border);border-radius:var(--r2);background:var(--bg)}
.stat-num{font-size:24px;font-weight:600}
.stat-label{font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
.stat-sub{font-size:11px;color:var(--text3);margin-top:6px}

/* Page builder */
.builder{display:grid;grid-template-columns:1fr 420px;gap:18px;align-items:flex-start}
@media(max-width:1100px){.builder{grid-template-columns:1fr}}
.canvas{display:flex;flex-direction:column;gap:10px}
.block{background:var(--bg);border:1px solid var(--border);border-radius:var(--r2);transition:border-color .15s,box-shadow .15s}
.block.selected{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent3)}
.block-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg2);border-radius:var(--r2) var(--r2) 0 0}
.block-type{font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;flex:1}
.block-actions{display:flex;gap:2px}
.block-body{padding:14px}
.add-row{display:flex;flex-wrap:wrap;gap:6px;padding:14px;border:1px dashed var(--border2);border-radius:var(--r2);justify-content:center}
.add-row .label{width:100%;text-align:center;font-size:12px;color:var(--text3);margin-bottom:6px}
.side{position:sticky;top:78px;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 100px);overflow-y:auto}
.side-section{background:var(--bg);border:1px solid var(--border);border-radius:var(--r2);padding:16px}
.side-section h3{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}

/* Media grid */
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.media-card{position:relative;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;background:var(--bg2);cursor:pointer;transition:border-color .15s}
.media-card:hover{border-color:var(--border2)}
.media-card img{width:100%;height:120px;object-fit:cover;display:block}
.media-card .info{padding:6px 8px;font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.media-card .overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0;transition:opacity .15s;color:#fff}
.media-card:hover .overlay{opacity:1}
.upload-zone{border:2px dashed var(--border2);border-radius:var(--r2);padding:32px;text-align:center;color:var(--text2);cursor:pointer;transition:border-color .15s,background .15s}
.upload-zone:hover,.upload-zone.drag{border-color:var(--accent);background:var(--accent3)}

/* Toast */
.toast-host{position:fixed;bottom:18px;right:18px;display:flex;flex-direction:column;gap:8px;z-index:100;pointer-events:none}
.toast{background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;font-size:13px;box-shadow:var(--shadow2);max-width:340px;animation:tin .2s}
.toast.success{border-color:#86efac}
.toast.error{border-color:#fca5a5}
@keyframes tin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* Modal */
.modal-host{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:90;padding:18px}
.modal{background:var(--bg);border-radius:var(--r2);max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:var(--shadow2)}
.modal-head{padding:14px 18px;border-bottom:1px solid var(--border);font-weight:600}
.modal-body{padding:18px}
.modal-foot{padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px}

.spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--bg3);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.dot-saved{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text3)}
.dot-saved::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--success)}
.dot-dirty{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--warn)}
.dot-dirty::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--warn)}
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="brand">iruki.dev<small>local admin</small></div>
    <nav class="menu" id="menu"></nav>
    <div class="menu-foot">Changes write to disk. Run <code>git push</code> to deploy.</div>
  </aside>
  <main>
    <div class="topbar" id="topbar"></div>
    <div class="content" id="content"><div class="loading">Loading…</div></div>
  </main>
</div>
<div class="toast-host" id="toasts"></div>
<div id="modal"></div>

<script>
// ─── Helpers ───
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const today = () => new Date().toISOString().split('T')[0];
const slugify = s => String(s||'').toLowerCase().replace(/[^\\w\\s-]/g,'').trim().replace(/\\s+/g,'-').replace(/-+/g,'-').slice(0,60);
const fmtBytes = n => n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const isSlug = s => /^[a-z0-9][a-z0-9-]*$/.test(s);

function toast(msg, type='success'){
  const el = document.createElement('div');
  el.className = 'toast '+type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),200); }, 2400);
}

function modal({title, body, onOk, okText='OK', okStyle='btn-primary'}){
  const wrap = document.createElement('div');
  wrap.className = 'modal-host';
  wrap.innerHTML = \`<div class="modal">
    <div class="modal-head">\${esc(title)}</div>
    <div class="modal-body">\${body}</div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-cancel>Cancel</button>
      <button class="btn \${okStyle}" data-ok>\${esc(okText)}</button>
    </div>
  </div>\`;
  $('#modal').appendChild(wrap);
  wrap.querySelector('[data-cancel]').onclick = ()=>wrap.remove();
  wrap.querySelector('[data-ok]').onclick = async () => {
    if (!onOk || (await onOk(wrap)) !== false) wrap.remove();
  };
}

function confirmDelete(name, fn){
  modal({
    title: 'Confirm delete',
    body: '<p>Delete <strong>'+esc(name)+'</strong>? This cannot be undone.</p>',
    okText: 'Delete', okStyle: 'btn-danger',
    onOk: fn,
  });
}

// ─── API ───
const API = {
  list: t => fetch('/api/'+t).then(r=>r.json()),
  get: (t,s) => fetch('/api/'+t+'/'+s).then(r=>r.json()),
  save: (t,s,body) => fetch('/api/'+t+'/'+(s||''), {method:s?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),
  del: (t,s) => fetch('/api/'+t+'/'+s, {method:'DELETE'}).then(r=>r.json()),
  putRaw: (t,b) => fetch('/api/'+t,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()),
  stats: () => fetch('/api/stats').then(r=>r.json()),
  // Collection items
  itemsList: c => fetch('/api/items/'+c).then(r=>r.json()),
  itemGet:   (c,s) => fetch('/api/items/'+c+'/'+s).then(r=>r.json()),
  itemSave:  (c,s,body) => fetch('/api/items/'+c+'/'+(s||''), {method:s?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),
  itemDel:   (c,s) => fetch('/api/items/'+c+'/'+s, {method:'DELETE'}).then(r=>r.json()),
  // Collection definitions
  collections: () => fetch('/api/collections').then(r=>r.json()),
  collCreate: body => fetch('/api/collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),
  collUpdate: (n,body) => fetch('/api/collections/'+n,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()),
  collDelete: (n,wipe) => fetch('/api/collections/'+n+(wipe?'?wipe=1':''),{method:'DELETE'}).then(r=>r.json()),
};

let COLLECTIONS_CACHE = [];
async function refreshCollectionsCache(){
  try { COLLECTIONS_CACHE = await API.collections(); } catch { COLLECTIONS_CACHE = []; }
  return COLLECTIONS_CACHE;
}
const collectionDef = (name) => COLLECTIONS_CACHE.find(c => c.name === name);

// ─── Inline markdown preview (matches PageBlock.astro) ───
function renderInlineMd(t){
  if(!t) return '';
  let o = esc(t);
  o = o.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  o = o.replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');
  o = o.replace(/\\*([^*]+)\\*/g,'<em>$1</em>');
  o = o.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2">$1</a>');
  o = o.replace(/\\n/g,'<br>');
  return o;
}
function renderBlockMd(t){
  if(!t) return '';
  return t.split(/\\n{2,}/).map(p => '<p>'+renderInlineMd(p.trim())+'</p>').join('');
}
// Full-document markdown preview for blog/projects
function renderFullMd(src){
  if(!src) return '<p style="color:var(--text3)">Nothing to preview.</p>';
  const lines = src.replace(/\\r/g,'').split('\\n');
  const out = [];
  let inCode=false, codeLang='', codeBuf=[];
  let inList=false, listType='ul';
  const flushList=()=>{ if(inList){ out.push('</'+listType+'>'); inList=false; } };
  for (let i=0;i<lines.length;i++){
    const line = lines[i];
    if (/^\`\`\`/.test(line)){
      if (inCode){
        out.push('<pre><code>'+esc(codeBuf.join('\\n'))+'</code></pre>');
        inCode=false; codeBuf=[]; codeLang='';
      } else {
        flushList();
        inCode=true; codeLang=line.replace(/^\`\`\`/,'').trim();
      }
      continue;
    }
    if (inCode){ codeBuf.push(line); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\\s+(.*)$/))){
      flushList();
      const lvl = m[1].length;
      out.push('<h'+lvl+'>'+renderInlineMd(m[2])+'</h'+lvl+'>');
      continue;
    }
    if (/^---$/.test(line.trim()) || /^\\*\\*\\*$/.test(line.trim())){ flushList(); out.push('<hr>'); continue; }
    if ((m = line.match(/^>\\s?(.*)$/))){
      flushList();
      out.push('<blockquote>'+renderInlineMd(m[1])+'</blockquote>');
      continue;
    }
    if ((m = line.match(/^\\s*[-*+]\\s+(.*)$/))){
      if (!inList || listType!=='ul'){ flushList(); out.push('<ul>'); inList=true; listType='ul'; }
      out.push('<li>'+renderInlineMd(m[1])+'</li>'); continue;
    }
    if ((m = line.match(/^\\s*\\d+\\.\\s+(.*)$/))){
      if (!inList || listType!=='ol'){ flushList(); out.push('<ol>'); inList=true; listType='ol'; }
      out.push('<li>'+renderInlineMd(m[1])+'</li>'); continue;
    }
    if (line.trim()===''){ flushList(); continue; }
    flushList();
    out.push('<p>'+renderInlineMd(line)+'</p>');
  }
  flushList();
  if (inCode) out.push('<pre><code>'+esc(codeBuf.join('\\n'))+'</code></pre>');
  return out.join('\\n');
}

// ─── Markdown toolbar ───
function attachToolbar(textarea, toolbar){
  const apply = (before, after='', placeholder='') => {
    textarea.focus();
    const s = textarea.selectionStart, e = textarea.selectionEnd;
    const sel = textarea.value.slice(s,e) || placeholder;
    const before2 = before, after2 = after;
    textarea.setRangeText(before2 + sel + after2, s, e, 'select');
    textarea.selectionStart = s + before2.length;
    textarea.selectionEnd = s + before2.length + sel.length;
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
  };
  const linePrefix = (prefix) => {
    textarea.focus();
    const s = textarea.selectionStart;
    const v = textarea.value;
    const lineStart = v.lastIndexOf('\\n', s-1) + 1;
    textarea.setRangeText(prefix, lineStart, lineStart, 'end');
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
  };
  toolbar.querySelectorAll('[data-md]').forEach(b=>{
    b.onclick = () => {
      const t = b.dataset.md;
      if (t==='bold') apply('**','**','bold text');
      else if (t==='italic') apply('*','*','italic text');
      else if (t==='code') apply('\`','\`','code');
      else if (t==='codeblock') apply('\\n\`\`\`\\n','\\n\`\`\`\\n','code');
      else if (t==='link') {
        const url = prompt('Link URL:','https://');
        if (url) apply('[', '](' + url + ')', 'text');
      } else if (t==='image') {
        openMediaPicker(url => apply('![', '](' + url + ')', 'alt'));
      } else if (t==='h1') linePrefix('# ');
      else if (t==='h2') linePrefix('## ');
      else if (t==='h3') linePrefix('### ');
      else if (t==='ul') linePrefix('- ');
      else if (t==='ol') linePrefix('1. ');
      else if (t==='quote') linePrefix('> ');
      else if (t==='hr') apply('\\n\\n---\\n\\n','','');
    };
  });
}

const TOOLBAR_HTML = \`<div class="toolbar">
  <button data-md="h1" title="Heading 1">H1</button>
  <button data-md="h2" title="Heading 2">H2</button>
  <button data-md="h3" title="Heading 3">H3</button>
  <span class="sep"></span>
  <button data-md="bold" title="Bold (Ctrl+B)"><b>B</b></button>
  <button data-md="italic" title="Italic (Ctrl+I)"><i>I</i></button>
  <button data-md="code" title="Inline code">&lt;/&gt;</button>
  <span class="sep"></span>
  <button data-md="link" title="Link">🔗</button>
  <button data-md="image" title="Image from media">🖼</button>
  <span class="sep"></span>
  <button data-md="ul" title="Bulleted list">•</button>
  <button data-md="ol" title="Numbered list">1.</button>
  <button data-md="quote" title="Quote">❝</button>
  <button data-md="codeblock" title="Code block">{ }</button>
  <button data-md="hr" title="Divider">―</button>
</div>\`;

// ─── Media picker (modal) ───
async function openMediaPicker(onPick){
  const items = await API.list('media');
  const grid = items.length
    ? items.map(it => '<div class="media-card" data-url="'+esc(it.url)+'"><img src="'+esc(it.url)+'" /><div class="info">'+esc(it.name)+'</div></div>').join('')
    : '<p style="color:var(--text2);text-align:center;padding:24px">No images yet. Use the Media section to upload.</p>';
  const w = document.createElement('div');
  w.className = 'modal-host';
  w.innerHTML = '<div class="modal" style="max-width:680px">'
    + '<div class="modal-head">Pick an image</div>'
    + '<div class="modal-body"><div class="media-grid">'+grid+'</div></div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" data-cancel>Cancel</button></div></div>';
  $('#modal').appendChild(w);
  w.querySelector('[data-cancel]').onclick = ()=>w.remove();
  w.querySelectorAll('.media-card').forEach(c => c.onclick = () => {
    onPick(c.dataset.url);
    w.remove();
  });
}

// ─── Sidebar / routing ───
// Static routes (not bound to a collection).
const STATIC_ROUTES = {
  dashboard:   { icon:'⊞', label:'Dashboard',          section:'Overview' },
  collections: { icon:'⛁', label:'Manage collections', section:'Site builder' },
  pages:       { icon:'▣', label:'Pages',              section:'Site builder' },
  site:        { icon:'⚙', label:'Site',               section:'Site builder' },
  media:       { icon:'◧', label:'Media',              section:'Site builder' },
};

let currentRoute = 'dashboard';
let currentParams = {};

function renderMenu(stats={}){
  const collections = COLLECTIONS_CACHE || [];
  const sections = { Overview: [], Content: [], 'Site builder': [] };

  // Dashboard
  sections.Overview.push({
    key: 'dashboard',
    isItems: false,
    icon: STATIC_ROUTES.dashboard.icon,
    label: STATIC_ROUTES.dashboard.label,
    count: '',
    active: currentRoute === 'dashboard',
  });

  // One menu entry per collection
  for (const c of collections){
    const stat = (stats.collections || []).find(s => s.name === c.name);
    sections.Content.push({
      key: 'items:' + c.name,
      isItems: true,
      collection: c.name,
      icon: c.icon || '◫',
      label: c.label || c.name,
      count: stat?.total ?? '',
      active: currentRoute === 'items' && currentParams.collection === c.name,
    });
  }

  // Site builder
  for (const k of ['pages','collections','site','media']){
    const v = STATIC_ROUTES[k];
    let count = '';
    if (k==='pages') count = stats.pages?.total ?? '';
    else if (k==='media') count = stats.media?.total ?? '';
    else if (k==='collections') count = collections.length || '';
    sections['Site builder'].push({
      key: k,
      isItems: false,
      icon: v.icon, label: v.label, count,
      active: currentRoute === k,
    });
  }

  const sectionOrder = ['Overview','Content','Site builder'];
  const html = sectionOrder.map(sec => {
    const items = sections[sec];
    if (!items.length) return '';
    return '<div class="menu-section">'+esc(sec)+'</div>'
      + items.map(i =>
        '<button class="menu-item'+(i.active?' active':'')+'" data-route="'+i.key+'">'
        + '<span class="ico">'+esc(i.icon)+'</span>'
        + '<span>'+esc(i.label)+'</span>'
        + (i.count!==''&&i.count!=null?'<span class="count">'+i.count+'</span>':'')
        + '</button>'
      ).join('');
  }).join('');
  $('#menu').innerHTML = html;
  $('#menu').querySelectorAll('[data-route]').forEach(b => b.onclick = () => {
    const k = b.dataset.route;
    if (k.startsWith('items:')) navigate('items', { collection: k.slice('items:'.length) });
    else navigate(k);
  });
}

async function refreshMenu(){
  await refreshCollectionsCache();
  try { renderMenu(await API.stats()); } catch { renderMenu({}); }
}

function navigate(route, params={}){
  currentRoute = route; currentParams = params;
  history.replaceState(null,'','#'+route+(Object.keys(params).length?('/'+encodeURIComponent(JSON.stringify(params))):''));
  refreshMenu();
  render();
}

function setTopbar({crumbs, actions=''}){
  $('#topbar').innerHTML = '<div class="crumbs">'+crumbs+'</div><div class="actions">'+actions+'</div>';
}

function setContent(html, narrow=false){
  const c = $('#content');
  c.className = 'content' + (narrow?' narrow':'');
  c.innerHTML = html;
}

// ─── Dashboard ───
async function renderDashboard(){
  setTopbar({crumbs:'<strong style="color:var(--text)">Dashboard</strong>'});
  setContent('<div class="loading">Loading…</div>');
  const s = await API.stats();
  const collStats = s.collections || [];
  const collTiles = collStats.map(c => \`
    <div class="stat">
      <div class="stat-num">\${c.total ?? 0}</div>
      <div class="stat-label">\${esc(c.label || c.name)}</div>
      <div class="stat-sub">\${c.drafts ?? 0} drafts\${c.featured ? ' · '+c.featured+' featured':''}</div>
    </div>\`).join('');
  const quickNew = collStats.map(c => \`<button class="btn btn-secondary" data-newcoll="\${esc(c.name)}">+ New \${esc(c.labelOne || c.name)}</button>\`).join('');
  setContent(\`
    <div class="stat-grid">
      \${collTiles}
      <div class="stat"><div class="stat-num">\${s.pages?.total ?? 0}</div><div class="stat-label">Pages</div><div class="stat-sub">\${s.pages?.drafts ?? 0} drafts</div></div>
      <div class="stat"><div class="stat-num">\${s.media?.total ?? 0}</div><div class="stat-label">Media files</div><div class="stat-sub">in /public/uploads</div></div>
    </div>
    <div class="card">
      <h2 style="font-size:14px;font-weight:600;margin-bottom:10px">Quick actions</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        \${quickNew}
        <button class="btn btn-secondary" data-act="new-page">+ New page</button>
        <button class="btn btn-outline" data-act="manage-coll">Manage collections</button>
        <button class="btn btn-outline" data-act="open-media">Media library</button>
        <button class="btn btn-outline" data-act="open-site">Site settings</button>
      </div>
    </div>
  \`);
  $('#content').querySelectorAll('[data-newcoll]').forEach(b => b.onclick = () => navigate('items', { collection: b.dataset.newcoll, edit: '' }));
  $('#content').querySelector('[data-act="new-page"]').onclick = () => navigate('pages',{edit:''});
  $('#content').querySelector('[data-act="manage-coll"]').onclick = () => navigate('collections');
  $('#content').querySelector('[data-act="open-media"]').onclick = () => navigate('media');
  $('#content').querySelector('[data-act="open-site"]').onclick = () => navigate('site');
}

// ─── Items list + editor (any collection) ───
async function renderMdList(collection){
  const def = collectionDef(collection);
  if (!def){
    setContent('<div class="alert error">Unknown collection "'+esc(collection)+'". <a href="javascript:void(0)" id="goto-coll">Manage collections</a>.</div>');
    $('#goto-coll')?.addEventListener('click', () => navigate('collections'));
    return;
  }
  const labelOne = def.labelOne || collection;
  const label = def.label || collection;
  setTopbar({
    crumbs:'<strong style="color:var(--text)">'+esc(label)+'</strong>',
    actions:'<button class="btn btn-primary btn-sm" id="new-md">+ New '+esc(labelOne)+'</button>',
  });
  setContent('<div class="loading">Loading…</div>', true);
  const items = await API.itemsList(collection);
  const html = items.length ? \`
    <div class="card card-pad">
      \${items.map(it => \`
        <div class="list-item">
          <div class="item-info">
            <div class="item-title">\${esc(it.title || it.slug)}</div>
            <div class="item-desc">\${esc(it.description || '')}</div>
            <div class="item-meta">
              <span>\${esc(it.pubDate || '—')}</span>
              <span>\${it.words ?? 0} words</span>
              \${it.draft?'<span class="badge draft">draft</span>':'<span class="badge published">published</span>'}
              \${it.featured?'<span class="badge featured">featured</span>':''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-ghost btn-sm" data-edit="\${esc(it.slug)}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="\${esc(it.slug)}">Delete</button>
          </div>
        </div>
      \`).join('')}
    </div>
  \` : '<div class="empty"><div class="ico">'+esc(def.icon||'◫')+'</div>No '+esc(label.toLowerCase())+' yet. Click "+ New '+esc(labelOne)+'" to start.</div>';
  setContent(html, true);
  $('#new-md').onclick = () => navigate('items', { collection, edit: '' });
  $('#content').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => navigate('items', { collection, edit: b.dataset.edit }));
  $('#content').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const slug = b.dataset.del;
    confirmDelete(slug, async () => {
      await API.itemDel(collection, slug);
      toast('Deleted "'+slug+'"');
      navigate('items', { collection });
    });
  });
}

async function renderMdEdit(collection, slug){
  const def = collectionDef(collection);
  if (!def){
    setContent('<div class="alert error">Unknown collection "'+esc(collection)+'".</div>');
    return;
  }
  const labelOne = def.labelOne || collection;
  const label = def.label || collection;
  const isNew = !slug;
  let data = {}, body = '';
  setTopbar({
    crumbs:'<a href="javascript:void(0)" id="back">'+esc(label)+'</a> / <strong style="color:var(--text)">'+(isNew?'New '+esc(labelOne):esc(slug))+'</strong>',
    actions:'<span id="dirty-dot"></span><button class="btn btn-outline btn-sm" id="cancel-btn">Cancel</button><button class="btn btn-primary btn-sm" id="save-btn">'+(isNew?'Publish':'Update')+'</button>',
  });
  setContent('<div class="loading">Loading…</div>', true);

  if (slug){
    const r = await API.itemGet(collection, slug);
    if (r.error) { setContent('<div class="alert error">'+esc(r.error)+'</div>'); return; }
    ({data, body} = r);
  }
  $('#back').onclick = () => navigate('items', { collection });
  $('#cancel-btn').onclick = () => navigate('items', { collection });

  const tagsStr = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
  // All collections share the same unified schema. Show every optional field; users fill what they need.
  const projectExtras = \`
    <div class="field"><label>Updated date <span style="color:var(--text3);font-weight:normal">(optional)</span></label><input id="f-updated" type="date" value="\${esc(data.updatedDate||'')}" /></div>
    <div class="field-row cols-2">
      <div class="field"><label>GitHub URL <span style="color:var(--text3);font-weight:normal">(optional)</span></label><input id="f-github" value="\${esc(data.github||'')}" placeholder="https://github.com/…" /></div>
      <div class="field"><label>Demo URL <span style="color:var(--text3);font-weight:normal">(optional)</span></label><input id="f-demo" value="\${esc(data.demo||'')}" placeholder="https://…" /></div>
    </div>
    <div class="toggle-row"><label for="f-featured">Featured <span style="color:var(--text3);font-weight:normal">(filterable in collection-list block)</span></label><input type="checkbox" id="f-featured" \${data.featured?'checked':''} /></div>
  \`;

  setContent(\`
    <div id="form-alert"></div>
    <div class="card" style="margin-bottom:14px">
      <div class="field"><label>Title</label><input id="f-title" value="\${esc(data.title||'')}" placeholder="\${labelOne} title" /></div>
      <div class="field"><label>Description</label><input id="f-desc" value="\${esc(data.description||'')}" placeholder="Short description shown in lists and previews" /></div>
      <div class="field-row cols-2">
        <div class="field"><label>Slug \${isNew?'<span style="color:var(--text3);font-weight:normal">(auto from title if empty)</span>':''}</label><input id="f-slug" value="\${esc(slug||'')}" \${slug?'disabled':''} placeholder="my-\${labelOne.toLowerCase()}" /></div>
        <div class="field"><label>Publish date</label><input id="f-date" type="date" value="\${esc(data.pubDate||today())}" /></div>
      </div>
      <div class="field"><label>Tags <span style="color:var(--text3);font-weight:normal">(comma-separated)</span></label><input id="f-tags" value="\${esc(tagsStr)}" placeholder="tag1, tag2" /></div>
      \${projectExtras}
      <div class="toggle-row"><label for="f-draft">Draft (hidden from site)</label><input type="checkbox" id="f-draft" \${data.draft?'checked':''} /></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <label style="margin:0">Content (Markdown)</label>
        <div style="display:flex;align-items:center;gap:12px">
          <span id="word-count" style="font-size:12px;color:var(--text3)"></span>
          <button class="btn btn-ghost btn-sm" id="toggle-preview">Toggle preview</button>
        </div>
      </div>
      <div id="editor-host"></div>
    </div>
  \`, true);

  // Editor with toolbar + live preview
  const host = $('#editor-host');
  host.innerHTML = TOOLBAR_HTML
    + '<div class="split">'
    + '  <textarea id="f-body" class="editor" placeholder="Write your '+labelOne.toLowerCase()+' in Markdown…"></textarea>'
    + '  <div class="preview" id="preview"></div>'
    + '</div>';
  const ta = $('#f-body');
  ta.value = body;
  const updatePreview = () => {
    $('#preview').innerHTML = renderFullMd(ta.value);
    const w = ta.value.split(/\\s+/).filter(Boolean).length;
    $('#word-count').textContent = w + ' words · ' + ta.value.length + ' chars';
  };
  ta.addEventListener('input', () => { updatePreview(); markDirty(); });
  attachToolbar(ta, host.querySelector('.toolbar'));
  updatePreview();

  // Toggle preview
  let previewOn = true;
  $('#toggle-preview').onclick = () => {
    previewOn = !previewOn;
    host.querySelector('.split').style.gridTemplateColumns = previewOn ? '1fr 1fr' : '1fr';
    host.querySelector('#preview').style.display = previewOn ? '' : 'none';
  };

  // Save
  let dirty = false;
  const markDirty = () => {
    if (dirty) return;
    dirty = true;
    $('#dirty-dot').outerHTML = '<span id="dirty-dot" class="dot-dirty">unsaved</span>';
  };
  ['f-title','f-desc','f-slug','f-date','f-updated','f-tags','f-github','f-demo','f-draft','f-featured'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markDirty);
    if (el && el.type==='checkbox') el.addEventListener('change', markDirty);
  });

  // Auto-slug
  if (isNew){
    const ti = $('#f-title'), sl = $('#f-slug');
    let touched = false;
    sl.addEventListener('input', ()=>{ touched = true; });
    ti.addEventListener('input', ()=>{ if (!touched) sl.value = slugify(ti.value); });
  }

  $('#save-btn').onclick = async () => {
    const g = id => document.getElementById(id)?.value?.trim() ?? '';
    const title = g('f-title');
    if (!title){ toast('Title is required.', 'error'); return; }
    const slugVal = (slug || g('f-slug') || slugify(title)).trim();
    if (!isSlug(slugVal)){
      toast('Slug must be lowercase letters, numbers, and dashes.', 'error');
      return;
    }
    const tags = g('f-tags').split(',').map(s=>s.trim()).filter(Boolean);
    const updated = g('f-updated') || undefined;
    const data = {
      title,
      description: g('f-desc'),
      pubDate: g('f-date') || today(),
      ...(updated?{updatedDate:updated}:{}),
      tags,
      draft: $('#f-draft')?.checked ?? false,
    };
    const gh = g('f-github'), dm = g('f-demo');
    if (gh) data.github = gh;
    if (dm) data.demo = dm;
    if ($('#f-featured')?.checked) data.featured = true;
    const btn = $('#save-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving';
    const r = await API.itemSave(collection, slug || slugVal, { slug: slugVal, data, body: ta.value });
    btn.disabled = false; btn.textContent = isNew ? 'Publish' : 'Update';
    if (r.error){ toast(r.error, 'error'); return; }
    dirty = false;
    $('#dirty-dot').outerHTML = '<span id="dirty-dot" class="dot-saved">saved</span>';
    toast('Saved "'+slugVal+'"');
    if (isNew) navigate('items', { collection, edit: slugVal });
  };
}

// ─── Pages list + builder ───
const BLOCK_DEFS = {
  heading:   { label:'Heading',   icon:'H',  default:()=>({type:'heading',level:2,text:'New heading',align:'left'}) },
  paragraph: { label:'Paragraph', icon:'¶',  default:()=>({type:'paragraph',text:'Write something…',align:'left'}) },
  image:     { label:'Image',     icon:'🖼', default:()=>({type:'image',src:'',alt:'',caption:'',width:'full'}) },
  button:    { label:'Button',    icon:'▭',  default:()=>({type:'button',text:'Click me',href:'#',style:'primary',align:'left',newTab:false}) },
  columns:   { label:'Columns',   icon:'⫼',  default:()=>({type:'columns',columns:[{markdown:'Left column'},{markdown:'Right column'}]}) },
  cards:     { label:'Cards',     icon:'⌗',  default:()=>({type:'cards',items:[{title:'Card title',description:'Description',href:'',icon:''}]}) },
  divider:   { label:'Divider',   icon:'―',  default:()=>({type:'divider'}) },
  spacer:    { label:'Spacer',    icon:'↕',  default:()=>({type:'spacer',size:'md'}) },
  code:      { label:'Code',      icon:'</>',default:()=>({type:'code',code:'// code',lang:''}) },
  html:      { label:'HTML',      icon:'<>', default:()=>({type:'html',html:'<div>Custom HTML</div>'}) },
  callout:   { label:'Callout',   icon:'❗', default:()=>({type:'callout',variant:'info',title:'',text:'A callout to highlight something.',icon:''}) },
  quote:     { label:'Quote',     icon:'❝',  default:()=>({type:'quote',text:'A memorable quote.',author:'',source:'',sourceHref:''}) },
  video:     { label:'Video',     icon:'▶',  default:()=>({type:'video',src:'',poster:'',autoplay:false,loop:false,muted:false,controls:true,caption:''}) },
  audio:     { label:'Audio',     icon:'♪',  default:()=>({type:'audio',src:'',title:'',caption:''}) },
  embed:     { label:'Embed',     icon:'⤴',  default:()=>({type:'embed',url:'',aspect:'16x9',title:''}) },
  gallery:   { label:'Gallery',   icon:'⊞',  default:()=>({type:'gallery',items:[{src:'',alt:'',caption:''}],columns:3}) },
  accordion: { label:'Accordion', icon:'≡',  default:()=>({type:'accordion',items:[{summary:'Question',content:'Answer',open:false}]}) },
  tabs:      { label:'Tabs',      icon:'⊟',  default:()=>({type:'tabs',items:[{label:'Tab 1',content:'Content 1'},{label:'Tab 2',content:'Content 2'}]}) },
  stats:     { label:'Stats',     icon:'#',  default:()=>({type:'stats',items:[{value:'100',label:'Stat',prefix:'',suffix:'',animate:true}]}) },
  timeline:  { label:'Timeline',  icon:'│',  default:()=>({type:'timeline',items:[{date:'2026',title:'Milestone',text:'Description'}]}) },
  progress:  { label:'Progress',  icon:'▰',  default:()=>({type:'progress',label:'Progress',value:50,showValue:true,striped:false}) },
  countdown: { label:'Countdown', icon:'⏱',  default:()=>({type:'countdown',target:new Date(Date.now()+86400000*7).toISOString().slice(0,10),label:'Counting down',finishedText:'Time up!'}) },
  mermaid:   { label:'Mermaid',   icon:'◇',  default:()=>({type:'mermaid',code:'graph TD;\\n  A-->B;\\n  A-->C;',caption:''}) },
  math:      { label:'Math',      icon:'∑',  default:()=>({type:'math',code:'e^{i\\\\pi} + 1 = 0',display:true}) },
  runner:    { label:'JS Runner', icon:'⚙',  default:()=>({type:'runner',title:'Playground',code:'console.log("hello");\\nreturn 1+1;',autoRun:false}) },
  marquee:   { label:'Marquee',   icon:'≫',  default:()=>({type:'marquee',text:'Scrolling text — ',speed:'normal',reverse:false,icon:'★'}) },
  palette:   { label:'Palette',   icon:'◧',  default:()=>({type:'palette',label:'Theme colors',colors:[{name:'Primary',hex:'#6366f1'},{name:'Accent',hex:'#10b981'}]}) },
  'iframe-sandbox': { label:'Sandbox', icon:'⛶', default:()=>({type:'iframe-sandbox',html:'<h1>Hello</h1>',css:'body{font-family:sans-serif;padding:24px}',js:'',height:300}) },
  'collection-list': {
    label:'Collection list', icon:'⛁',
    default: () => {
      const first = (COLLECTIONS_CACHE[0]?.name) || '';
      return { type:'collection-list', collection:first, title:'', limit:3, featuredOnly:false, showAllLink:true };
    },
  },
};

async function renderPagesList(){
  setTopbar({
    crumbs:'<strong style="color:var(--text)">Pages</strong> <span style="color:var(--text3)">— visual page builder</span>',
    actions:'<button class="btn btn-primary btn-sm" id="new-page">+ New page</button>',
  });
  setContent('<div class="loading">Loading…</div>', true);
  const items = await API.list('pages');
  const html = items.length ? \`
    <div class="card card-pad">
      \${items.map(it => \`
        <div class="list-item">
          <div class="item-info">
            <div class="item-title">\${esc(it.title)}</div>
            <div class="item-desc">\${esc(it.description || '/'+it.slug)}</div>
            <div class="item-meta">
              <span>/\${esc(it.slug)}</span>
              <span>\${it.blockCount} blocks</span>
              \${it.draft?'<span class="badge draft">draft</span>':'<span class="badge published">published</span>'}
              \${it.showInNav?'<span class="badge featured">in nav</span>':''}
            </div>
          </div>
          <div class="item-actions">
            \${it.draft?'':'<a class="btn btn-ghost btn-sm" target="_blank" href="http://localhost:4321/'+esc(it.slug)+'">View</a>'}
            <button class="btn btn-ghost btn-sm" data-edit="\${esc(it.slug)}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="\${esc(it.slug)}">Delete</button>
          </div>
        </div>
      \`).join('')}
    </div>
  \` : '<div class="empty"><div class="ico">▣</div>No pages yet. Build your first one — landing pages, custom sections, anything.<br><br><button class="btn btn-primary btn-sm" id="empty-new">+ Create a page</button></div>';
  setContent(html, true);
  $('#new-page')?.addEventListener('click', () => navigate('pages',{edit:''}));
  $('#empty-new')?.addEventListener('click', () => navigate('pages',{edit:''}));
  $('#content').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => navigate('pages',{edit:b.dataset.edit}));
  $('#content').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const slug = b.dataset.del;
    confirmDelete(slug, async () => {
      await API.del('pages', slug);
      toast('Deleted page "'+slug+'"');
      navigate('pages');
    });
  });
}

let pageState = null;
let pageDirty = false;
let selectedBlock = -1;

function pageMark(){
  if (pageDirty) return;
  pageDirty = true;
  const dot = $('#dirty-dot'); if (dot) dot.outerHTML = '<span id="dirty-dot" class="dot-dirty">unsaved</span>';
}

async function renderPageEdit(slug){
  const isNew = !slug;
  setTopbar({
    crumbs:'<a href="javascript:void(0)" id="back">Pages</a> / <strong style="color:var(--text)">'+(isNew?'New page':esc(slug))+'</strong>',
    actions:'<span id="dirty-dot"></span><button class="btn btn-outline btn-sm" id="cancel-btn">Cancel</button><button class="btn btn-primary btn-sm" id="save-btn">'+(isNew?'Create':'Save')+'</button>',
  });
  setContent('<div class="loading">Loading…</div>');

  let data = { title:'', description:'', pubDate:today(), draft:true, showInNav:false, navLabel:'', navOrder:0, blocks:[] };
  if (slug){
    const r = await API.get('pages', slug);
    if (r.error){ setContent('<div class="alert error">'+esc(r.error)+'</div>'); return; }
    data = { ...data, ...r.data };
    if (!Array.isArray(data.blocks)) data.blocks = [];
  }
  pageState = { slug: slug||'', data };
  pageDirty = false;
  selectedBlock = -1;

  $('#back').onclick = () => { if (pageDirty && !confirm('Discard changes?')) return; navigate('pages'); };
  $('#cancel-btn').onclick = () => $('#back').click();

  setContent(\`
    <div class="builder">
      <div>
        <div id="canvas" class="canvas"></div>
        <div id="add-row" class="add-row" style="margin-top:14px"></div>
      </div>
      <div class="side">
        <div class="side-section">
          <h3>Page settings</h3>
          <div class="field"><label>Title</label><input id="p-title" value="\${esc(data.title)}" placeholder="My page" /></div>
          <div class="field"><label>Description</label><input id="p-desc" value="\${esc(data.description)}" placeholder="For SEO and previews" /></div>
          <div class="field"><label>Slug \${isNew?'<span style="color:var(--text3);font-weight:normal">(URL: /your-slug)</span>':''}</label><input id="p-slug" value="\${esc(slug||'')}" \${slug?'disabled':''} placeholder="my-page" /></div>
          <div class="field"><label>Publish date</label><input id="p-date" type="date" value="\${esc(data.pubDate||today())}" /></div>
          <div class="toggle-row"><label for="p-draft">Draft (hidden)</label><input type="checkbox" id="p-draft" \${data.draft?'checked':''} /></div>
          <div class="toggle-row"><label for="p-shownav">Show in header nav</label><input type="checkbox" id="p-shownav" \${data.showInNav?'checked':''} /></div>
          <div class="field-row cols-2" style="margin-top:10px">
            <div class="field"><label>Nav label <span style="color:var(--text3);font-weight:normal">(optional)</span></label><input id="p-navlabel" value="\${esc(data.navLabel||'')}" placeholder="Defaults to title" /></div>
            <div class="field"><label>Nav order <span style="color:var(--text3);font-weight:normal">(asc)</span></label><input type="number" id="p-navorder" value="\${Number(data.navOrder)||0}" /></div>
          </div>
          <p style="font-size:11px;color:var(--text3);margin-top:4px">Slug <code>home</code> is rendered at <code>/</code>. Other slugs become <code>/your-slug</code>.</p>
        </div>
        <div class="side-section" id="block-inspector">
          <h3>Block inspector</h3>
          <p style="color:var(--text3);font-size:12px">Click a block on the left to edit its properties.</p>
        </div>
      </div>
    </div>
  \`);

  ['p-title','p-desc','p-slug','p-date','p-draft','p-shownav','p-navlabel','p-navorder'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => { pageMark(); syncSettings(); });
    el.addEventListener('change', () => { pageMark(); syncSettings(); });
  });
  if (isNew){
    const t = $('#p-title'), s = $('#p-slug');
    let touched = false;
    s.addEventListener('input', ()=>{ touched = true; });
    t.addEventListener('input', ()=>{ if (!touched) s.value = slugify(t.value); pageMark(); });
  }

  function syncSettings(){
    pageState.data.title    = $('#p-title').value.trim();
    pageState.data.description = $('#p-desc').value.trim();
    pageState.data.pubDate  = $('#p-date').value || today();
    pageState.data.draft    = $('#p-draft').checked;
    pageState.data.showInNav= $('#p-shownav').checked;
    pageState.data.navLabel = $('#p-navlabel').value.trim();
    pageState.data.navOrder = Number($('#p-navorder').value) || 0;
  }

  renderCanvas();
  renderAddRow();

  $('#save-btn').onclick = async () => {
    syncSettings();
    if (!pageState.data.title){ toast('Title is required.','error'); return; }
    const slugVal = (slug || $('#p-slug').value.trim() || slugify(pageState.data.title));
    if (!isSlug(slugVal)){ toast('Slug must be lowercase letters, numbers, and dashes.','error'); return; }
    const btn = $('#save-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving';
    const r = await API.save('pages', slug || slugVal, { slug: slugVal, data: pageState.data });
    btn.disabled = false; btn.textContent = isNew ? 'Create' : 'Save';
    if (r.error){ toast(r.error,'error'); return; }
    pageDirty = false;
    const dot = $('#dirty-dot'); if (dot) dot.outerHTML = '<span id="dirty-dot" class="dot-saved">saved</span>';
    toast('Saved page "'+slugVal+'"');
    if (isNew) navigate('pages',{edit:slugVal});
  };
}

function renderCanvas(){
  const canvas = $('#canvas');
  if (!pageState.data.blocks.length){
    canvas.innerHTML = '<div class="empty" style="border:1px dashed var(--border2);border-radius:var(--r2)"><div class="ico">▣</div>No blocks yet. Add your first block below.</div>';
    return;
  }
  canvas.innerHTML = pageState.data.blocks.map((b,i) => renderBlockCard(b,i)).join('');
  canvas.querySelectorAll('[data-bi]').forEach(card => {
    const i = +card.dataset.bi;
    card.onclick = (e) => {
      if (e.target.closest('[data-act]')) return;
      selectedBlock = i;
      document.querySelectorAll('[data-bi]').forEach(c => c.classList.toggle('selected', +c.dataset.bi === i));
      renderInspector();
    };
    card.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act==='up' && i>0){ const a = pageState.data.blocks; [a[i-1],a[i]]=[a[i],a[i-1]]; selectedBlock=i-1; pageMark(); renderCanvas(); renderInspector(); }
        else if (act==='down' && i<pageState.data.blocks.length-1){ const a = pageState.data.blocks; [a[i+1],a[i]]=[a[i],a[i+1]]; selectedBlock=i+1; pageMark(); renderCanvas(); renderInspector(); }
        else if (act==='dup'){ pageState.data.blocks.splice(i+1,0, JSON.parse(JSON.stringify(pageState.data.blocks[i]))); selectedBlock=i+1; pageMark(); renderCanvas(); renderInspector(); }
        else if (act==='del'){ pageState.data.blocks.splice(i,1); if (selectedBlock>=pageState.data.blocks.length) selectedBlock = pageState.data.blocks.length-1; pageMark(); renderCanvas(); renderInspector(); }
      };
    });
  });
}

function renderBlockCard(b, i){
  const def = BLOCK_DEFS[b.type] || { label:b.type, icon:'?' };
  let preview = '';
  if (b.type==='heading') preview = '<div style="text-align:'+(b.align||'left')+'"><h'+(b.level||2)+' style="font-size:'+(b.level===1?'1.5em':b.level===2?'1.3em':'1.1em')+';font-weight:600">'+(esc(b.text)||'<span style="color:var(--text3)">(empty heading)</span>')+'</h'+(b.level||2)+'></div>';
  else if (b.type==='paragraph') preview = '<div style="text-align:'+(b.align||'left')+'">'+(b.text?renderBlockMd(b.text):'<span style="color:var(--text3)">(empty paragraph)</span>')+'</div>';
  else if (b.type==='image') preview = b.src
      ? '<figure style="text-align:center"><img src="'+esc(b.src)+'" style="max-width:100%;max-height:200px;border-radius:6px" />'+(b.caption?'<figcaption style="font-size:12px;color:var(--text2);margin-top:4px">'+esc(b.caption)+'</figcaption>':'')+'</figure>'
      : '<div style="padding:24px;text-align:center;color:var(--text3);background:var(--bg2);border-radius:6px">No image selected</div>';
  else if (b.type==='button') preview = '<div style="text-align:'+(b.align||'left')+'"><span style="display:inline-block;padding:8px 16px;border-radius:6px;background:'+(b.style==='outline'?'transparent;border:1px solid var(--border2)':b.style==='ghost'?'transparent;color:var(--accent)':'var(--accent);color:#fff')+';font-size:13px">'+esc(b.text||'Button')+'</span> <span style="color:var(--text3);font-size:12px">→ '+esc(b.href||'#')+'</span></div>';
  else if (b.type==='columns') preview = '<div style="display:grid;grid-template-columns:repeat('+(b.columns?.length||2)+',1fr);gap:12px;font-size:12px;color:var(--text2)">'+(b.columns||[]).map(c=>'<div style="padding:10px;background:var(--bg2);border-radius:6px;min-height:48px">'+(c.markdown?renderBlockMd(c.markdown):'<em style="color:var(--text3)">empty</em>')+'</div>').join('')+'</div>';
  else if (b.type==='cards') preview = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-size:12px">'+(b.items||[]).map(it=>'<div style="padding:10px;border:1px solid var(--border);border-radius:6px"><strong>'+esc(it.title||'(untitled)')+'</strong><div style="color:var(--text2);margin-top:2px">'+esc(it.description||'')+'</div></div>').join('')+'</div>';
  else if (b.type==='divider') preview = '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0" />';
  else if (b.type==='spacer') preview = '<div style="height:'+(b.size==='sm'?'12px':b.size==='lg'?'48px':b.size==='xl'?'72px':'24px')+';background:repeating-linear-gradient(45deg,var(--bg2),var(--bg2) 6px,var(--bg3) 6px,var(--bg3) 12px);border-radius:4px"></div>';
  else if (b.type==='code') preview = '<pre style="background:var(--bg2);padding:10px;border-radius:6px;font-size:12px;overflow:auto;max-height:160px"><code>'+esc(b.code||'')+'</code></pre>';
  else if (b.type==='html') preview = '<div style="padding:10px;background:var(--bg2);border-radius:6px;font-family:monospace;font-size:12px;color:var(--text2);white-space:pre-wrap;overflow:auto;max-height:120px">'+esc(b.html||'')+'</div>';
  else if (b.type==='callout'){
    const colors = {info:'#0ea5e9',tip:'#10b981',warning:'#f59e0b',danger:'#f43f5e',note:'#71717a',success:'#22c55e'};
    const c = colors[b.variant] || colors.info;
    preview = '<div style="border-left:3px solid '+c+';background:var(--bg2);padding:8px 10px;border-radius:0 6px 6px 0;font-size:12px"><strong style="color:'+c+'">'+esc(b.variant||'info')+'</strong>'+(b.title?' · <strong>'+esc(b.title)+'</strong>':'')+'<div style="color:var(--text2);margin-top:4px">'+esc((b.text||'').slice(0,200))+'</div></div>';
  }
  else if (b.type==='quote') preview = '<div style="border-left:3px solid var(--accent);padding-left:10px;font-style:italic;color:var(--text2);font-size:13px">"'+esc((b.text||'').slice(0,160))+'"'+(b.author?'<div style="margin-top:4px;font-style:normal;font-size:12px;color:var(--text3)">— '+esc(b.author)+(b.source?', '+esc(b.source):'')+'</div>':'')+'</div>';
  else if (b.type==='video') preview = '<div style="padding:24px;background:var(--bg2);border-radius:6px;text-align:center;color:var(--text2);font-size:12px">▶ Video — '+esc(b.src||'(no source)')+'</div>';
  else if (b.type==='audio') preview = '<div style="padding:14px;background:var(--bg2);border-radius:6px;color:var(--text2);font-size:12px">♪ '+esc(b.title||b.src||'(no audio)')+'</div>';
  else if (b.type==='embed') preview = '<div style="padding:24px;background:var(--bg2);border-radius:6px;text-align:center;color:var(--text2);font-size:12px">⤴ Embed ('+esc(b.aspect||'16x9')+') — '+esc(b.url||'(no URL)')+'</div>';
  else if (b.type==='gallery') preview = '<div style="display:grid;grid-template-columns:repeat('+(b.columns||3)+',1fr);gap:4px">'+(b.items||[]).map(it=>it.src?'<img src="'+esc(it.src)+'" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:4px"/>':'<div style="aspect-ratio:1/1;background:var(--bg2);border-radius:4px"></div>').join('')+'</div>';
  else if (b.type==='accordion') preview = '<div style="font-size:12px">'+(b.items||[]).map(it=>'<div style="padding:6px 8px;border:1px solid var(--border);border-radius:4px;margin-bottom:4px">▸ <strong>'+esc(it.summary||'(empty)')+'</strong></div>').join('')+'</div>';
  else if (b.type==='tabs') preview = '<div style="font-size:12px"><div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:6px">'+(b.items||[]).map((it,i)=>'<span style="padding:4px 10px;border-bottom:2px solid '+(i===0?'var(--accent)':'transparent')+';color:'+(i===0?'var(--accent)':'var(--text2)')+'">'+esc(it.label||'tab')+'</span>').join('')+'</div><div style="color:var(--text2);padding:4px 0">'+esc(((b.items||[])[0]||{}).content?.slice(0,120) || '')+'</div></div>';
  else if (b.type==='stats') preview = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px">'+(b.items||[]).map(it=>'<div style="padding:8px;background:var(--bg2);border-radius:6px;text-align:center"><div style="font-size:18px;font-weight:700;color:var(--accent)">'+esc((it.prefix||'')+(it.value||'')+(it.suffix||''))+'</div><div style="font-size:10px;text-transform:uppercase;color:var(--text3)">'+esc(it.label||'')+'</div></div>').join('')+'</div>';
  else if (b.type==='timeline') preview = '<ol style="list-style:none;padding:0;margin:0;border-left:2px solid var(--border);padding-left:14px;font-size:12px">'+(b.items||[]).map(it=>'<li style="margin-bottom:8px"><div style="color:var(--text3);font-size:10px;text-transform:uppercase">'+esc(it.date||'')+'</div><strong>'+esc(it.title||'')+'</strong><div style="color:var(--text2)">'+esc((it.text||'').slice(0,80))+'</div></li>').join('')+'</ol>';
  else if (b.type==='progress'){
    const v = Math.max(0,Math.min(100,Number(b.value)||0));
    preview = '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>'+esc(b.label||'')+'</span><span style="color:var(--text3)">'+v+'%</span></div><div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+v+'%;background:var(--accent);transition:width .3s"></div></div></div>';
  }
  else if (b.type==='countdown') preview = '<div style="padding:14px;background:var(--bg2);border-radius:6px;text-align:center;font-size:12px;color:var(--text2)">⏱ '+esc(b.label||'Countdown')+' → <strong>'+esc(b.target||'(no target)')+'</strong></div>';
  else if (b.type==='mermaid') preview = '<pre style="background:var(--bg2);padding:10px;border-radius:6px;font-size:12px;font-family:monospace;color:var(--text2);overflow:auto;max-height:160px">◇ '+esc(b.code||'')+'</pre>';
  else if (b.type==='math') preview = '<div style="padding:10px;background:var(--bg2);border-radius:6px;font-family:serif;font-style:italic;text-align:center">∑ '+esc(b.code||'')+'</div>';
  else if (b.type==='runner') preview = '<div style="background:var(--bg2);border-radius:6px;overflow:hidden;font-size:12px"><div style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text2)">⚙ '+esc(b.title||'Playground')+'</div><pre style="padding:8px 10px;margin:0;font-family:monospace;color:var(--text2);max-height:120px;overflow:auto">'+esc(b.code||'')+'</pre></div>';
  else if (b.type==='marquee') preview = '<div style="overflow:hidden;background:var(--bg2);border-radius:6px;padding:6px 0;color:var(--text2);font-size:13px;white-space:nowrap">≫ '+esc(b.text||'').repeat(3)+'</div>';
  else if (b.type==='palette') preview = '<div style="display:flex;gap:4px;flex-wrap:wrap">'+(b.colors||[]).map(c=>'<div style="width:48px"><div style="height:32px;background:'+esc(c.hex||'#000')+';border-radius:4px"></div><div style="font-size:10px;color:var(--text3);margin-top:2px;text-align:center;font-family:monospace">'+esc(c.hex||'')+'</div></div>').join('')+'</div>';
  else if (b.type==='iframe-sandbox') preview = '<div style="font-family:monospace;font-size:11px;background:var(--bg2);border-radius:6px;padding:8px;color:var(--text2)">⛶ HTML/CSS/JS sandbox · '+(b.height||300)+'px tall</div>';
  else if (b.type==='collection-list'){
    const name = b.collection || '(none)';
    const valid = COLLECTIONS_CACHE.some(c => c.name === b.collection);
    const def = collectionDef(b.collection);
    const titleTxt = b.title || (def?.label || name);
    const detail = !b.collection
      ? '<span style="color:var(--warn)">Pick a collection in the inspector.</span>'
      : (!valid ? '<span style="color:var(--warn)">Collection "'+esc(name)+'" is not defined.</span>'
        : 'Renders '+(Number(b.limit)>0?b.limit:'all')+' '+(b.featuredOnly?'featured ':'')+esc(def?.label?.toLowerCase() || name)+' at build time.');
    preview = '<div style="padding:10px;background:var(--bg2);border-radius:6px;font-size:12px"><div style="color:var(--text3);text-transform:uppercase;font-size:10px;margin-bottom:4px">⛁ '+esc(titleTxt)+' · /'+esc(name)+'</div><div style="color:var(--text2)">'+detail+'</div></div>';
  }

  return \`<div class="block\${selectedBlock===i?' selected':''}" data-bi="\${i}">
    <div class="block-head">
      <span style="font-size:13px">\${def.icon}</span>
      <span class="block-type">\${esc(def.label)}</span>
      <div class="block-actions">
        <button class="btn btn-ghost btn-icon btn-xs" data-act="up" title="Move up">↑</button>
        <button class="btn btn-ghost btn-icon btn-xs" data-act="down" title="Move down">↓</button>
        <button class="btn btn-ghost btn-icon btn-xs" data-act="dup" title="Duplicate">⧉</button>
        <button class="btn btn-danger btn-icon btn-xs" data-act="del" title="Delete">×</button>
      </div>
    </div>
    <div class="block-body">\${preview}</div>
  </div>\`;
}

function renderAddRow(){
  const row = $('#add-row');
  row.innerHTML = '<div class="label">Add a block</div>'
    + Object.entries(BLOCK_DEFS).map(([k,d]) =>
      '<button class="btn btn-outline btn-sm" data-add="'+k+'"><span style="margin-right:4px">'+d.icon+'</span>'+esc(d.label)+'</button>'
    ).join('');
  row.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const k = b.dataset.add;
    pageState.data.blocks.push(BLOCK_DEFS[k].default());
    selectedBlock = pageState.data.blocks.length - 1;
    pageMark();
    renderCanvas();
    renderInspector();
    document.querySelector('[data-bi="'+selectedBlock+'"]')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
}

function renderInspector(){
  const host = $('#block-inspector');
  if (selectedBlock < 0 || !pageState.data.blocks[selectedBlock]){
    host.innerHTML = '<h3>Block inspector</h3><p style="color:var(--text3);font-size:12px">Click a block on the left to edit its properties.</p>';
    return;
  }
  const b = pageState.data.blocks[selectedBlock];
  const def = BLOCK_DEFS[b.type];
  host.innerHTML = '<h3>'+esc(def.label)+' — block #' + (selectedBlock+1) + '</h3>' + buildInspector(b);
  bindInspector(b, host);
}

function buildInspector(b){
  if (b.type==='heading') return \`
    <div class="field-row cols-2">
      <div class="field"><label>Level</label><select data-k="level">\${[1,2,3].map(l=>'<option value="'+l+'"'+(b.level===l?' selected':'')+'>H'+l+'</option>').join('')}</select></div>
      <div class="field"><label>Align</label><select data-k="align">\${['left','center','right'].map(a=>'<option value="'+a+'"'+(b.align===a?' selected':'')+'>'+a+'</option>').join('')}</select></div>
    </div>
    <div class="field"><label>Text</label><input data-k="text" value="\${esc(b.text||'')}" /></div>\`;
  if (b.type==='paragraph') return \`
    <div class="field"><label>Align</label><select data-k="align">\${['left','center','right'].map(a=>'<option value="'+a+'"'+(b.align===a?' selected':'')+'>'+a+'</option>').join('')}</select></div>
    <div class="field"><label>Text <span style="color:var(--text3);font-weight:normal">(supports **bold**, *italic*, [link](url))</span></label><textarea data-k="text" rows="6">\${esc(b.text||'')}</textarea></div>\`;
  if (b.type==='image') return \`
    <div class="field"><label>Image URL</label>
      <div style="display:flex;gap:6px"><input data-k="src" value="\${esc(b.src||'')}" placeholder="/uploads/photo.jpg" style="flex:1" /><button class="btn btn-secondary btn-sm" data-pick="src">Pick</button></div>
    </div>
    <div class="field"><label>Alt text</label><input data-k="alt" value="\${esc(b.alt||'')}" /></div>
    <div class="field"><label>Caption</label><input data-k="caption" value="\${esc(b.caption||'')}" /></div>
    <div class="field"><label>Width</label><select data-k="width">\${['sm','md','lg','full'].map(w=>'<option value="'+w+'"'+(b.width===w?' selected':'')+'>'+w+'</option>').join('')}</select></div>\`;
  if (b.type==='button') return \`
    <div class="field"><label>Text</label><input data-k="text" value="\${esc(b.text||'')}" /></div>
    <div class="field"><label>Link URL</label><input data-k="href" value="\${esc(b.href||'')}" placeholder="/about or https://…" /></div>
    <div class="field-row cols-2">
      <div class="field"><label>Style</label><select data-k="style">\${['primary','outline','ghost'].map(s=>'<option value="'+s+'"'+(b.style===s?' selected':'')+'>'+s+'</option>').join('')}</select></div>
      <div class="field"><label>Align</label><select data-k="align">\${['left','center','right'].map(a=>'<option value="'+a+'"'+(b.align===a?' selected':'')+'>'+a+'</option>').join('')}</select></div>
    </div>
    <div class="toggle-row"><label>Open in new tab</label><input type="checkbox" data-k="newTab" \${b.newTab?'checked':''} /></div>\`;
  if (b.type==='columns'){
    const colHtml = (b.columns||[]).map((c,i) => \`
      <div class="field"><label>Column \${i+1} <button class="btn btn-danger btn-xs" data-rmcol="\${i}" style="float:right">remove</button></label>
      <textarea data-coli="\${i}" rows="4">\${esc(c.markdown||'')}</textarea></div>\`).join('');
    return \`<div class="field-row cols-2"><button class="btn btn-secondary btn-sm" data-addcol>+ Add column</button><div></div></div>
      \${colHtml}\`;
  }
  if (b.type==='cards'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field"><label>Title <button class="btn btn-danger btn-xs" data-rmcard="\${i}" style="float:right">remove</button></label><input data-cardk="title" data-ci="\${i}" value="\${esc(it.title||'')}" /></div>
        <div class="field"><label>Description</label><input data-cardk="description" data-ci="\${i}" value="\${esc(it.description||'')}" /></div>
        <div class="field-row cols-2">
          <div class="field"><label>Link URL</label><input data-cardk="href" data-ci="\${i}" value="\${esc(it.href||'')}" /></div>
          <div class="field"><label>Icon (emoji)</label><input data-cardk="icon" data-ci="\${i}" value="\${esc(it.icon||'')}" /></div>
        </div>
      </div>\`).join('');
    return '<button class="btn btn-secondary btn-sm" data-addcard>+ Add card</button><div style="margin-top:10px">'+itHtml+'</div>';
  }
  if (b.type==='divider') return '<p style="font-size:12px;color:var(--text3)">Renders a horizontal line. No options.</p>';
  if (b.type==='spacer') return \`<div class="field"><label>Size</label><select data-k="size">\${['sm','md','lg','xl'].map(s=>'<option value="'+s+'"'+(b.size===s?' selected':'')+'>'+s+'</option>').join('')}</select></div>\`;
  if (b.type==='code') return \`
    <div class="field"><label>Language (optional)</label><input data-k="lang" value="\${esc(b.lang||'')}" placeholder="js, ts, html…" /></div>
    <div class="field"><label>Code</label><textarea data-k="code" class="editor" rows="10">\${esc(b.code||'')}</textarea></div>\`;
  if (b.type==='html') return '<div class="field"><label>Custom HTML <span style="color:var(--text3);font-weight:normal">(advanced)</span></label><textarea data-k="html" class="editor" rows="10">'+esc(b.html||'')+'</textarea></div>';

  if (b.type==='callout') return \`
    <div class="field-row cols-2">
      <div class="field"><label>Variant</label><select data-k="variant">\${['info','tip','warning','danger','note','success'].map(v=>'<option value="'+v+'"'+(b.variant===v?' selected':'')+'>'+v+'</option>').join('')}</select></div>
      <div class="field"><label>Icon (emoji, optional)</label><input data-k="icon" value="\${esc(b.icon||'')}" placeholder="overrides default" /></div>
    </div>
    <div class="field"><label>Title (optional)</label><input data-k="title" value="\${esc(b.title||'')}" /></div>
    <div class="field"><label>Text <span style="color:var(--text3);font-weight:normal">(supports **bold**, *italic*, [link](url))</span></label><textarea data-k="text" rows="4">\${esc(b.text||'')}</textarea></div>\`;

  if (b.type==='quote') return \`
    <div class="field"><label>Text</label><textarea data-k="text" rows="4">\${esc(b.text||'')}</textarea></div>
    <div class="field-row cols-2">
      <div class="field"><label>Author</label><input data-k="author" value="\${esc(b.author||'')}" /></div>
      <div class="field"><label>Source</label><input data-k="source" value="\${esc(b.source||'')}" /></div>
    </div>
    <div class="field"><label>Source link (optional)</label><input data-k="sourceHref" value="\${esc(b.sourceHref||'')}" placeholder="https://…" /></div>\`;

  if (b.type==='video') return \`
    <div class="field"><label>Source URL <span style="color:var(--text3);font-weight:normal">(.mp4/.webm or YouTube/Vimeo URL)</span></label>
      <div style="display:flex;gap:6px"><input data-k="src" value="\${esc(b.src||'')}" style="flex:1" /><button class="btn btn-secondary btn-sm" data-pick="src">Pick</button></div>
    </div>
    <div class="field"><label>Poster image (optional)</label>
      <div style="display:flex;gap:6px"><input data-k="poster" value="\${esc(b.poster||'')}" style="flex:1" /><button class="btn btn-secondary btn-sm" data-pick="poster">Pick</button></div>
    </div>
    <div class="field"><label>Caption</label><input data-k="caption" value="\${esc(b.caption||'')}" /></div>
    <div class="toggle-row"><label>Controls</label><input type="checkbox" data-k="controls" \${b.controls!==false?'checked':''} /></div>
    <div class="toggle-row"><label>Autoplay</label><input type="checkbox" data-k="autoplay" \${b.autoplay?'checked':''} /></div>
    <div class="toggle-row"><label>Loop</label><input type="checkbox" data-k="loop" \${b.loop?'checked':''} /></div>
    <div class="toggle-row"><label>Muted</label><input type="checkbox" data-k="muted" \${b.muted?'checked':''} /></div>\`;

  if (b.type==='audio') return \`
    <div class="field"><label>Source URL</label>
      <div style="display:flex;gap:6px"><input data-k="src" value="\${esc(b.src||'')}" style="flex:1" /><button class="btn btn-secondary btn-sm" data-pick="src">Pick</button></div>
    </div>
    <div class="field"><label>Title</label><input data-k="title" value="\${esc(b.title||'')}" /></div>
    <div class="field"><label>Caption</label><input data-k="caption" value="\${esc(b.caption||'')}" /></div>\`;

  if (b.type==='embed') return \`
    <div class="field"><label>URL <span style="color:var(--text3);font-weight:normal">(YouTube/Vimeo/CodePen/iframe-friendly URL)</span></label><input data-k="url" value="\${esc(b.url||'')}" placeholder="https://…" /></div>
    <div class="field-row cols-2">
      <div class="field"><label>Aspect ratio</label><select data-k="aspect">\${['16x9','4x3','1x1','9x16'].map(a=>'<option value="'+a+'"'+(b.aspect===a?' selected':'')+'>'+a+'</option>').join('')}</select></div>
      <div class="field"><label>Title (a11y)</label><input data-k="title" value="\${esc(b.title||'')}" /></div>
    </div>\`;

  if (b.type==='gallery'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field"><label>Image \${i+1} <button class="btn btn-danger btn-xs" data-rm-arr="items" data-rm-i="\${i}" style="float:right">remove</button></label>
          <div style="display:flex;gap:6px"><input data-list="items" data-li="\${i}" data-lk="src" value="\${esc(it.src||'')}" style="flex:1" /></div>
        </div>
        <div class="field-row cols-2">
          <div class="field"><label>Alt</label><input data-list="items" data-li="\${i}" data-lk="alt" value="\${esc(it.alt||'')}" /></div>
          <div class="field"><label>Caption</label><input data-list="items" data-li="\${i}" data-lk="caption" value="\${esc(it.caption||'')}" /></div>
        </div>
      </div>\`).join('');
    return \`
      <div class="field"><label>Columns</label><input type="number" min="1" max="6" data-k="columns" value="\${b.columns||3}" /></div>
      <button class="btn btn-secondary btn-sm" data-list-add="items" data-template='{"src":"","alt":"","caption":""}'>+ Add image</button>
      <div style="margin-top:10px">\${itHtml}</div>\`;
  }

  if (b.type==='accordion'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field"><label>Item \${i+1} <button class="btn btn-danger btn-xs" data-rm-arr="items" data-rm-i="\${i}" style="float:right">remove</button></label>
          <input data-list="items" data-li="\${i}" data-lk="summary" value="\${esc(it.summary||'')}" placeholder="Summary / question" />
        </div>
        <div class="field"><label>Content</label><textarea data-list="items" data-li="\${i}" data-lk="content" rows="3">\${esc(it.content||'')}</textarea></div>
        <div class="toggle-row"><label>Open by default</label><input type="checkbox" data-list="items" data-li="\${i}" data-lk="open" \${it.open?'checked':''} /></div>
      </div>\`).join('');
    return '<button class="btn btn-secondary btn-sm" data-list-add="items" data-template=\\'{"summary":"New item","content":"","open":false}\\'>+ Add item</button><div style="margin-top:10px">'+itHtml+'</div>';
  }

  if (b.type==='tabs'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field"><label>Tab \${i+1} <button class="btn btn-danger btn-xs" data-rm-arr="items" data-rm-i="\${i}" style="float:right">remove</button></label>
          <input data-list="items" data-li="\${i}" data-lk="label" value="\${esc(it.label||'')}" placeholder="Label" />
        </div>
        <div class="field"><label>Content</label><textarea data-list="items" data-li="\${i}" data-lk="content" rows="3">\${esc(it.content||'')}</textarea></div>
      </div>\`).join('');
    return '<button class="btn btn-secondary btn-sm" data-list-add="items" data-template=\\'{"label":"New tab","content":""}\\'>+ Add tab</button><div style="margin-top:10px">'+itHtml+'</div>';
  }

  if (b.type==='stats'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field-row cols-2">
          <div class="field"><label>Value <button class="btn btn-danger btn-xs" data-rm-arr="items" data-rm-i="\${i}" style="float:right">remove</button></label>
            <input data-list="items" data-li="\${i}" data-lk="value" value="\${esc(it.value||'')}" placeholder="42" />
          </div>
          <div class="field"><label>Label</label><input data-list="items" data-li="\${i}" data-lk="label" value="\${esc(it.label||'')}" /></div>
        </div>
        <div class="field-row cols-2">
          <div class="field"><label>Prefix</label><input data-list="items" data-li="\${i}" data-lk="prefix" value="\${esc(it.prefix||'')}" placeholder="$" /></div>
          <div class="field"><label>Suffix</label><input data-list="items" data-li="\${i}" data-lk="suffix" value="\${esc(it.suffix||'')}" placeholder="%" /></div>
        </div>
        <div class="toggle-row"><label>Animate on scroll</label><input type="checkbox" data-list="items" data-li="\${i}" data-lk="animate" \${it.animate!==false?'checked':''} /></div>
      </div>\`).join('');
    return '<button class="btn btn-secondary btn-sm" data-list-add="items" data-template=\\'{"value":"0","label":"","prefix":"","suffix":"","animate":true}\\'>+ Add stat</button><div style="margin-top:10px">'+itHtml+'</div>';
  }

  if (b.type==='timeline'){
    const itHtml = (b.items||[]).map((it,i) => \`
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div class="field-row cols-2">
          <div class="field"><label>Date <button class="btn btn-danger btn-xs" data-rm-arr="items" data-rm-i="\${i}" style="float:right">remove</button></label>
            <input data-list="items" data-li="\${i}" data-lk="date" value="\${esc(it.date||'')}" />
          </div>
          <div class="field"><label>Title</label><input data-list="items" data-li="\${i}" data-lk="title" value="\${esc(it.title||'')}" /></div>
        </div>
        <div class="field"><label>Text</label><textarea data-list="items" data-li="\${i}" data-lk="text" rows="2">\${esc(it.text||'')}</textarea></div>
      </div>\`).join('');
    return '<button class="btn btn-secondary btn-sm" data-list-add="items" data-template=\\'{"date":"","title":"","text":""}\\'>+ Add event</button><div style="margin-top:10px">'+itHtml+'</div>';
  }

  if (b.type==='progress') return \`
    <div class="field"><label>Label</label><input data-k="label" value="\${esc(b.label||'')}" /></div>
    <div class="field"><label>Value (0–100)</label><input type="number" min="0" max="100" data-k="value" value="\${Number(b.value)||0}" /></div>
    <div class="toggle-row"><label>Show value %</label><input type="checkbox" data-k="showValue" \${b.showValue!==false?'checked':''} /></div>
    <div class="toggle-row"><label>Striped (animated)</label><input type="checkbox" data-k="striped" \${b.striped?'checked':''} /></div>\`;

  if (b.type==='countdown') return \`
    <div class="field"><label>Target date/time <span style="color:var(--text3);font-weight:normal">(YYYY-MM-DD or ISO)</span></label><input data-k="target" value="\${esc(b.target||'')}" placeholder="2026-12-31T00:00:00" /></div>
    <div class="field"><label>Label</label><input data-k="label" value="\${esc(b.label||'')}" /></div>
    <div class="field"><label>Finished text</label><input data-k="finishedText" value="\${esc(b.finishedText||'')}" /></div>\`;

  if (b.type==='mermaid') return \`
    <div class="field"><label>Mermaid syntax <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" style="color:var(--accent);font-weight:normal;font-size:11px">(docs ↗)</a></label><textarea data-k="code" class="editor" rows="8">\${esc(b.code||'')}</textarea></div>
    <div class="field"><label>Caption</label><input data-k="caption" value="\${esc(b.caption||'')}" /></div>\`;

  if (b.type==='math') return \`
    <div class="field"><label>LaTeX (KaTeX) <a href="https://katex.org/docs/supported.html" target="_blank" style="color:var(--accent);font-weight:normal;font-size:11px">(supported ↗)</a></label><textarea data-k="code" class="editor" rows="3">\${esc(b.code||'')}</textarea></div>
    <div class="toggle-row"><label>Display mode (block)</label><input type="checkbox" data-k="display" \${b.display!==false?'checked':''} /></div>\`;

  if (b.type==='runner') return \`
    <div class="field"><label>Title</label><input data-k="title" value="\${esc(b.title||'')}" /></div>
    <div class="field"><label>JavaScript code <span style="color:var(--text3);font-weight:normal">(use \\\`return\\\` to display a value, \\\`console.log\\\` to log)</span></label><textarea data-k="code" class="editor" rows="8">\${esc(b.code||'')}</textarea></div>
    <div class="toggle-row"><label>Auto-run on page load</label><input type="checkbox" data-k="autoRun" \${b.autoRun?'checked':''} /></div>\`;

  if (b.type==='marquee') return \`
    <div class="field"><label>Text</label><input data-k="text" value="\${esc(b.text||'')}" /></div>
    <div class="field-row cols-2">
      <div class="field"><label>Speed</label><select data-k="speed">\${['slow','normal','fast'].map(s=>'<option value="'+s+'"'+(b.speed===s?' selected':'')+'>'+s+'</option>').join('')}</select></div>
      <div class="field"><label>Separator icon</label><input data-k="icon" value="\${esc(b.icon||'')}" /></div>
    </div>
    <div class="toggle-row"><label>Reverse direction</label><input type="checkbox" data-k="reverse" \${b.reverse?'checked':''} /></div>\`;

  if (b.type==='palette'){
    const itHtml = (b.colors||[]).map((it,i) => \`
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <input type="color" data-list="colors" data-li="\${i}" data-lk="hex" value="\${esc(it.hex||'#000000')}" style="width:40px;height:32px;padding:0;border:1px solid var(--border);border-radius:4px;background:transparent" />
        <input data-list="colors" data-li="\${i}" data-lk="hex" value="\${esc(it.hex||'')}" placeholder="#hex" style="font-family:monospace;flex:0 0 110px" />
        <input data-list="colors" data-li="\${i}" data-lk="name" value="\${esc(it.name||'')}" placeholder="Name" style="flex:1" />
        <button class="btn btn-danger btn-xs" data-rm-arr="colors" data-rm-i="\${i}">×</button>
      </div>\`).join('');
    return \`
      <div class="field"><label>Label (optional)</label><input data-k="label" value="\${esc(b.label||'')}" /></div>
      <button class="btn btn-secondary btn-sm" data-list-add="colors" data-template='{"name":"","hex":"#6366f1"}'>+ Add color</button>
      <div style="margin-top:10px">\${itHtml}</div>\`;
  }

  if (b.type==='iframe-sandbox') return \`
    <div class="field"><label>Height (px)</label><input type="number" min="100" max="2000" data-k="height" value="\${Number(b.height)||300}" /></div>
    <div class="field"><label>HTML</label><textarea data-k="html" class="editor" rows="5">\${esc(b.html||'')}</textarea></div>
    <div class="field"><label>CSS</label><textarea data-k="css" class="editor" rows="4">\${esc(b.css||'')}</textarea></div>
    <div class="field"><label>JS</label><textarea data-k="js" class="editor" rows="5">\${esc(b.js||'')}</textarea></div>\`;

  if (b.type==='collection-list'){
    const opts = COLLECTIONS_CACHE.length
      ? COLLECTIONS_CACHE.map(c => '<option value="'+esc(c.name)+'"'+(b.collection===c.name?' selected':'')+'>'+esc(c.label||c.name)+' (/'+esc(c.name)+')</option>').join('')
      : '<option value="">No collections defined yet</option>';
    return \`
      <div class="field"><label>Collection</label>
        <select data-k="collection">
          <option value="" \${!b.collection?'selected':''}>— pick one —</option>
          \${opts}
        </select>
        <p style="font-size:11px;color:var(--text3);margin-top:4px">Manage collections in the sidebar's <strong>Manage collections</strong> section.</p>
      </div>
      <div class="field"><label>Section title <span style="color:var(--text3);font-weight:normal">(empty = use collection label)</span></label><input data-k="title" value="\${esc(b.title||'')}" /></div>
      <div class="field"><label>How many items <span style="color:var(--text3);font-weight:normal">(0 = show all)</span></label><input type="number" min="0" max="100" data-k="limit" value="\${Number(b.limit)||0}" /></div>
      <div class="toggle-row"><label>Featured only <span style="color:var(--text3);font-weight:normal">(filter by item.featured)</span></label><input type="checkbox" data-k="featuredOnly" \${b.featuredOnly?'checked':''} /></div>
      <div class="toggle-row"><label>Show "All →" link <span style="color:var(--text3);font-weight:normal">(only when limit > 0)</span></label><input type="checkbox" data-k="showAllLink" \${b.showAllLink!==false?'checked':''} /></div>\`;
  }

  return '';
}

function bindInspector(b, host){
  // Generic data-k inputs
  host.querySelectorAll('[data-k]').forEach(el => {
    const key = el.dataset.k;
    const upd = () => {
      let v = el.type==='checkbox' ? el.checked : el.value;
      if (key==='level') v = parseInt(v,10);
      else if (el.type === 'number') {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) v = n;
      }
      b[key] = v;
      pageMark();
      renderCanvas();
    };
    el.addEventListener('input', upd);
    el.addEventListener('change', upd);
  });
  // Image picker
  host.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
    openMediaPicker(url => {
      b[btn.dataset.pick] = url;
      pageMark();
      renderInspector();
      renderCanvas();
    });
  });
  // Columns
  host.querySelector('[data-addcol]')?.addEventListener('click', () => {
    if (!b.columns) b.columns = [];
    if (b.columns.length >= 3){ toast('Max 3 columns','error'); return; }
    b.columns.push({markdown:''});
    pageMark(); renderInspector(); renderCanvas();
  });
  host.querySelectorAll('[data-coli]').forEach(ta => {
    ta.addEventListener('input', () => {
      b.columns[+ta.dataset.coli].markdown = ta.value;
      pageMark(); renderCanvas();
    });
  });
  host.querySelectorAll('[data-rmcol]').forEach(btn => btn.onclick = () => {
    if ((b.columns||[]).length <= 1){ toast('Need at least 1 column','error'); return; }
    b.columns.splice(+btn.dataset.rmcol, 1);
    pageMark(); renderInspector(); renderCanvas();
  });
  // Cards
  host.querySelector('[data-addcard]')?.addEventListener('click', () => {
    if (!b.items) b.items = [];
    b.items.push({title:'New card',description:'',href:'',icon:''});
    pageMark(); renderInspector(); renderCanvas();
  });
  host.querySelectorAll('[data-cardk]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.ci;
      b.items[i][inp.dataset.cardk] = inp.value;
      pageMark(); renderCanvas();
    });
  });
  host.querySelectorAll('[data-rmcard]').forEach(btn => btn.onclick = () => {
    b.items.splice(+btn.dataset.rmcard, 1);
    pageMark(); renderInspector(); renderCanvas();
  });
  // ── Generic list inputs (used by gallery, accordion, tabs, stats, timeline, palette) ──
  host.querySelectorAll('[data-list]').forEach(el => {
    const arr = el.dataset.list;
    const i = +el.dataset.li;
    const k = el.dataset.lk;
    const upd = () => {
      let v = el.type==='checkbox' ? el.checked : el.value;
      if (!Array.isArray(b[arr])) b[arr] = [];
      while (b[arr].length <= i) b[arr].push({});
      b[arr][i][k] = v;
      pageMark(); renderCanvas();
    };
    el.addEventListener('input', upd);
    el.addEventListener('change', upd);
  });
  host.querySelectorAll('[data-list-add]').forEach(btn => btn.onclick = () => {
    const arr = btn.dataset.listAdd;
    let tpl = {};
    try { tpl = btn.dataset.template ? JSON.parse(btn.dataset.template) : {}; } catch(_) {}
    if (!Array.isArray(b[arr])) b[arr] = [];
    b[arr].push({...tpl});
    pageMark(); renderInspector(); renderCanvas();
  });
  host.querySelectorAll('[data-rm-arr]').forEach(btn => btn.onclick = () => {
    const arr = btn.dataset.rmArr;
    const i = +btn.dataset.rmI;
    if (Array.isArray(b[arr])) {
      b[arr].splice(i, 1);
      pageMark(); renderInspector(); renderCanvas();
    }
  });
}

// ─── Collections manager ───
async function renderCollectionsList(){
  setTopbar({
    crumbs:'<strong style="color:var(--text)">Collections</strong> <span style="color:var(--text3)">— add, rename, delete data lists</span>',
    actions:'<button class="btn btn-primary btn-sm" id="new-coll">+ New collection</button>',
  });
  setContent('<div class="loading">Loading…</div>', true);
  const items = await API.collections();
  const html = items.length ? \`
    <p style="color:var(--text2);font-size:13px;margin-bottom:12px">Each collection is a data list. The <strong>Collection list</strong> page-builder block reads from one by name.</p>
    <div class="card card-pad">
      \${items.map(c => \`
        <div class="list-item">
          <div class="item-info">
            <div class="item-title"><span style="margin-right:6px">\${esc(c.icon||'◫')}</span>\${esc(c.label||c.name)}</div>
            <div class="item-desc">/\${esc(c.name)} · singular: \${esc(c.labelOne||c.name)}</div>
            <div class="item-meta">
              <span>\${c.total ?? 0} item\${c.total===1?'':'s'}</span>
              \${c.drafts?'<span class="badge draft">'+c.drafts+' drafts</span>':''}
              \${c.featured?'<span class="badge featured">'+c.featured+' featured</span>':''}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-ghost btn-sm" data-open="\${esc(c.name)}">Items</button>
            <button class="btn btn-ghost btn-sm" data-edit="\${esc(c.name)}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="\${esc(c.name)}">Delete</button>
          </div>
        </div>
      \`).join('')}
    </div>
  \` : '<div class="empty"><div class="ico">⛁</div>No collections yet. Create one to start adding data.<br><br><button class="btn btn-primary btn-sm" id="empty-new">+ Create a collection</button></div>';
  setContent(html, true);

  const openEditor = (existing) => openCollectionDialog(existing);
  $('#new-coll')?.addEventListener('click', () => openEditor(null));
  $('#empty-new')?.addEventListener('click', () => openEditor(null));
  $('#content').querySelectorAll('[data-open]').forEach(b => b.onclick = () => navigate('items', { collection: b.dataset.open }));
  $('#content').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const c = items.find(x => x.name === b.dataset.edit);
    if (c) openEditor(c);
  });
  $('#content').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const name = b.dataset.del;
    const c = items.find(x => x.name === name);
    const total = c?.total || 0;
    const wipeChoice = total > 0
      ? '<div class="toggle-row"><label>Also delete '+total+' file(s) on disk in /content/'+esc(name)+'/</label><input type="checkbox" id="coll-wipe" /></div>'
      : '';
    modal({
      title: 'Delete collection',
      body: '<p>Remove the <strong>'+esc(name)+'</strong> collection definition?'+(total>0?' '+total+' item file(s) currently exist.':'')+'</p>'+wipeChoice,
      okText: 'Delete', okStyle: 'btn-danger',
      onOk: async (wrap) => {
        const wipe = wrap.querySelector('#coll-wipe')?.checked || false;
        const r = await API.collDelete(name, wipe);
        if (r.error){ toast(r.error, 'error'); return false; }
        toast('Deleted collection "'+name+'"');
        await refreshCollectionsCache();
        navigate('collections');
      },
    });
  });
}

function openCollectionDialog(existing){
  const isNew = !existing;
  const e = existing || { name:'', label:'', labelOne:'', icon:'◫' };
  const body = \`
    <div class="field"><label>Name <span style="color:var(--text3);font-weight:normal">(URL slug, lowercase a-z 0-9 -)</span></label>
      <input id="cd-name" value="\${esc(e.name)}" placeholder="e.g. recipes" />
    </div>
    <div class="field-row cols-2">
      <div class="field"><label>Label <span style="color:var(--text3);font-weight:normal">(plural, sidebar)</span></label>
        <input id="cd-label" value="\${esc(e.label)}" placeholder="Recipes" />
      </div>
      <div class="field"><label>Singular label <span style="color:var(--text3);font-weight:normal">(buttons)</span></label>
        <input id="cd-one" value="\${esc(e.labelOne)}" placeholder="Recipe" />
      </div>
    </div>
    <div class="field"><label>Icon <span style="color:var(--text3);font-weight:normal">(emoji or symbol)</span></label>
      <input id="cd-icon" value="\${esc(e.icon||'◫')}" maxlength="4" style="width:80px" />
    </div>
    \${!isNew?'<p style="font-size:11px;color:var(--text3)">Renaming moves <code>/content/'+esc(e.name)+'/</code> to the new name. Update any <code>collection-list</code> blocks that reference the old name.</p>':'<p style="font-size:11px;color:var(--text3)">Files will live in <code>/content/&lt;name&gt;/*.md</code> and items render at <code>/&lt;name&gt;/&lt;slug&gt;</code>.</p>'}
  \`;
  modal({
    title: isNew ? 'New collection' : 'Edit collection',
    body,
    okText: isNew ? 'Create' : 'Save',
    onOk: async (wrap) => {
      const g = id => wrap.querySelector('#'+id).value.trim();
      const name = g('cd-name');
      if (!isSlug(name)){ toast('Name must be lowercase letters, numbers, dashes.', 'error'); return false; }
      const payload = {
        name,
        label: g('cd-label') || name,
        labelOne: g('cd-one') || name,
        icon: g('cd-icon') || '◫',
      };
      const r = isNew ? await API.collCreate(payload) : await API.collUpdate(existing.name, payload);
      if (r.error){ toast(r.error, 'error'); return false; }
      toast(isNew ? 'Created "'+name+'"' : 'Saved "'+name+'"');
      await refreshCollectionsCache();
      navigate('collections');
    },
  });
}

// ─── Site settings ───
async function renderSite(){
  setTopbar({
    crumbs:'<strong style="color:var(--text)">Site</strong>',
    actions:'<span id="dirty-dot"></span><button class="btn btn-primary btn-sm" id="save-site">Save</button>',
  });
  setContent('<div class="loading">Loading…</div>', true);
  const s = await API.list('site');
  const theme = s.theme || {};
  const features = s.features || {};
  const palettes = ['indigo','rose','emerald','amber','sky','violet','crimson','lime'];
  const swatch = { indigo:'#6366f1', rose:'#f43f5e', emerald:'#10b981', amber:'#f59e0b', sky:'#0ea5e9', violet:'#8b5cf6', crimson:'#ef4444', lime:'#84cc16' };
  setContent(\`
    <div class="card">
      <p style="color:var(--text2);font-size:13px;margin-bottom:16px">Site-wide metadata. Used in <code>&lt;title&gt;</code>, OpenGraph tags, and the home/about pages.</p>
      <div class="field-row cols-2">
        <div class="field"><label>Site title</label><input id="s-title" value="\${esc(s.title||'')}" placeholder="iruki.dev" /></div>
        <div class="field"><label>Author</label><input id="s-author" value="\${esc(s.author||'')}" placeholder="iruki" /></div>
      </div>
      <div class="field"><label>Description</label><textarea id="s-desc" rows="2">\${esc(s.description||'')}</textarea></div>
      <div class="field"><label>Production URL</label><input id="s-url" value="\${esc(s.url||'')}" placeholder="https://iruki.dev" /></div>
      <div class="field-row cols-2">
        <div class="field"><label>Email</label><input id="s-email" value="\${esc(s.email||'')}" placeholder="me@iruki.dev" /></div>
        <div class="field"><label>GitHub URL</label><input id="s-github" value="\${esc(s.github||'')}" placeholder="https://github.com/…" /></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:600">Theme</h3>
      <div class="field"><label>Accent palette</label>
        <div id="palette-picker" style="display:flex;gap:6px;flex-wrap:wrap">
          \${palettes.map(p => \`
            <button type="button" data-palette="\${p}" class="\${(theme.palette||'indigo')===p?'palette-active':''}"
              style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer;font-size:12px;color:var(--text)">
              <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:\${swatch[p]}"></span>\${p}
            </button>\`).join('')}
        </div>
        <p style="color:var(--text3);font-size:11px;margin-top:6px">Visitors see this palette site-wide. They can still toggle light/dark.</p>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:600">Features</h3>
      <div class="toggle-row"><label>Reading progress bar <span style="color:var(--text3);font-weight:normal">(top scroll indicator)</span></label><input type="checkbox" id="f-reading" \${features.readingProgress!==false?'checked':''} /></div>
      <div class="toggle-row"><label>Back-to-top button</label><input type="checkbox" id="f-back" \${features.backToTop!==false?'checked':''} /></div>
      <div class="toggle-row"><label>Konami code easter egg</label><input type="checkbox" id="f-konami" \${features.konami?'checked':''} /></div>
    </div>

    <style>
      .palette-active { border-color: var(--accent) !important; box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 25%, transparent); }
      .toggle-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; }
    </style>
  \`, true);

  let dirty = false;
  const mark = () => { if (dirty) return; dirty = true; const d=$('#dirty-dot'); if (d) d.outerHTML = '<span id="dirty-dot" class="dot-dirty">unsaved</span>'; };
  ['s-title','s-author','s-desc','s-url','s-email','s-github'].forEach(id => $('#'+id).addEventListener('input', mark));
  ['f-reading','f-back','f-konami'].forEach(id => $('#'+id).addEventListener('change', mark));

  let selectedPalette = theme.palette || 'indigo';
  $('#palette-picker').querySelectorAll('[data-palette]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPalette = btn.dataset.palette;
      $('#palette-picker').querySelectorAll('[data-palette]').forEach(b => b.classList.toggle('palette-active', b === btn));
      mark();
    });
  });

  $('#save-site').onclick = async () => {
    const g = id => $('#'+id).value.trim();
    const data = {
      title: g('s-title'),
      description: g('s-desc'),
      url: g('s-url'),
      author: g('s-author'),
      github: g('s-github'),
      email: g('s-email'),
      theme: { palette: selectedPalette },
      features: {
        readingProgress: $('#f-reading').checked,
        backToTop: $('#f-back').checked,
        konami: $('#f-konami').checked,
      },
    };
    if (!data.title){ toast('Site title is required.','error'); return; }
    const r = await API.putRaw('site', data);
    if (r.error){ toast(r.error,'error'); return; }
    dirty = false;
    const d=$('#dirty-dot'); if (d) d.outerHTML = '<span id="dirty-dot" class="dot-saved">saved</span>';
    toast('Site settings saved');
  };
}

// ─── Media library ───
async function renderMedia(){
  setTopbar({ crumbs:'<strong style="color:var(--text)">Media</strong>' });
  setContent('<div class="loading">Loading…</div>');
  const items = await API.list('media');
  setContent(\`
    <div id="upload-zone" class="upload-zone">
      <p>Drop images here, or <strong>click to choose files</strong></p>
      <p style="font-size:12px;color:var(--text3);margin-top:6px">Saved to /public/uploads — referenced as <code>/uploads/&lt;file&gt;</code></p>
      <input type="file" id="upload-input" accept="image/*" multiple style="display:none" />
    </div>
    <div style="margin-top:18px">
      <h2 style="font-size:14px;font-weight:600;margin-bottom:10px">\${items.length} file\${items.length===1?'':'s'}</h2>
      <div class="media-grid" id="media-grid">
        \${items.length ? items.map(it => \`
          <div class="media-card" data-name="\${esc(it.name)}" data-url="\${esc(it.url)}">
            <img src="\${esc(it.url)}" />
            <div class="info">\${esc(it.name)} · \${fmtBytes(it.size)}</div>
            <div class="overlay">
              <button class="btn btn-secondary btn-sm" data-copy>Copy URL</button>
              <button class="btn btn-danger btn-sm" data-del>Delete</button>
            </div>
          </div>\`).join('') : '<p style="color:var(--text3);grid-column:1/-1;text-align:center;padding:24px">No images yet.</p>'}
      </div>
    </div>
  \`);
  const zone = $('#upload-zone'), input = $('#upload-input');
  const uploadFiles = async (files) => {
    for (const f of files){
      if (!/^image\\//.test(f.type)){ toast(f.name+' is not an image','error'); continue; }
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const r = await fetch('/api/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:f.name,base64:b64})}).then(r=>r.json());
      if (r.error) toast(r.error,'error'); else toast('Uploaded '+r.name);
    }
    navigate('media');
  };
  zone.onclick = () => input.click();
  input.onchange = () => { if (input.files.length) uploadFiles([...input.files]); };
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files]); };
  $('#media-grid').querySelectorAll('[data-copy]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const url = b.closest('.media-card').dataset.url;
    navigator.clipboard.writeText(url);
    toast('Copied '+url);
  });
  $('#media-grid').querySelectorAll('[data-del]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const card = b.closest('.media-card');
    confirmDelete(card.dataset.name, async () => {
      await API.del('media', card.dataset.name);
      toast('Deleted');
      navigate('media');
    });
  });
}

// ─── Renderer dispatcher ───
function render(){
  if (currentRoute === 'dashboard') return renderDashboard();
  if (currentRoute === 'items') {
    const c = currentParams.collection;
    if (!c){ navigate('collections'); return; }
    return ('edit' in currentParams) ? renderMdEdit(c, currentParams.edit || '') : renderMdList(c);
  }
  if (currentRoute === 'collections') return renderCollectionsList();
  if (currentRoute === 'pages') {
    return ('edit' in currentParams) ? renderPageEdit(currentParams.edit || '') : renderPagesList();
  }
  if (currentRoute === 'site') return renderSite();
  if (currentRoute === 'media') return renderMedia();
  setContent('<div class="empty">Unknown route.</div>');
}

// ─── Boot ───
function parseHash(){
  const h = location.hash.slice(1);
  if (!h) return ['dashboard',{}];
  const [route, raw] = h.split('/', 2);
  if (raw){
    try { return [route, JSON.parse(decodeURIComponent(raw))]; } catch { return [route,{}]; }
  }
  return [route,{}];
}

const KNOWN_ROUTES = new Set(['dashboard','items','collections','pages','site','media']);

async function boot(){
  await refreshMenu();
  const [r, p] = parseHash();
  navigate(KNOWN_ROUTES.has(r) ? r : 'dashboard', p);
}
window.addEventListener('hashchange', () => { const [r,p] = parseHash(); if (r !== currentRoute || JSON.stringify(p) !== JSON.stringify(currentParams)) navigate(r,p); });
window.addEventListener('beforeunload', e => { if (pageDirty) { e.preventDefault(); return ''; } });

boot();
</script>
</body>
</html>`;
