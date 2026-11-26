import * as path from 'path';
import * as vscode from 'vscode';
import { parseLinkerScript } from './parser';
import { getLdWebviewContent } from './webview';

const KEYWORD_DOCS: Record<string, string> = {
  MEMORY: 'Declares named memory regions with attributes (`r`, `w`, `x`), `ORIGIN`, and `LENGTH`.',
  SECTIONS: 'Maps input sections from object files into output sections and memory regions.',
  ENTRY: 'Sets the entry point symbol (start address) in the ELF header.',
  ORIGIN: 'Start address of a `MEMORY` region (also `org` or `o`).',
  LENGTH: 'Size in bytes of a `MEMORY` region (also `len` or `l`).',
  KEEP: 'Prevents `--gc-sections` from discarding the wrapped input sections (essential for vector tables).',
  ALIGN: 'Advances the location counter `.` (or aligns a section) to the next multiple of `align` bytes.',
  AT: 'Sets the Load Memory Address (LMA) of an output section (e.g. `> RAM AT> FLASH`).',
  LOADADDR: 'Returns the absolute Load Memory Address (LMA) of the named section.',
  ADDR: 'Returns the absolute Virtual Memory Address (VMA) of the named section.',
  SIZEOF: 'Returns the size in bytes of the named section.',
  NOLOAD: 'Marks a section as not loadable (e.g. `.bss`, `.noinit`) so it occupies no Flash/file space.',
  PROVIDE: 'Defines a symbol only if it is referenced and not already defined by any object file.',
  PROVIDE_HIDDEN: 'Like `PROVIDE`, but marks the symbol hidden in ELF.',
  ASSERT: 'Evaluates an expression at link time and aborts linking with the given message if zero.',
  REGION_ALIAS: 'Creates an alias name for an existing `MEMORY` region.',
  FILL: 'Specifies the fill pattern for gaps within an output section.',
  SORT_BY_NAME: 'Sorts matching input sections alphabetically by name.',
  SORT_BY_ALIGNMENT: 'Sorts matching input sections in descending order of alignment.',
};

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const parts = [`${bytes.toLocaleString()} bytes`];
  if (bytes >= 1073741824) parts.push(`${(bytes / 1073741824).toFixed(2)} GiB`);
  else if (bytes >= 1048576) parts.push(`${(bytes / 1048576).toFixed(2)} MiB`);
  else if (bytes >= 1024) parts.push(`${(bytes / 1024).toFixed(1)} KiB`);
  return parts.join(' — ');
}

function parseNumericLiteral(token: string): number | undefined {
  const m = /^(0x[0-9a-fA-F]+|0b[01]+|[0-9]+)([KkMmGg])?$/.exec(token);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  const base = raw.startsWith('0x') ? parseInt(raw, 16) : raw.startsWith('0b') ? parseInt(raw.slice(2), 2) : parseInt(raw, 10);
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2] ? ({ k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()] ?? 1) : 1;
  return base * mult;
}

function stripComments(line: string, inComment: boolean): { text: string; inComment: boolean } {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (inComment) {
      const end = line.indexOf('*/', i);
      if (end === -1) return { text: out.trim(), inComment: true };
      inComment = false;
      i = end + 2;
    } else if (line[i] === '/' && line[i + 1] === '*') {
      inComment = true;
      i += 2;
    } else if (line[i] === '/' && line[i + 1] === '/') {
      break;
    } else {
      out += line[i++];
    }
  }
  return { text: out.trim(), inComment };
}

class LdSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    let inBlock: 'MEMORY' | 'SECTIONS' | null = null;
    let blockSym: vscode.DocumentSymbol | null = null;
    let braceDepth = 0;
    let inComment = false;

    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      const res = stripComments(lineText, inComment);
      inComment = res.inComment;
      const stripped = res.text;
      if (!stripped) continue;

      const openBraces = (stripped.match(/\{/g) || []).length;
      const closeBraces = (stripped.match(/\}/g) || []).length;

      if (braceDepth === 0) {
        const entryM = /^\bENTRY\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/.exec(stripped);
        if (entryM) {
          const range = document.lineAt(i).range;
          symbols.push(new vscode.DocumentSymbol(entryM[1], 'ENTRY', vscode.SymbolKind.Function, range, range));
        } else if (/^\bMEMORY\b/.test(stripped)) {
          const range = document.lineAt(i).range;
          blockSym = new vscode.DocumentSymbol('MEMORY', 'regions', vscode.SymbolKind.Namespace, range, range);
          symbols.push(blockSym);
          inBlock = 'MEMORY';
        } else if (/^\bSECTIONS\b/.test(stripped)) {
          const range = document.lineAt(i).range;
          blockSym = new vscode.DocumentSymbol('SECTIONS', 'layout', vscode.SymbolKind.Namespace, range, range);
          symbols.push(blockSym);
          inBlock = 'SECTIONS';
        } else {
          const assignM = /^(?:PROVIDE(?:_HIDDEN)?\s*\(\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;)]+)/.exec(stripped);
          if (assignM) {
            const range = document.lineAt(i).range;
            symbols.push(new vscode.DocumentSymbol(assignM[1], assignM[2].trim(), vscode.SymbolKind.Variable, range, range));
          }
        }
      } else if (inBlock === 'MEMORY' && braceDepth === 1 && blockSym) {
        const memM = /^([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?\s*:/.exec(stripped);
        if (memM) {
          const range = document.lineAt(i).range;
          const detail = stripped.slice(memM[0].length).trim();
          blockSym.children.push(new vscode.DocumentSymbol(memM[1], detail, vscode.SymbolKind.Struct, range, range));
        }
      } else if (inBlock === 'SECTIONS' && braceDepth === 1 && blockSym) {
        const secM = /^(\.[A-Za-z0-9_.*-]+|\/DISCARD\/)\s*(?:\([^)]*\))?\s*:/.exec(stripped);
        if (secM) {
          const range = document.lineAt(i).range;
          blockSym.children.push(new vscode.DocumentSymbol(secM[1], 'section', vscode.SymbolKind.Field, range, range));
        }
      }

      braceDepth = Math.max(0, braceDepth + openBraces - closeBraces);
      if (braceDepth === 0 && blockSym) {
        blockSym.range = new vscode.Range(blockSym.range.start, document.lineAt(i).range.end);
        inBlock = null;
        blockSym = null;
      }
    }

    return symbols;
  }
}

class LdHoverProvider implements vscode.HoverProvider {
  public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
    if (!wordRange) return undefined;
    const word = document.getText(wordRange);

    if (KEYWORD_DOCS[word]) {
      return new vscode.Hover(new vscode.MarkdownString(`**${word}** — ${KEYWORD_DOCS[word]}`), wordRange);
    }

    const num = parseNumericLiteral(word);
    if (num !== undefined) {
      const hexVal = num <= 0xffffffff ? (num >>> 0).toString(16) : Math.floor(num).toString(16);
      const hex = `0x${hexVal.toUpperCase().padStart(8, '0')}`;
      return new vscode.Hover(new vscode.MarkdownString(`**${word}** = \`${hex}\` (${formatByteSize(num)})`), wordRange);
    }

    return undefined;
  }
}

class LdViewProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'ldscript.ldView';

  public openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    const fsPath = document.uri.fsPath;
    const baseName = path.basename(fsPath) || fsPath;
    webviewPanel.title = `${baseName} (ld)`;

    let initialized = false;
    const load = async () => {
      try {
        const raw = await vscode.workspace.fs.readFile(document.uri);
        const text = Buffer.from(raw).toString('utf8');
        const parsed = parseLinkerScript(text);
        if (!initialized) {
          initialized = true;
          webviewPanel.webview.html = getLdWebviewContent(parsed, baseName);
        } else {
          void webviewPanel.webview.postMessage({
            type: 'update',
            payload: { fileName: baseName, ...parsed },
          });
        }
      } catch (err) {
        initialized = false;
        webviewPanel.webview.html = `<!DOCTYPE html><body style="font-family:sans-serif;padding:16px;color:#f48771">
          Failed to parse linker script: ${String(err)}</body>`;
      }
    };

    await load();

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg && msg.type === 'openRaw') {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      }
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 250);
    };
    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) scheduleLoad();
    });
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(fsPath)), baseName)
    );
    watcher.onDidChange(scheduleLoad);
    watcher.onDidCreate(scheduleLoad);

    webviewPanel.onDidDispose(() => {
      if (timer) clearTimeout(timer);
      changeSub.dispose();
      watcher.dispose();
      msgSub.dispose();
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: 'ld' };
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new LdSymbolProvider()),
    vscode.languages.registerHoverProvider(selector, new LdHoverProvider()),
    vscode.window.registerCustomEditorProvider(LdViewProvider.viewType, new LdViewProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('ldscript.openAnalyzer', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        await vscode.commands.executeCommand('vscode.openWith', target, LdViewProvider.viewType);
      }
    })
  );
}

export function deactivate(): void {}
