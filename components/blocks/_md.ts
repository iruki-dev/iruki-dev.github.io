export function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Tiny inline markdown: **bold**, *italic*, `code`, [text](url), <br>
export function renderInline(txt: string): string {
  if (!txt) return '';
  let out = escHtml(txt);
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-sm">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent-500 dark:text-accent-400 hover:underline">$1</a>');
  out = out.replace(/\n/g, '<br />');
  return out;
}

// Block-level: paragraphs split on blank lines, each rendered inline.
export function renderBlockMd(txt: string): string {
  if (!txt) return '';
  return txt
    .split(/\n{2,}/)
    .map((p) => `<p>${renderInline(p.trim())}</p>`)
    .join('');
}

// Resolve common embed providers to embeddable URLs.
export function resolveEmbedUrl(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.replace(/^\//, '');
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === 'codepen.io') {
      // /user/pen/ID  →  /user/embed/ID?default-tab=result
      const m = u.pathname.match(/^\/([^/]+)\/pen\/([^/]+)/);
      if (m) return `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`;
    }
  } catch (_) {
    // not a URL — fall through
  }
  return raw;
}
