/**
 * Local admin server — npm run admin
 * Runs on http://localhost:4000
 * Reads/writes directly to content/ directory. No auth, no API calls.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CONTENT = { blog: join(ROOT, 'content', 'blog'), projects: join(ROOT, 'content', 'projects') };
const PORT    = 4000;

// ── Frontmatter ───────────────────────────────────────────────
function parseFM(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true')  { data[k] = true;  continue; }
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

// ── Content API ───────────────────────────────────────────────
function listItems(type) {
  const dir = CONTENT[type];
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /\.mdx?$/.test(f))
    .map(f => {
      const slug = f.replace(/\.mdx?$/, '');
      const { data } = parseFM(readFileSync(join(dir, f), 'utf8'));
      return { slug, ...data };
    })
    .sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
}

function getItem(type, slug) {
  const dir = CONTENT[type];
  const filePath = join(dir, `${slug}.md`);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  const { data, body } = parseFM(raw);
  return { slug, data, body };
}

function saveItem(type, slug, data, body) {
  const dir = CONTENT[type];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.md`), buildFM(data, body), 'utf8');
}

function deleteItem(type, slug) {
  const filePath = join(CONTENT[type], `${slug}.md`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ── HTTP server ───────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // API routes
  const apiMatch = path.match(/^\/api\/(blog|projects)(?:\/([^/]+))?$/);
  if (apiMatch) {
    const [, type, slug] = apiMatch;
    try {
      if (method === 'GET' && !slug)  { json(res, listItems(type)); return; }
      if (method === 'GET' && slug)   { const item = getItem(type, slug); item ? json(res, item) : json(res, { error: 'Not found' }, 404); return; }
      if (method === 'POST' || method === 'PUT') {
        const { slug: bodySlug, data, body } = await readBody(req);
        const finalSlug = slug || bodySlug;
        if (!finalSlug) { json(res, { error: 'slug required' }, 400); return; }
        saveItem(type, finalSlug, data, body);
        json(res, { ok: true, slug: finalSlug }); return;
      }
      if (method === 'DELETE' && slug) { deleteItem(type, slug); json(res, { ok: true }); return; }
    } catch (e) {
      json(res, { error: e.message }, 500); return;
    }
  }

  // Serve UI
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(UI_HTML); return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Admin running at http://localhost:${PORT}\n`);
});

// ── UI ────────────────────────────────────────────────────────
const UI_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin — iruki.dev</title>
  <style>
    :root{--bg:#fff;--bg2:#f4f4f5;--bg3:#e4e4e7;--border:#e4e4e7;--text:#09090b;--text2:#71717a;--accent:#6366f1;--accent2:#4f46e5;--danger:#ef4444;--r:6px}
    @media(prefers-color-scheme:dark){:root{--bg:#09090b;--bg2:#18181b;--bg3:#27272a;--border:#27272a;--text:#fafafa;--text2:#a1a1aa}}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.5;min-height:100vh;display:flex;flex-direction:column}
    nav{border-bottom:1px solid var(--border);padding:0 24px;height:48px;display:flex;align-items:center;justify-content:space-between;background:var(--bg);position:sticky;top:0;z-index:10}
    nav .brand{font-weight:600}
    nav .links{display:flex;gap:4px}
    main{padding:32px 24px;flex:1;max-width:800px;width:100%;margin:0 auto}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r);font-size:13px;font-weight:500;cursor:pointer;border:none;transition:background .15s}
    .btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent2)}.btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .btn-ghost{background:transparent;color:var(--text2)}.btn-ghost:hover{background:var(--bg2);color:var(--text)}.btn-ghost.active{color:var(--accent)}
    .btn-danger{background:transparent;color:var(--danger);border:1px solid transparent}.btn-danger:hover{background:#fee2e2;border-color:var(--danger)}
    @media(prefers-color-scheme:dark){.btn-danger:hover{background:#450a0a}}
    .btn-sm{padding:4px 10px;font-size:12px}
    label{display:block;font-size:12px;font-weight:500;color:var(--text2);margin-bottom:4px}
    input,textarea{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}
    input:focus,textarea:focus{border-color:var(--accent)}
    textarea{resize:vertical;min-height:120px}
    .field{margin-bottom:16px}
    .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)}
    .toggle-row label{margin:0;font-size:13px;color:var(--text)}
    input[type=checkbox]{width:auto;accent-color:var(--accent)}
    .editor{font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;min-height:360px}
    .list-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
    .list-header h1{font-size:20px;font-weight:600}
    .list-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);gap:12px}
    .list-item:last-child{border-bottom:none}
    .item-info{flex:1;min-width:0}
    .item-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .item-meta{font-size:12px;color:var(--text2);margin-top:2px}
    .item-actions{display:flex;gap:6px;flex-shrink:0}
    .badge{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;background:var(--bg3);color:var(--text2)}
    .draft{background:#fef9c3;color:#854d0e}
    @media(prefers-color-scheme:dark){.draft{background:#422006;color:#fde68a}}
    .alert{padding:10px 14px;border-radius:var(--r);font-size:13px;margin-bottom:16px}
    .error{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    .success{background:#dcfce7;color:#166534;border:1px solid #86efac}
    @media(prefers-color-scheme:dark){.error{background:#450a0a;color:#fca5a5;border-color:#7f1d1d}.success{background:#052e16;color:#86efac;border-color:#14532d}}
    .loading{text-align:center;padding:48px;color:var(--text2)}
    hr{border:none;border-top:1px solid var(--border);margin:20px 0}
  </style>
</head>
<body>
<nav>
  <span class="brand">iruki.dev admin</span>
  <div class="links">
    <button class="btn btn-ghost btn-sm" id="nav-blog" onclick="App.showBlog()">Blog</button>
    <button class="btn btn-ghost btn-sm" id="nav-projects" onclick="App.showProjects()">Projects</button>
  </div>
</nav>
<main id="main"><div class="loading">Loading…</div></main>

<script>
const API = {
  list:   t       => fetch(\`/api/\${t}\`).then(r=>r.json()),
  get:    (t,s)   => fetch(\`/api/\${t}/\${s}\`).then(r=>r.json()),
  save:   (t,s,d,b) => fetch(\`/api/\${t}/\${s||''}\`,{method:s?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:s,data:d,body:b})}).then(r=>r.json()),
  delete: (t,s)   => fetch(\`/api/\${t}/\${s}\`,{method:'DELETE'}).then(r=>r.json()),
};

function setMain(h){ document.getElementById('main').innerHTML = h; }
function setNav(a){ ['blog','projects'].forEach(n=>document.getElementById('nav-'+n)?.classList.toggle('active',n===a)); }
function setAlert(id,msg,type='error'){ const el=document.getElementById(id); if(el) el.innerHTML=msg?\`<div class="alert \${type}">\${msg}</div>\`:''; }
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function today(){ return new Date().toISOString().split('T')[0]; }
function slugify(s){ return s.toLowerCase().replace(/[^\\w\\s-]/g,'').trim().replace(/\\s+/g,'-').replace(/-+/g,'-').slice(0,60); }

const App = {
  async showBlog(){
    setNav('blog'); setMain('<div class="loading">Loading…</div>');
    const items = await API.list('blog').catch(e=>{setMain(\`<div class="alert error">\${e.message}</div>\`);return null;});
    if(!items) return;
    setMain(renderList('blog',items));
  },
  async showBlogEdit(slug=null){
    setNav('blog');
    let data={},body='';
    if(slug){
      setMain('<div class="loading">Loading…</div>');
      const r = await API.get('blog',slug);
      if(r.error){setMain(\`<div class="alert error">\${r.error}</div>\`);return;}
      ({data,body}=r);
    }
    setMain(renderBlogForm(slug,data,body));
  },
  async saveBlog(slug){
    const g=id=>document.getElementById(id)?.value?.trim()??'';
    const title=g('f-title');
    if(!title){setAlert('form-alert','Title is required.');return;}
    const tags=g('f-tags').split(',').map(s=>s.trim()).filter(Boolean);
    const updated=g('f-updated')||undefined;
    const data={title,description:g('f-desc'),pubDate:g('f-date')||today(),...(updated?{updatedDate:updated}:{}),tags,draft:document.getElementById('f-draft')?.checked??false};
    const body=document.getElementById('f-body')?.value??'';
    const finalSlug=slug||slugify(title)||'post-'+Date.now();
    document.getElementById('save-btn').disabled=true;
    setAlert('form-alert','');
    const r=await API.save('blog',finalSlug,data,body);
    if(r.error) setAlert('form-alert',r.error);
    else setAlert('form-alert','Saved. Run git push to deploy.','success');
    document.getElementById('save-btn').disabled=false;
  },
  async deleteBlog(slug){
    if(!confirm(\`Delete "\${slug}"?\`))return;
    await API.delete('blog',slug);
    App.showBlog();
  },
  async showProjects(){
    setNav('projects'); setMain('<div class="loading">Loading…</div>');
    const items = await API.list('projects').catch(e=>{setMain(\`<div class="alert error">\${e.message}</div>\`);return null;});
    if(!items) return;
    setMain(renderList('projects',items));
  },
  async showProjectEdit(slug=null){
    setNav('projects');
    let data={},body='';
    if(slug){
      setMain('<div class="loading">Loading…</div>');
      const r=await API.get('projects',slug);
      if(r.error){setMain(\`<div class="alert error">\${r.error}</div>\`);return;}
      ({data,body}=r);
    }
    setMain(renderProjectForm(slug,data,body));
  },
  async saveProject(slug){
    const g=id=>document.getElementById(id)?.value?.trim()??'';
    const title=g('f-title');
    if(!title){setAlert('form-alert','Title is required.');return;}
    const tags=g('f-tags').split(',').map(s=>s.trim()).filter(Boolean);
    const github=g('f-github')||undefined,demo=g('f-demo')||undefined;
    const data={title,description:g('f-desc'),pubDate:g('f-date')||today(),tags,...(github?{github}:{}),...(demo?{demo}:{}),featured:document.getElementById('f-featured')?.checked??false,draft:document.getElementById('f-draft')?.checked??false};
    const body=document.getElementById('f-body')?.value??'';
    const finalSlug=slug||slugify(title)||'project-'+Date.now();
    document.getElementById('save-btn').disabled=true;
    setAlert('form-alert','');
    const r=await API.save('projects',finalSlug,data,body);
    if(r.error) setAlert('form-alert',r.error);
    else setAlert('form-alert','Saved. Run git push to deploy.','success');
    document.getElementById('save-btn').disabled=false;
  },
  async deleteProject(slug){
    if(!confirm(\`Delete "\${slug}"?\`))return;
    await API.delete('projects',slug);
    App.showProjects();
  },
};

function renderList(type,items){
  const isBlog=type==='blog';
  const newFn=isBlog?'App.showBlogEdit()':'App.showProjectEdit()';
  const rows=items.map(item=>{
    const s=esc(item.slug);
    const editFn=isBlog?\`App.showBlogEdit('\${s}')\`:\`App.showProjectEdit('\${s}')\`;
    const delFn=isBlog?\`App.deleteBlog('\${s}')\`:\`App.deleteProject('\${s}')\`;
    return \`<div class="list-item">
      <div class="item-info">
        <div class="item-title">\${esc(item.title||item.slug)}</div>
        <div class="item-meta">\${esc(item.pubDate||'—')}
          \${item.draft?'<span class="badge draft" style="margin-left:6px">draft</span>':''}
          \${(!isBlog&&item.featured)?'<span class="badge" style="margin-left:6px">featured</span>':''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="\${editFn}">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="\${delFn}">Delete</button>
      </div>
    </div>\`;
  }).join('');
  return \`<div class="list-header"><h1>\${isBlog?'Blog':'Projects'}</h1>
    <button class="btn btn-primary btn-sm" onclick="\${newFn}">+ New</button></div>
    \${items.length?rows:'<p style="color:var(--text2)">No items yet.</p>'}\`;
}

function renderBlogForm(slug,d,body){
  const tags=Array.isArray(d.tags)?d.tags.join(', '):(d.tags||'');
  return \`<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <button class="btn btn-ghost btn-sm" onclick="App.showBlog()">← Back</button>
    <h1 style="font-size:18px;font-weight:600">\${slug?'Edit post':'New post'}</h1>
  </div>
  <div id="form-alert"></div>
  <div class="field"><label>Title</label><input id="f-title" value="\${esc(d.title||'')}" placeholder="Post title" /></div>
  <div class="field"><label>Description</label><input id="f-desc" value="\${esc(d.description||'')}" placeholder="Short description" /></div>
  <div class="field-row">
    <div class="field"><label>Publish date</label><input id="f-date" type="date" value="\${esc(d.pubDate||today())}" /></div>
    <div class="field"><label>Updated date</label><input id="f-updated" type="date" value="\${esc(d.updatedDate||'')}" /></div>
  </div>
  <div class="field"><label>Tags (comma-separated)</label><input id="f-tags" value="\${esc(tags)}" placeholder="tag1, tag2" /></div>
  <div class="field"><label>Content (Markdown)</label><textarea id="f-body" class="editor">\${esc(body)}</textarea></div>
  <div class="toggle-row"><label for="f-draft">Draft</label><input type="checkbox" id="f-draft" \${d.draft?'checked':''} /></div>
  <div id="form-alert" style="margin-top:12px"></div>
  <div style="margin-top:16px"><button id="save-btn" class="btn btn-primary" onclick="App.saveBlog('\${esc(slug||'')}')">
    \${slug?'Update':'Publish'}</button></div>\`;
}

function renderProjectForm(slug,d,body){
  const tags=Array.isArray(d.tags)?d.tags.join(', '):(d.tags||'');
  return \`<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
    <button class="btn btn-ghost btn-sm" onclick="App.showProjects()">← Back</button>
    <h1 style="font-size:18px;font-weight:600">\${slug?'Edit project':'New project'}</h1>
  </div>
  <div id="form-alert"></div>
  <div class="field"><label>Title</label><input id="f-title" value="\${esc(d.title||'')}" placeholder="Project title" /></div>
  <div class="field"><label>Description</label><input id="f-desc" value="\${esc(d.description||'')}" placeholder="Short description" /></div>
  <div class="field"><label>Date</label><input id="f-date" type="date" value="\${esc(d.pubDate||today())}" /></div>
  <div class="field"><label>Tags (comma-separated)</label><input id="f-tags" value="\${esc(tags)}" placeholder="TypeScript, React" /></div>
  <div class="field-row">
    <div class="field"><label>GitHub URL</label><input id="f-github" value="\${esc(d.github||'')}" placeholder="https://github.com/…" /></div>
    <div class="field"><label>Demo URL</label><input id="f-demo" value="\${esc(d.demo||'')}" placeholder="https://…" /></div>
  </div>
  <div class="field"><label>Content (Markdown)</label><textarea id="f-body" class="editor">\${esc(body)}</textarea></div>
  <div class="toggle-row"><label for="f-featured">Featured on home page</label><input type="checkbox" id="f-featured" \${d.featured?'checked':''} /></div>
  <div class="toggle-row"><label for="f-draft">Draft</label><input type="checkbox" id="f-draft" \${d.draft?'checked':''} /></div>
  <div id="form-alert" style="margin-top:12px"></div>
  <div style="margin-top:16px"><button id="save-btn" class="btn btn-primary" onclick="App.saveProject('\${esc(slug||'')}')">
    \${slug?'Update':'Save'}</button></div>\`;
}

App.showBlog();
<\/script>
</body>
</html>`;
