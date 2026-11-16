// Markdown tables of the design catalogs (docs/40_design/content/catalog_*.md): headings,
// pipe tables, and the rows whose first cell is an id in a code span
// (release_engineering.md 7.1: "rows of a catalog table that start with an ID"). Pure.

export interface MdRow {
  /** 1-based line number in the document */
  line: number;
  cells: string[];
}

export interface MdTable {
  /** text of the nearest heading above the table, without the leading #'s */
  heading: string;
  /** every enclosing heading, outermost first */
  headingPath: string[];
  /** 1-based line of the header row */
  line: number;
  headers: string[];
  rows: MdRow[];
}

/**
 * Cells of one table row. Pipes inside code spans and escaped pipes (`\|`) stay in the
 * cell; the outer pipes are dropped; cells are trimmed.
 */
export function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '\\' && text[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '`') code = !code;
    if (c === '|' && !code) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && !text.endsWith('\\|')) cells.pop();
  return cells.map((c) => c.trim());
}

const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Every pipe table of a document with its heading context. */
export function parseTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const out: MdTable[] = [];
  const path: { level: number; text: string }[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = HEADING.exec(line);
    if (h) {
      const level = (h[1] as string).length;
      while (path.length && (path[path.length - 1] as { level: number }).level >= level) path.pop();
      path.push({ level, text: h[2] as string });
      continue;
    }
    const next = lines[i + 1];
    if (!line.trim().startsWith('|') || next === undefined || !SEPARATOR.test(next.trim()))
      continue;
    const table: MdTable = {
      heading: path.length ? (path[path.length - 1] as { text: string }).text : '',
      headingPath: path.map((p) => p.text),
      line: i + 1,
      headers: splitRow(line),
      rows: [],
    };
    let j = i + 2;
    for (; j < lines.length; j++) {
      const row = lines[j] as string;
      if (!row.trim().startsWith('|')) break;
      table.rows.push({ line: j + 1, cells: splitRow(row) });
    }
    out.push(table);
    i = j - 1;
  }
  return out;
}

const ID_CELL = /^`([a-z][a-z0-9_]*)`/;

/** The id of a row whose first cell starts with an id in a code span, else null. */
export function rowId(row: MdRow): string | null {
  const m = ID_CELL.exec(row.cells[0] ?? '');
  return m ? (m[1] as string) : null;
}

/** Tables under a heading whose text starts with `section` (for example `3.8`). */
export function tablesInSection(tables: readonly MdTable[], section: string): MdTable[] {
  return tables.filter((t) =>
    t.headingPath.some((h) => h === section || h.startsWith(`${section} `)),
  );
}
