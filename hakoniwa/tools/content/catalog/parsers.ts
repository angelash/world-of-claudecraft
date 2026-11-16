// Cell parsers of the catalog mappings: turn one markdown table cell into a field value.
// A parser returns undefined when the cell does not carry a value it can read; the
// importer then lists the field as one the author fills (release_engineering.md 7.1: the
// script does not guess). Pure.

export type CellParser = (cell: string) => unknown;

/** Inline markdown to plain text: code spans, links, emphasis; designer notes dropped. */
export function plain(cell: string): string {
  return cell
    .replace(/【真相[^】]*】[^。；;]*[。；;]?/g, '')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const COPPER_PER: Record<string, number> = { 铜: 1, 银: 100, 金: 10000 };

const AMOUNT = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(铜|银|金)/g;

/**
 * A price in copper. The cell outside full-width parentheses must be amounts only: "2.2 银"
 * is 220, "1 银 20 铜" 120, "60 铜（教会收购 80 铜）" 60 (the parenthesis is a note).
 * Anything else ("8 铜收购（...）", "有价无市", "不标价", blanks) is undefined: the author
 * reads the cell.
 */
export function copper(cell: string): number | undefined {
  const main = plain(cell)
    .replace(/（[^）]*）/g, '')
    .trim();
  if (main === '' || main.replace(AMOUNT, '').trim() !== '') return undefined;
  let total = 0;
  for (const m of main.matchAll(AMOUNT))
    total += Number((m[1] as string).replace(/,/g, '')) * (COPPER_PER[m[2] as string] ?? 1);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : undefined;
}

/** A display name: the text before the first full-width parenthesis ("铁矿石（已有）"). */
export function displayName(cell: string): string | undefined {
  const t = plain(cell).split('（')[0]?.trim() ?? '';
  return t === '' ? undefined : t;
}

/** Plain text, undefined when empty. */
export function text(cell: string): string | undefined {
  const t = plain(cell);
  return t === '' ? undefined : t;
}

/** The id in a code span at the start of the cell. */
export function code(cell: string): string | undefined {
  return /^`([a-z][a-z0-9_]*)`/.exec(cell.trim())?.[1];
}

/** An integer ("12", "T3" is 3). */
export function int(cell: string): number | undefined {
  const m = /^T?([0-9]+)$/i.exec(plain(cell));
  return m ? Number(m[1]) : undefined;
}

/** A list split on the Chinese enumeration comma (and commas). */
export function list(cell: string): string[] | undefined {
  const items = plain(cell)
    .split(/[、，,]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return items.length ? items : undefined;
}

/** Named parsers a mapping can refer to. */
export const PARSERS: Readonly<Record<string, CellParser>> = {
  code,
  text,
  name: displayName,
  copper,
  int,
  list,
};
