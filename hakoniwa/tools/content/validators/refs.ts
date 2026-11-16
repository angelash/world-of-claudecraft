// V2 references (release_engineering.md 7.4): every cross-table id exists. The uniform
// floor is the reference table of the content layer (src/content/references.ts
// REF_PATHS, every reference field of every table); on top of it the `ref` fields the pack
// schemas declare, checked with the editor's form model; and the scene line speakers
// (a line without its own name label names a speaker row). The pack validators' own
// reference checks run in V1 (validateContent).

import { danglingLineSpeakers, danglingRefs, idSets } from '../../../src/content/references';
import { validateRows } from '../../../src/editor/content/form_model';
import { rowsOf } from '../../../src/editor/content/rows';
import type { Finding, ValidationInput, Validator } from './types';

export const refsValidator: Validator = {
  id: 'V2',
  title: 'references',
  run(input: ValidationInput): Finding[] {
    const out: Finding[] = [];
    for (const u of [...danglingRefs(input.content), ...danglingLineSpeakers(input.content)]) {
      out.push({
        level: 'error',
        message: `${u.table}:${u.row} ${u.path}: no ${u.to.join(' or ')} row has id '${u.value}'`,
        table: u.table,
        row: u.row,
        path: u.path,
      });
    }
    const ids = idSets(input.content);
    for (const pack of input.packs) {
      for (const schema of pack.schemas ?? []) {
        if (!schema.fields.some((f) => f.refTable)) continue;
        const rows = rowsOf(input.files.get(schema.file), schema.table, schema.idField);
        if (!rows) continue;
        for (const p of validateRows(schema, rows, (t) => ids.get(t))) {
          if (p.code !== 'ref') continue;
          const field = schema.fields.find((f) => f.key === p.field);
          out.push({
            level: 'error',
            message: `${schema.file} ${schema.table}:${p.id ?? `#${p.index + 1}`} ${p.field}: unknown ${field?.refTable ?? 'row'} id`,
            file: schema.file,
            table: schema.table,
            row: p.id,
            path: p.field,
          });
        }
      }
    }
    return out;
  },
};
