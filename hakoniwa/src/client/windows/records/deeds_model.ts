// Implements the model of `ui_win_deeds` (ux_and_onboarding.md 6.3.1;
// catalog_deeds_titles.md 2.4, 2.8, 2.11): the book of deeds and titles. The book's form
// follows the act (刻痕, 手录, 人簿, 呈堂) and only the wording changes with it, never the
// data. Deeds are grouped by their 14 classes; in the carvings stage only the deeds a door
// takes as a key stand by class, and the rest are filed under 未记之事 (2.11). A deed not
// earned yet has no name (its row
// reads as unrecorded), a branch deed whose branch closed this cycle says so and is left out
// of the denominator, and feats never count toward completion. Titles: street names are
// read-only ("人们怎么叫你"), one office name may be worn. The pillar of the inner court
// shows its slots and what is carved in each. Pure; Node-tested. The painter is
// ./deeds_window.ts.

import { t } from '../../../shared_ui/i18n';
import type {
  BookStage,
  DeedBookView,
  DeedClass,
  DeedRowView,
  Grade,
  TitleRowView,
} from '../../../systems/records';

export const DEEDS_TABS = ['deeds', 'titles', 'pillar'] as const;
export type DeedsTab = (typeof DEEDS_TABS)[number];

/** Deed classes in the order the book lists them (catalog_deeds_titles.md 3). */
export const DEED_CLASS_ORDER: readonly DeedClass[] = [
  'grow',
  'hunt',
  'rare',
  'dg',
  'exp',
  'col',
  'bond',
  'mgmt',
  'war',
  'god',
  'truth',
  'mortal',
  'hid',
  'feat',
];

/** Fame bands as words (6.1: a band and a count, never a colour alone). */
export const FAME_BAND_FLOORS = [0, 10, 30, 60, 100] as const;

/** How many of `floors` the value has reached (the fame band index). */
export function fameBand(fame: number): number {
  let n = 0;
  for (const f of FAME_BAND_FLOORS) if (fame >= f) n++;
  return Math.max(1, n) - 1;
}

export interface DeedRow {
  id: string;
  /** the name, or the wording for a deed not earned yet */
  label: string;
  /** what was done ('' before it is earned) */
  desc: string;
  earned: boolean;
  /** the grade as words ('' before it is earned) */
  grade: string;
  /** "这一期没有发生" for a branch that closed, '' otherwise */
  branchNote: string;
  /** a feat (壮): zero fame, never counted */
  feat: boolean;
  fame: number;
  /** it may be carved on the pillar and is earned */
  carvable: boolean;
}

/** The carvings stage's group for deeds no door takes as a key (未记之事, catalog 2.11). */
export const UNRECORDED_GROUP = 'unrecorded';

export interface DeedGroup {
  cls: DeedClass | typeof UNRECORDED_GROUP;
  label: string;
  rows: DeedRow[];
}

export interface TitleRow {
  id: string;
  name: string;
  kind: TitleRowView['kind'];
  /** "授予：…" */
  grantedBy: string;
  /** "谁看得见：…" */
  visibleTo: string;
  /** "怎样会失去：…" */
  loss: string;
  worn: boolean;
  lost: boolean;
  /** an office title that is not lost may be worn */
  wearable: boolean;
}

export interface PillarSlotRow {
  slot: number;
  /** the deed carved there, or the wording of an empty slot */
  label: string;
  deedId: string | null;
}

export interface DeedsModel {
  tab: DeedsTab;
  tabs: { id: DeedsTab; label: string; count: number }[];
  /** the book's name in this form (6.3.1: 门旁的刻痕, 布伦手录, 人簿, 人簿（呈堂）) */
  stageTitle: string;
  /** the completion line: earned of the counted total */
  progress: string;
  /** the fame line: its band, and the count only when asked for numbers */
  fame: string;
  groups: DeedGroup[];
  titles: TitleRow[];
  pillar: PillarSlotRow[];
  /** earned deeds that may be carved and are not on the pillar yet */
  carvable: { id: string; label: string }[];
  /** every slot is carved while a deed still waits (6.3.1 error state), else '' */
  pillarFull: string;
  /** the empty state of the current tab ('' when the tab has rows) */
  empty: string;
  /**
   * The stage's "nothing yet" sentence while no deed is earned but unearned rows still show
   * (the deeds tab), else ''. With nothing at all to show, `empty` carries it instead.
   */
  nothingEarned: string;
  /** the pillar is not unlocked yet (no slots) */
  pillarLocked: boolean;
}

export interface DeedsInput {
  book: DeedBookView;
  tab: DeedsTab;
  /** the gameplay setting "名望显示": a sentence (default) or the number */
  fameNumbers?: boolean;
  /**
   * The deeds some door takes as a key (DeedsAdapter.doorKeyed). In the carvings stage every
   * other deed is filed under 未记之事 instead of its class; absent, nothing is moved.
   */
  doorKeyed?: ReadonlySet<string>;
}

function gradeText(g: Grade | null): string {
  return g ? t(`ui.win.deeds.grade.${g}`) : '';
}

function stageTitle(stage: BookStage): string {
  return t(`ui.win.deeds.stage.${stage}`);
}

function deedRow(d: DeedRowView): DeedRow {
  const earned = d.earnedTick !== null;
  return {
    id: d.id,
    label: earned && d.name !== null ? t(d.name) : t('ui.win.deeds.unearned'),
    desc: earned && d.desc !== null ? t(d.desc) : '',
    earned,
    grade: earned ? gradeText(d.grade) : '',
    branchNote: !earned && d.branchMissing ? t('ui.win.deeds.branch_missing') : '',
    feat: d.feat,
    fame: d.fame,
    carvable: d.carvable && earned,
  };
}

/** The deeds of one class, earned first, then by the order the content table gave. */
function groupRows(deeds: readonly DeedRowView[], cls: DeedClass): DeedRow[] {
  const rows = deeds.filter((d) => d.cls === cls).map(deedRow);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.earned) - Number(a.r.earned) || a.i - b.i)
    .map((x) => x.r);
}

export function deedsModel(i: DeedsInput): DeedsModel {
  const book = i.book;
  const groups: DeedGroup[] = [];
  // the carvings stage: a deed stands by the door it keys; the rest wait as 未记之事 (2.11)
  const keyed = book.stage === 'carvings' ? i.doorKeyed : undefined;
  const byDoor = keyed ? book.deeds.filter((d) => keyed.has(d.id)) : book.deeds;
  for (const cls of DEED_CLASS_ORDER) {
    const rows = groupRows(byDoor, cls);
    if (rows.length === 0) continue;
    groups.push({ cls, label: t(`ui.win.deeds.cls.${cls}`), rows });
  }
  if (keyed) {
    const rest = book.deeds.filter((d) => !keyed.has(d.id));
    const rows = rest
      .map((d, n) => ({ r: deedRow(d), n }))
      .sort((a, b) => Number(b.r.earned) - Number(a.r.earned) || a.n - b.n)
      .map((x) => x.r);
    if (rows.length > 0) {
      groups.push({ cls: UNRECORDED_GROUP, label: t('ui.win.deeds.unrecorded'), rows });
    }
  }
  const earnedAny = book.deeds.some((d) => d.earnedTick !== null);
  const titles: TitleRow[] = book.titles.map((x) => ({
    id: x.id,
    name: t(x.name),
    kind: x.kind,
    grantedBy: t('ui.win.deeds.granted_by', { who: t(x.grantedBy) }),
    visibleTo: t('ui.win.deeds.visible_to', { who: t(x.visibleTo) }),
    loss: t('ui.win.deeds.loss', { how: t(x.loss) }),
    worn: x.worn,
    lost: x.lost,
    wearable: x.kind === 'office' && !x.lost,
  }));
  const pillar: PillarSlotRow[] = book.pillar.carved.map((deedId, n) => {
    const def = deedId ? book.deeds.find((d) => d.id === deedId) : undefined;
    const name = def?.name ?? null;
    return {
      slot: n,
      deedId,
      label: deedId ? (name ? t(name) : deedId) : t('ui.win.deeds.pillar_free'),
    };
  });
  const carved = new Set(book.pillar.carved.filter((x): x is string => !!x));
  const carvable = book.deeds
    .filter((d) => d.carvable && d.earnedTick !== null && d.name !== null && !carved.has(d.id))
    .map((d) => ({ id: d.id, label: t(d.name as NonNullable<DeedRowView['name']>) }));
  const free = pillar.some((p) => p.deedId === null);
  const counts: Record<DeedsTab, number> = {
    deeds: book.deeds.filter((d) => d.earnedTick !== null).length,
    titles: titles.length,
    pillar: pillar.filter((p) => p.deedId !== null).length,
  };
  const emptyOf = (tab: DeedsTab): string => {
    if (tab === 'deeds') {
      // empty when nothing is earned and no unearned row is shown either (6.1)
      return !earnedAny && book.deeds.length === 0 ? t(`ui.win.deeds.empty.${book.stage}`) : '';
    }
    if (tab === 'titles') return titles.length === 0 ? t('ui.win.deeds.titles_empty') : '';
    return book.pillar.slots === 0 ? t('ui.win.deeds.pillar_locked') : '';
  };
  return {
    tab: i.tab,
    tabs: DEEDS_TABS.map((id) => ({ id, label: t(`ui.win.deeds.tab.${id}`), count: counts[id] })),
    stageTitle: stageTitle(book.stage),
    progress: t('ui.win.deeds.progress', {
      earned: book.progress.earned,
      of: book.progress.of,
    }),
    fame: i.fameNumbers
      ? t('ui.win.deeds.fame_number', {
          band: t(`ui.win.deeds.fame_band.${fameBand(book.fame)}`),
          n: book.fame,
        })
      : t('ui.win.deeds.fame_band_only', {
          band: t(`ui.win.deeds.fame_band.${fameBand(book.fame)}`),
        }),
    groups,
    titles,
    pillar,
    carvable: free ? carvable : [],
    pillarFull:
      !free && pillar.length > 0 && carvable.length > 0 ? t('ui.win.deeds.pillar_full') : '',
    empty: emptyOf(i.tab),
    nothingEarned:
      i.tab === 'deeds' && !earnedAny && book.deeds.length > 0
        ? t(`ui.win.deeds.empty.${book.stage}`)
        : '',
    pillarLocked: book.pillar.slots === 0,
  };
}

/** The title to wear when a row is pressed: nothing when it is already worn (a toggle). */
export function wearTarget(row: Pick<TitleRow, 'id' | 'worn'>): string | null {
  return row.worn ? null : row.id;
}
