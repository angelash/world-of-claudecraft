// Jump links for an issue target (a content row, a map cell, a data file), shared by the
// check desk and the reveal review.

import { button, h } from '../shell/dom';
import type { ToolHost } from '../shell/tool';
import { fmt, T } from '../text';
import type { IssueTarget } from './rules';

export function targetLinks(t: IssueTarget, host: ToolHost): HTMLElement[] {
  switch (t.kind) {
    case 'row': {
      const out = [
        button(
          `${T.checks.openTable} ${t.table} ${t.id}${t.field ? `.${t.field}` : ''}`,
          () =>
            host.navigate('content', {
              file: t.file,
              table: t.table,
              row: t.id,
              field: t.field ?? '',
            }),
          { class: 'link small' },
        ),
      ];
      if (t.table === 'maps') {
        out.push(
          button(T.checks.openMap, () => host.navigate('map', { file: t.file, map: t.id }), {
            class: 'link small',
          }),
        );
      }
      return out;
    }
    case 'map': {
      const params: Record<string, string> = { file: t.file, map: t.mapId };
      if (t.x !== undefined && t.y !== undefined) {
        params.x = String(Math.floor(t.x));
        params.y = String(Math.floor(t.y));
      }
      const where = params.x !== undefined ? ` (${params.x}, ${params.y})` : '';
      return [
        button(`${T.checks.openMap} ${t.mapId}${where}`, () => host.navigate('map', params), {
          class: 'link small',
        }),
        button(
          T.checks.openTable,
          () => host.navigate('content', { file: t.file, table: 'maps', row: t.mapId }),
          { class: 'link small' },
        ),
      ];
    }
    case 'file': {
      const schema = host.ws.schemas.find((s) => s.file === t.file);
      if (!schema) {
        return [
          h('span', { class: 'muted small', text: fmt(T.checks.fileLevel, { file: t.file }) }),
        ];
      }
      return [
        button(
          `${T.checks.openFile} ${t.file}`,
          () => host.navigate('content', { file: t.file, table: schema.table }),
          { class: 'link small' },
        ),
      ];
    }
    case 'none':
      return [];
  }
}
