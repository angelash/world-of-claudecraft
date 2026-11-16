// Money display moved out of the kernel (PK-M0-14): formatMoney in src/shared_ui/i18n.ts and
// the {m, money} placeholder must render copper exactly like the kernel's old
// systems/inventory formatMoney, which is copied below as the oracle.

import { describe, expect, it } from 'vitest';
import { formatMoney, formatText, SOURCE_TABLE } from '../src/shared_ui/i18n';

/** The kernel formatter before the migration, verbatim. */
function oldFormatMoney(copper: number): string {
  const sign = copper < 0 ? '-' : '';
  let c = Math.abs(Math.round(copper));
  const g = Math.floor(c / 10000);
  c -= g * 10000;
  const s = Math.floor(c / 100);
  c -= s * 100;
  const parts: string[] = [];
  if (g) parts.push(`${g} 金`);
  if (s) parts.push(`${s} 银`);
  if (c || parts.length === 0) parts.push(`${c} 铜`);
  return sign + parts.join(' ');
}

const AMOUNTS = [0, 7, 120, 5000, 12345, 1000000, 10001, 99.6, -250, -12345];

describe('formatMoney after the kernel migration', () => {
  it('renders copper exactly like the old kernel formatter', () => {
    for (const n of AMOUNTS) expect(formatMoney(n), String(n)).toBe(oldFormatMoney(n));
  });

  it('pins the source-language forms', () => {
    expect(formatMoney(0)).toBe('0 铜');
    expect(formatMoney(12345)).toBe('1 金 23 银 45 铜');
    expect(formatMoney(1000000)).toBe('100 金');
    expect(formatMoney(-250)).toBe('-2 银 50 铜');
  });

  it('renders the {m, money} placeholder the same way', () => {
    const table = { ...SOURCE_TABLE, 'sys.test.cost': '花了 {m, money}' };
    for (const n of AMOUNTS) {
      expect(
        formatText({ key: 'sys.test.cost', params: { m: n } }, { table, lang: 'zh-Hans' }),
      ).toBe(`花了 ${oldFormatMoney(n)}`);
    }
  });
});
