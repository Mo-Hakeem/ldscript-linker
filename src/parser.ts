export interface LdMemoryRegion {
  name: string;
  attributes: string;
  originRaw: string;
  origin?: number;
  lengthRaw: string;
  length?: number;
}

export interface LdOutputSection {
  name: string;
  flags: string;
  vmaRegion: string;
  lmaRegion: string;
  inputs: string[];
  symbols: string[];
}

export interface LdSymbolDef {
  name: string;
  expr: string;
  provide: boolean;
}

export interface LdAssert {
  condition: string;
  message: string;
}

export interface ParsedLd {
  entry?: string;
  regions: LdMemoryRegion[];
  sections: LdOutputSection[];
  symbols: LdSymbolDef[];
  asserts: LdAssert[];
}

function evalSizeLiteral(raw: string): number | undefined {
  const s = raw.trim();
  const m = /^(0x[0-9a-fA-F]+|0b[01]+|[0-9]+)\s*([KkMmGg])?$/.exec(s);
  if (!m) return undefined;
  const baseStr = m[1].toLowerCase();
  const base = baseStr.startsWith('0x')
    ? parseInt(baseStr, 16)
    : baseStr.startsWith('0b')
      ? parseInt(baseStr.slice(2), 2)
      : parseInt(baseStr, 10);
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2] ? ({ k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()] ?? 1) : 1;
  return base * mult;
}

function stripBlockAndLineComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

export function parseLinkerScript(text: string): ParsedLd {
  const clean = stripBlockAndLineComments(text);
  const lines = clean.split(/\r?\n/);

  let entry: string | undefined;
  const regions: LdMemoryRegion[] = [];
  const sections: LdOutputSection[] = [];
  const symbols: LdSymbolDef[] = [];
  const asserts: LdAssert[] = [];

  let inBlock: 'MEMORY' | 'SECTIONS' | null = null;
  let braceDepth = 0;
  let currentSec: LdOutputSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    if (braceDepth === 0) {
      const entryM = /^ENTRY\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/.exec(trimmed);
      if (entryM) {
        entry = entryM[1];
      } else if (/^MEMORY\b/.test(trimmed)) {
        inBlock = 'MEMORY';
      } else if (/^SECTIONS\b/.test(trimmed)) {
        inBlock = 'SECTIONS';
      } else {
        const assertM = /^ASSERT\s*\(\s*(.+?)\s*,\s*"([^"]*)"\s*\)/.exec(trimmed);
        if (assertM) {
          asserts.push({ condition: assertM[1], message: assertM[2] });
        } else {
          const provM = /^(PROVIDE(?:_HIDDEN)?)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;)]+)\)/.exec(trimmed);
          if (provM) {
            symbols.push({ name: provM[2], expr: provM[3].trim(), provide: true });
          } else {
            const assignM = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);?/.exec(trimmed);
            if (assignM) {
              symbols.push({ name: assignM[1], expr: assignM[2].trim(), provide: false });
            }
          }
        }
      }
    } else if (inBlock === 'MEMORY' && braceDepth === 1) {
      const memM = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/.exec(trimmed);
      if (memM) {
        const rest = memM[3];
        const orgM = /\b(?:ORIGIN|org|o)\s*=\s*([^,]+)/i.exec(rest);
        const lenM = /\b(?:LENGTH|len|l)\s*=\s*([^,\n}]+)/i.exec(rest);
        const originRaw = orgM ? orgM[1].trim() : '';
        const lengthRaw = lenM ? lenM[1].trim() : '';
        regions.push({
          name: memM[1],
          attributes: memM[2] ? memM[2].trim() : '',
          originRaw,
          origin: evalSizeLiteral(originRaw),
          lengthRaw,
          length: evalSizeLiteral(lengthRaw),
        });
      }
    } else if (inBlock === 'SECTIONS') {
      if (braceDepth === 1) {
        const secM = /^(\.[A-Za-z0-9_.*-]+|\/DISCARD\/|[A-Za-z_][A-Za-z0-9_.$]*)\s*(?:\(([^)]*)\))?\s*:/.exec(trimmed);
        if (secM) {
          currentSec = {
            name: secM[1],
            flags: secM[2] ? secM[2].trim() : '',
            vmaRegion: '',
            lmaRegion: '',
            inputs: [],
            symbols: [],
          };
          sections.push(currentSec);
        } else {
          const assertM = /^ASSERT\s*\(\s*(.+?)\s*,\s*"([^"]*)"\s*\)/.exec(trimmed);
          if (assertM) {
            asserts.push({ condition: assertM[1], message: assertM[2] });
          }
        }
      } else if (braceDepth >= 2 && currentSec) {
        if (trimmed.startsWith('}')) {
          const redir = /\}(?:\s*>\s*([A-Za-z_][A-Za-z0-9_]*))?(?:\s*AT\s*>\s*([A-Za-z_][A-Za-z0-9_]*))?/.exec(trimmed);
          if (redir) {
            if (redir[1]) currentSec.vmaRegion = redir[1];
            if (redir[2]) currentSec.lmaRegion = redir[2];
          }
          if (braceDepth + openBraces - closeBraces <= 1) {
            currentSec = null;
          }
        } else {
          const symM = /^(?:PROVIDE(?:_HIDDEN)?\s*\(\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(trimmed);
          if (symM) {
            currentSec.symbols.push(symM[1]);
          } else if (trimmed.includes('*(') || trimmed.startsWith('KEEP') || trimmed.startsWith('SORT') || trimmed.startsWith('. =') || trimmed.startsWith('.=')) {
            currentSec.inputs.push(trimmed);
          }
        }
      }
    }

    braceDepth = Math.max(0, braceDepth + openBraces - closeBraces);
    if (closeBraces > 0 && braceDepth === 0) {
      inBlock = null;
      currentSec = null;
    }
  }

  return { entry, regions, sections, symbols, asserts };
}

export function serializeLinkerScript(d: ParsedLd): string {
  const lines: string[] = [];
  if (d.entry) {
    lines.push(`ENTRY(${d.entry})`);
    lines.push('');
  }

  for (const s of d.symbols) {
    if (s.provide) {
      lines.push(`PROVIDE(${s.name} = ${s.expr});`);
    } else {
      lines.push(`${s.name} = ${s.expr};`);
    }
  }
  if (d.symbols.length) lines.push('');

  if (d.regions.length) {
    lines.push('MEMORY');
    lines.push('{');
    for (const r of d.regions) {
      const attr = r.attributes ? ` (${r.attributes})` : '';
      lines.push(`  ${r.name}${attr} : ORIGIN = ${r.originRaw}, LENGTH = ${r.lengthRaw}`);
    }
    lines.push('}');
    lines.push('');
  }

  if (d.sections.length) {
    lines.push('SECTIONS');
    lines.push('{');
    for (const s of d.sections) {
      const flg = s.flags ? ` (${s.flags})` : '';
      lines.push(`  ${s.name}${flg} :`);
      lines.push('  {');
      for (const inp of s.inputs) {
        lines.push(`    ${inp}`);
      }
      for (const sym of s.symbols) {
        lines.push(`    ${sym} = .;`);
      }
      const vma = s.vmaRegion ? ` > ${s.vmaRegion}` : '';
      const lma = s.lmaRegion ? ` AT> ${s.lmaRegion}` : '';
      lines.push(`  }${vma}${lma}`);
      lines.push('');
    }
    lines.push('}');
    lines.push('');
  }

  for (const a of d.asserts) {
    lines.push(`ASSERT(${a.condition}, "${a.message}")`);
  }

  return lines.join('\n');
}
