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
  input[type="text"], button {
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #d4d4d4);
    border: 1px solid var(--vscode-input-border, #555);
    padding: 3px 8px; border-radius: 3px; font: inherit;
  }
  input[type="text"] { width: 240px; }
  button { cursor: pointer; }
  button:hover { filter: brightness(1.15); }
  .right { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; }
  #content { flex: 1 1 auto; overflow: auto; padding: 12px; }
  .cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px; margin-bottom: 14px;
  }
  .card {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    border-radius: 5px; padding: 10px 12px;
  }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .card-title { font-weight: 600; font-size: 13px; word-break: break-word; }
  .card-sub { color: var(--vscode-descriptionForeground, #999); font-size: 11px; }
  h3 { margin: 14px 0 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td {
    text-align: left; padding: 5px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    vertical-align: top;
  }
  th {
    background: var(--vscode-editorWidget-background, #252526);
    color: var(--vscode-descriptionForeground, #aaa);
    font-weight: 600; font-size: 11px;
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .addr { color: var(--vscode-textLink-foreground, #569cd6); white-space: nowrap; }
  .sec-name { color: var(--vscode-symbolIcon-structForeground, #c586c0); font-weight: 600; }
  .pill {
    display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px;
    background: rgba(86, 156, 214, 0.16); color: var(--vscode-textLink-foreground, #9cdcfe);
  }
  .chip {
    display: inline-block; margin: 1px 4px 1px 0; padding: 1px 5px;
    border-radius: 3px; font-size: 10px;
    background: rgba(181, 206, 168, 0.14); color: var(--vscode-debugTokenExpression-number, #b5cea8);
  }
  .muted { color: var(--vscode-descriptionForeground, #888); }
</style>
</head>
<body>
<div id="toolbar">
  <span id="title" class="mono"></span>
  <input id="search" type="text" placeholder="Filter regions, sections, symbols...">
  <span class="right">
    <button id="openRawBtn" type="button">Edit Linker Script</button>
  </span>
</div>
<div id="content"></div>

<script>
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
let DATA = ${payload};
const titleEl = document.getElementById('title');
const searchEl = document.getElementById('search');
const contentEl = document.getElementById('content');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hex(n) {
  return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
function fmtShort(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MiB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
  return n + ' B';
}

function render() {
  titleEl.textContent = DATA.fileName + (DATA.entry ? '  (ENTRY: ' + DATA.entry + ')' : '');
  const q = searchEl.value.trim().toLowerCase();
  let html = '';

  const regions = DATA.regions.filter(r => !q || r.name.toLowerCase().includes(q));
  if (regions.length) {
    html += '<h3>Memory Regions (' + regions.length + ')</h3><div class="cards">';
    for (const r of regions) {
      const org = r.origin !== undefined ? hex(r.origin) : esc(r.originRaw);
      const len = r.length !== undefined ? fmtShort(r.length) + ' (' + hex(r.length) + ')' : esc(r.lengthRaw);
      html += '<div class="card">' +
        '<div class="card-head"><span class="card-title mono">' + esc(r.name) + '</span>' +
        '<span class="pill mono">' + esc(r.attributes || '-') + '</span></div>' +
        '<div class="card-sub mono" style="margin-top:6px;">Origin: <span class="addr">' + org + '</span></div>' +
        '<div class="card-sub mono">Length: ' + len + '</div>' +
      '</div>';
    }
    html += '</div>';
  }

  const secs = DATA.sections.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.vmaRegion.toLowerCase().includes(q) ||
    s.lmaRegion.toLowerCase().includes(q) || s.inputs.some(x => x.toLowerCase().includes(q)) ||
    s.symbols.some(x => x.toLowerCase().includes(q))
  );
  if (secs.length) {
    html += '<h3>Output Sections (' + secs.length + ')</h3>';
    html += '<table><thead><tr><th>Section</th><th>Flags</th><th>VMA Region</th><th>LMA (AT&gt;)</th><th>Input Patterns</th><th>Defined Symbols</th></tr></thead><tbody>';
    for (const s of secs) {
      const inps = s.inputs.map(x => '<div class="mono muted">' + esc(x) + '</div>').join('') || '<span class="muted">-</span>';
      const syms = s.symbols.map(x => '<span class="chip mono">' + esc(x) + '</span>').join('') || '<span class="muted">-</span>';
      html += '<tr>' +
        '<td class="mono sec-name">' + esc(s.name) + '</td>' +
        '<td class="mono muted">' + esc(s.flags || '-') + '</td>' +
        '<td>' + (s.vmaRegion ? '<span class="pill mono">' + esc(s.vmaRegion) + '</span>' : '<span class="muted">-</span>') + '</td>' +
        '<td>' + (s.lmaRegion ? '<span class="pill mono">' + esc(s.lmaRegion) + '</span>' : '<span class="muted">-</span>') + '</td>' +
        '<td>' + inps + '</td>' +
        '<td>' + syms + '</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
  }

  const syms = DATA.symbols.filter(s => !q || s.name.toLowerCase().includes(q) || s.expr.toLowerCase().includes(q));
  if (syms.length) {
    html += '<h3>Top-Level Symbols (' + syms.length + ')</h3>';
    html += '<table><thead><tr><th>Symbol</th><th>Kind</th><th>Expression</th></tr></thead><tbody>';
    for (const s of syms) {
      html += '<tr><td class="mono"><strong>' + esc(s.name) + '</strong></td>' +
        '<td class="muted">' + (s.provide ? 'PROVIDE' : 'ASSIGN') + '</td>' +
        '<td class="mono">' + esc(s.expr) + '</td></tr>';
    }
    html += '</tbody></table>';
  }

  if (DATA.asserts.length) {
    html += '<h3>Assertions (' + DATA.asserts.length + ')</h3>';
    html += '<table><thead><tr><th>Condition</th><th>Message</th></tr></thead><tbody>';
    for (const a of DATA.asserts) {
      html += '<tr><td class="mono">' + esc(a.condition) + '</td><td>' + esc(a.message) + '</td></tr>';
    }
    html += '</tbody></table>';
  }

  contentEl.innerHTML = html || '<div class="muted">No matching items.</div>';
}

searchEl.addEventListener('input', render);
document.getElementById('openRawBtn').addEventListener('click', () => {
  if (vscode) vscode.postMessage({ type: 'openRaw' });
});
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'update' && e.data.payload) {
    DATA = e.data.payload;
    render();
  }
});
render();
</script>
</body>
</html>`;
}
