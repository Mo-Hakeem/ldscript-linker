import { ParsedLd } from './parser';

export function getLdWebviewContent(parsed: ParsedLd, fileName: string): string {
  const payload = JSON.stringify({ fileName, ...parsed }).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    font-size: 12px;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #d4d4d4);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .mono { font-family: var(--vscode-editor-font-family, 'Cascadia Code', Consolas, monospace); }
  #toolbar {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding: 8px 12px;
    background: var(--vscode-editorWidget-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    flex: 0 0 auto;
  }
  #title { font-weight: 600; font-size: 13px; margin-right: 4px; }
  input[type="text"], select, textarea, button {
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #d4d4d4);
    border: 1px solid var(--vscode-input-border, #555);
    padding: 3px 6px; border-radius: 3px; font: inherit;
  }
  input[type="text"]:focus, select:focus, textarea:focus {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
  }
  #search { width: 220px; }
  button { cursor: pointer; }
  button:hover { filter: brightness(1.15); }
  button.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  button.danger { color: #f48771; border-color: rgba(244, 135, 113, 0.4); }
  .right { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; }
  #content { flex: 1 1 auto; overflow: auto; padding: 12px; }
  .cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 10px; margin-bottom: 14px;
  }
  .card {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 5px; padding: 10px 12px;
  }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .kv { display: grid; grid-template-columns: 70px 1fr; gap: 6px; align-items: center; margin-bottom: 4px; }
  .kv input { width: 100%; }
  .section-bar { display: flex; justify-content: space-between; align-items: center; margin: 14px 0 6px; }
  h3 { margin: 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td {
    text-align: left; padding: 5px 6px;
    border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    vertical-align: top;
  }
  th {
    background: var(--vscode-editorWidget-background, #252526);
    color: var(--vscode-descriptionForeground, #aaa);
    font-weight: 600; font-size: 11px;
  }
  td input, td select, td textarea { width: 100%; min-width: 60px; }
  td textarea { min-height: 44px; resize: vertical; }
  .sec-name { color: var(--vscode-symbolIcon-structForeground, #c586c0); font-weight: 600; }
  .muted { color: var(--vscode-descriptionForeground, #888); }
</style>
</head>
<body>
<div id="toolbar">
  <span id="title" class="mono"></span>
  <span id="entryWrap"></span>
  <input id="search" type="text" placeholder="Filter regions, sections, symbols...">
  <span class="right">
    <span class="muted" id="syncStatus"></span>
    <button id="toggleEditBtn" type="button">Enable Editing</button>
    <button id="openRawBtn" type="button">Edit Raw Text</button>
  </span>
</div>
<div id="content"></div>

<script>
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
let DATA = ${payload};
let editMode = false;
const titleEl = document.getElementById('title');
const entryWrap = document.getElementById('entryWrap');
const searchEl = document.getElementById('search');
const contentEl = document.getElementById('content');
const syncStatusEl = document.getElementById('syncStatus');
const toggleEditBtn = document.getElementById('toggleEditBtn');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function syncToDoc() {
  if (!vscode) return;
  syncStatusEl.textContent = 'Modified (Ctrl+S to save)';
  vscode.postMessage({ type: 'applyData', data: DATA });
}

function render() {
  titleEl.textContent = DATA.fileName;
  if (!editMode) {
    entryWrap.innerHTML = DATA.entry ? '<span class="muted mono">(ENTRY: ' + esc(DATA.entry) + ')</span>' : '';
  } else {
    entryWrap.innerHTML = '<label class="muted">ENTRY <input id="entryInput" class="mono" style="width:150px;" type="text" value="' + esc(DATA.entry || '') + '" placeholder="Reset_Handler"></label>';
    document.getElementById('entryInput').addEventListener('change', (ev) => {
      DATA.entry = ev.target.value.trim() || undefined;
      syncToDoc();
    });
  }
  const q = searchEl.value.trim().toLowerCase();
  let html = '';

  const regions = DATA.regions.map((r, idx) => ({ r, idx })).filter(({ r }) => !q || r.name.toLowerCase().includes(q));
  html += '<div class="section-bar"><h3>Memory Regions (' + regions.length + ')</h3>' +
    (editMode ? '<button class="primary" id="addRegBtn" type="button">+ Add Region</button>' : '') + '</div><div class="cards">';
  for (const { r, idx } of regions) {
    if (!editMode) {
      html += '<div class="card">' +
        '<div class="card-head"><span class="sec-name mono" style="font-size:13px;">' + esc(r.name) + '</span>' +
        '<span class="muted mono">' + esc(r.attributes || '-') + '</span></div>' +
        '<div class="muted mono">Origin: <span style="color:var(--vscode-textLink-foreground,#569cd6);">' + esc(r.originRaw) + '</span></div>' +
        '<div class="muted mono">Length: ' + esc(r.lengthRaw) + '</div>' +
      '</div>';
    } else {
      html += '<div class="card">' +
        '<div class="card-head">' +
          '<input class="mono sec-name" style="width:140px;" data-reg="' + idx + '" data-k="name" type="text" value="' + esc(r.name) + '">' +
          '<input class="mono" style="width:64px;" data-reg="' + idx + '" data-k="attributes" type="text" value="' + esc(r.attributes) + '" placeholder="rx">' +
          '<button class="danger" data-delreg="' + idx + '" type="button">&times;</button>' +
        '</div>' +
        '<div class="kv"><span class="muted">Origin</span><input class="mono" data-reg="' + idx + '" data-k="originRaw" type="text" value="' + esc(r.originRaw) + '"></div>' +
        '<div class="kv"><span class="muted">Length</span><input class="mono" data-reg="' + idx + '" data-k="lengthRaw" type="text" value="' + esc(r.lengthRaw) + '"></div>' +
      '</div>';
    }
  }
  html += '</div>';

  const secs = DATA.sections.map((s, idx) => ({ s, idx })).filter(({ s }) =>
    !q || s.name.toLowerCase().includes(q) || s.vmaRegion.toLowerCase().includes(q) ||
    s.lmaRegion.toLowerCase().includes(q) || s.inputs.some(x => x.toLowerCase().includes(q)) ||
    s.symbols.some(x => x.toLowerCase().includes(q))
  );
  html += '<div class="section-bar"><h3>Output Sections (' + secs.length + ')</h3>' +
    (editMode ? '<button class="primary" id="addSecBtn" type="button">+ Add Section</button>' : '') + '</div>';
  html += '<table><thead><tr><th style="width:150px;">Section</th><th style="width:85px;">Flags</th><th style="width:100px;">VMA (&gt;)</th><th style="width:100px;">LMA (AT&gt;)</th><th>Input Patterns</th><th style="width:180px;">Symbols</th>' + (editMode ? '<th style="width:36px;"></th>' : '') + '</tr></thead><tbody>';
  for (const { s, idx } of secs) {
    if (!editMode) {
      const inps = s.inputs.map(x => '<div class="mono muted">' + esc(x) + '</div>').join('') || '<span class="muted">-</span>';
      const syms = s.symbols.map(x => '<span class="mono" style="display:inline-block;margin:1px 4px 1px 0;padding:1px 5px;border-radius:3px;font-size:10px;background:rgba(181,206,168,0.14);color:#b5cea8;">' + esc(x) + '</span>').join('') || '<span class="muted">-</span>';
      html += '<tr>' +
        '<td class="mono sec-name">' + esc(s.name) + '</td>' +
        '<td class="mono muted">' + esc(s.flags || '-') + '</td>' +
        '<td class="mono">' + esc(s.vmaRegion || '-') + '</td>' +
        '<td class="mono muted">' + esc(s.lmaRegion || '-') + '</td>' +
        '<td>' + inps + '</td>' +
        '<td>' + syms + '</td>' +
      '</tr>';
    } else {
      html += '<tr>' +
        '<td><input class="mono sec-name" data-sec="' + idx + '" data-k="name" type="text" value="' + esc(s.name) + '"></td>' +
        '<td><input class="mono" data-sec="' + idx + '" data-k="flags" type="text" value="' + esc(s.flags) + '" placeholder="NOLOAD"></td>' +
        '<td><input class="mono" data-sec="' + idx + '" data-k="vmaRegion" type="text" value="' + esc(s.vmaRegion) + '"></td>' +
        '<td><input class="mono" data-sec="' + idx + '" data-k="lmaRegion" type="text" value="' + esc(s.lmaRegion) + '"></td>' +
        '<td><textarea class="mono" data-sec="' + idx + '" data-k="inputs">' + esc(s.inputs.join('\\n')) + '</textarea></td>' +
        '<td><input class="mono" data-sec="' + idx + '" data-k="symbols" type="text" value="' + esc(s.symbols.join(', ')) + '"></td>' +
        '<td><button class="danger" data-delsec="' + idx + '" type="button">&times;</button></td>' +
      '</tr>';
    }
  }
  html += '</tbody></table>';

  const syms = DATA.symbols.map((s, idx) => ({ s, idx })).filter(({ s }) => !q || s.name.toLowerCase().includes(q) || s.expr.toLowerCase().includes(q));
  html += '<div class="section-bar"><h3>Top-Level Symbols (' + syms.length + ')</h3>' +
    (editMode ? '<button class="primary" id="addSymBtn" type="button">+ Add Symbol</button>' : '') + '</div>';
  html += '<table><thead><tr><th style="width:200px;">Symbol</th><th style="width:110px;">Kind</th><th>Expression</th>' + (editMode ? '<th style="width:36px;"></th>' : '') + '</tr></thead><tbody>';
  for (const { s, idx } of syms) {
    if (!editMode) {
      html += '<tr><td class="mono"><strong>' + esc(s.name) + '</strong></td><td class="muted">' + (s.provide ? 'PROVIDE' : 'ASSIGN') + '</td><td class="mono">' + esc(s.expr) + '</td></tr>';
    } else {
      html += '<tr>' +
        '<td><input class="mono" data-sym="' + idx + '" data-k="name" type="text" value="' + esc(s.name) + '"></td>' +
        '<td><select class="mono" data-sym="' + idx + '" data-k="provide"><option value="false"' + (!s.provide ? ' selected' : '') + '>ASSIGN</option><option value="true"' + (s.provide ? ' selected' : '') + '>PROVIDE</option></select></td>' +
        '<td><input class="mono" data-sym="' + idx + '" data-k="expr" type="text" value="' + esc(s.expr) + '"></td>' +
        '<td><button class="danger" data-delsym="' + idx + '" type="button">&times;</button></td>' +
      '</tr>';
    }
  }
  html += '</tbody></table>';

  const asserts = DATA.asserts.map((a, idx) => ({ a, idx }));
  if (asserts.length || editMode) {
    html += '<div class="section-bar"><h3>Assertions (' + asserts.length + ')</h3>' +
      (editMode ? '<button class="primary" id="addAssertBtn" type="button">+ Add Assert</button>' : '') + '</div>';
    if (asserts.length) {
      html += '<table><thead><tr><th>Condition</th><th>Message</th>' + (editMode ? '<th style="width:36px;"></th>' : '') + '</tr></thead><tbody>';
      for (const { a, idx } of asserts) {
        if (!editMode) {
          html += '<tr><td class="mono">' + esc(a.condition) + '</td><td>' + esc(a.message) + '</td></tr>';
        } else {
          html += '<tr>' +
            '<td><input class="mono" data-asrt="' + idx + '" data-k="condition" type="text" value="' + esc(a.condition) + '"></td>' +
            '<td><input data-asrt="' + idx + '" data-k="message" type="text" value="' + esc(a.message) + '"></td>' +
            '<td><button class="danger" data-delasrt="' + idx + '" type="button">&times;</button></td>' +
          '</tr>';
        }
      }
      html += '</tbody></table>';
    }
  }

  contentEl.innerHTML = html;
}

toggleEditBtn.addEventListener('click', () => {
  editMode = !editMode;
  toggleEditBtn.textContent = editMode ? 'Lock (Read-Only)' : 'Enable Editing';
  toggleEditBtn.classList.toggle('primary', editMode);
  render();
});

contentEl.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.reg !== undefined) {
    const r = DATA.regions[parseInt(t.dataset.reg, 10)];
    if (r) { r[t.dataset.k] = t.value.trim(); syncToDoc(); }
  } else if (t.dataset.sec !== undefined) {
    const s = DATA.sections[parseInt(t.dataset.sec, 10)];
    if (s) {
      const k = t.dataset.k;
      if (k === 'inputs') s.inputs = t.value.split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
      else if (k === 'symbols') s.symbols = t.value.split(',').map(x => x.trim()).filter(Boolean);
      else s[k] = t.value.trim();
      syncToDoc();
    }
  } else if (t.dataset.sym !== undefined) {
    const s = DATA.symbols[parseInt(t.dataset.sym, 10)];
    if (s) {
      const k = t.dataset.k;
      if (k === 'provide') s.provide = t.value === 'true';
      else s[k] = t.value.trim();
      syncToDoc();
    }
  } else if (t.dataset.asrt !== undefined) {
    const a = DATA.asserts[parseInt(t.dataset.asrt, 10)];
    if (a) { a[t.dataset.k] = t.value; syncToDoc(); }
  }
});

contentEl.addEventListener('click', (e) => {
  const t = e.target;
  if (t.id === 'addRegBtn') {
    DATA.regions.push({ name: 'REGION_' + (DATA.regions.length + 1), attributes: 'rx', originRaw: '0x00000000', lengthRaw: '64K' });
    syncToDoc(); render();
  } else if (t.dataset.delreg !== undefined) {
    DATA.regions.splice(parseInt(t.dataset.delreg, 10), 1);
    syncToDoc(); render();
  } else if (t.id === 'addSecBtn') {
    DATA.sections.push({ name: '.custom', flags: '', vmaRegion: DATA.regions[0]?.name || 'FLASH', lmaRegion: '', inputs: ['*(.custom*)'], symbols: [] });
    syncToDoc(); render();
  } else if (t.dataset.delsec !== undefined) {
    DATA.sections.splice(parseInt(t.dataset.delsec, 10), 1);
    syncToDoc(); render();
  } else if (t.id === 'addSymBtn') {
    DATA.symbols.push({ name: '_new_sym', expr: '0x0', provide: false });
    syncToDoc(); render();
  } else if (t.dataset.delsym !== undefined) {
    DATA.symbols.splice(parseInt(t.dataset.delsym, 10), 1);
    syncToDoc(); render();
  } else if (t.id === 'addAssertBtn') {
    DATA.asserts.push({ condition: '1', message: 'Check failed' });
    syncToDoc(); render();
  } else if (t.dataset.delasrt !== undefined) {
    DATA.asserts.splice(parseInt(t.dataset.delasrt, 10), 1);
    syncToDoc(); render();
  }
});

searchEl.addEventListener('input', render);
document.getElementById('openRawBtn').addEventListener('click', () => {
  if (vscode) vscode.postMessage({ type: 'openRaw' });
});
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'update' && e.data.payload) {
    DATA = e.data.payload;
    syncStatusEl.textContent = '';
    render();
  }
});
render();
</script>
</body>
</html>`;
}
