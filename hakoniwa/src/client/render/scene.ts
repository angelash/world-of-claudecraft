// Scene description: everything one frame draws, as plain data. The session builds it
// from GameView plus client state; a renderer backend (Canvas2D now, a Three.js
// orthographic sprite batch later, decision A-04) only executes it. Depth order is the
// foot (anchor) y with the stable id as tie-break (art_pipeline_2d.md 2.4). Pure.

import type { Calendar } from '../../core/time';
import type { Entity, MapDef, Weather } from '../../systems/world/types';
import type { SpriteLook } from '../sprites/look';
import type { AnimSample } from './anim_state';
import type { Bubble } from './bubbles';
import type { Camera } from './camera';
import type { FloatingDraw } from './floating_text';
import { LIGHT_COLORS, type LightingParams, lampLit, lightingAt } from './lighting';
import type { MarkerKind } from './markers';
import { type RoofSpec, underRoof } from './roofs';

export type Relation = 'self' | 'hostile' | 'friendly' | 'neutral';

export function relationOf(
  e: Pick<Entity, 'id' | 'kind' | 'tags' | 'faction'>,
  playerId: string,
): Relation {
  if (e.id === playerId) return 'self';
  const tags = e.tags ?? [];
  if (tags.includes('hostile')) return 'hostile';
  if (tags.includes('friendly')) return 'friendly';
  if (e.kind === 'monster') return 'hostile';
  if (e.kind === 'npc' || e.kind === 'companion' || e.faction === 'player') return 'friendly';
  return 'neutral';
}

export interface SceneEntity {
  type: 'entity';
  id: string;
  sortY: number;
  x: number;
  y: number;
  look: SpriteLook;
  anim: AnimSample;
  relation: Relation;
  kind: Entity['kind'];
  name: string;
  showName: boolean;
  selected: boolean;
  hovered: boolean;
  marker: MarkerKind | null;
  glyph?: string;
}

export interface SceneProp {
  type: 'prop';
  id: string;
  sortY: number;
  prop: 'tree' | 'rock';
  variant: number;
  tx: number;
  ty: number;
}

export interface SceneRoof {
  type: 'roof';
  id: string;
  sortY: number;
  roof: RoofSpec;
  openness: number;
}

export type SceneItem = SceneEntity | SceneProp | SceneRoof;

export interface SceneLight {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
}

export interface Scene {
  map: MapDef;
  camera: Camera;
  timeMs: number;
  items: SceneItem[];
  lighting: LightingParams;
  lights: SceneLight[];
  weather: Weather;
  /** 0..1 sediment haze (map.sediment / 7) */
  sediment: number;
  /** 0..1 divine-court radiance */
  divine: number;
  bubbles: Bubble[];
  moveTarget: { x: number; y: number; ageMs: number } | null;
  /** exit label shown near the player when one is in reach */
  exitHint: { x: number; y: number; text: string } | null;
  floats: FloatingDraw[];
  placement: PlacementOverlay | null;
}

/** Building placement preview: footprint tiles, the blocked ones, and the entrance. */
export interface PlacementOverlay {
  ok: boolean;
  tiles: { x: number; y: number }[];
  blocked: { x: number; y: number }[];
  entrance: { x: number; y: number } | null;
  label: string;
}

export interface SceneEntityInput {
  entity: Readonly<Entity>;
  x: number;
  y: number;
  look: SpriteLook;
  anim: AnimSample;
  marker: MarkerKind | null;
}

export interface SceneInput {
  map: MapDef;
  camera: Camera;
  timeMs: number;
  playerId: string;
  calendar: Calendar;
  weather: Weather;
  entities: readonly SceneEntityInput[];
  props: readonly { kind: 'tree' | 'rock'; tx: number; ty: number; variant: number }[];
  roofs: readonly RoofSpec[];
  roofOpenness: (id: string) => number;
  selection: string | null;
  hover: string | null;
  bubbles: Bubble[];
  extraLights?: readonly SceneLight[];
  moveTarget?: { x: number; y: number; ageMs: number } | null;
  exitHint?: { x: number; y: number; text: string } | null;
  floats?: FloatingDraw[];
  placement?: PlacementOverlay | null;
}

/** Maps whose ids mark the divine court get the radiance ambience. */
export function divineLevel(map: MapDef): number {
  return map.id === 'divine_court' || map.region === 'divine_court' || map.region === 'divine'
    ? 1
    : 0;
}

export function sedimentLevel(map: MapDef): number {
  return Math.max(0, Math.min(1, (map.sediment ?? 0) / 7));
}

/** Door tiles on outdoor maps carry a lamp. */
export function doorLights(map: MapDef): SceneLight[] {
  const out: SceneLight[] = [];
  if (map.indoor) return out;
  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] ?? '';
    for (let x = 0; x < map.width; x++) {
      if (map.legend[row[x] ?? ''] !== 'door') continue;
      out.push({
        id: `${map.id}:door:${x}:${y}`,
        x: x + 0.5,
        y: y + 0.5,
        radius: 3.2,
        color: LIGHT_COLORS.lamp,
        intensity: 1,
      });
    }
  }
  return out;
}

export function shouldShowName(
  e: Pick<Entity, 'kind' | 'name'>,
  relation: Relation,
  selected: boolean,
  hovered: boolean,
): boolean {
  if (!e.name || e.name === '?') return false;
  if (selected || hovered) return true;
  if (relation === 'self') return false;
  return e.kind === 'npc' || e.kind === 'companion';
}

export function buildScene(input: SceneInput, staticLights: readonly SceneLight[] = []): Scene {
  const { map } = input;
  const items: SceneItem[] = [];
  const lights: SceneLight[] = [];
  const lighting = lightingAt(input.calendar, input.weather, !!map.indoor);

  for (const ei of input.entities) {
    const e = ei.entity;
    if (e.hidden) continue;
    const relation = relationOf(e, input.playerId);
    const selected = input.selection === e.id;
    const hovered = input.hover === e.id;
    // Inside a building whose roof is closed: no name or marker leaks through the roof.
    const covered = input.roofs.some(
      (r) => underRoof(r, ei.x, ei.y) && input.roofOpenness(r.locationId) < 0.5,
    );
    items.push({
      type: 'entity',
      id: e.id,
      sortY: ei.y,
      x: ei.x,
      y: ei.y,
      look: ei.look,
      anim: ei.anim,
      relation,
      kind: e.kind,
      name: e.name,
      showName: !covered && shouldShowName(e, relation, selected, hovered),
      selected,
      hovered,
      marker: covered ? null : ei.marker,
      glyph: ei.look.glyph,
    });
    if (ei.look.archetype === 'goddess' || ei.look.archetype === 'spirit') {
      lights.push({
        id: `glow:${e.id}`,
        x: ei.x,
        y: ei.y - 0.8,
        radius: ei.look.archetype === 'goddess' ? 4 : 2.5,
        color: ei.look.archetype === 'goddess' ? LIGHT_COLORS.divine : LIGHT_COLORS.spirit,
        intensity: 1,
      });
    }
    if (relation === 'self' && lighting.personalLight) {
      lights.push({
        id: 'personal',
        x: ei.x,
        y: ei.y - 0.3,
        radius: 4.5,
        color: LIGHT_COLORS.player,
        intensity: 0.9 * (1 - lighting.daylight),
      });
    }
  }
  for (const p of input.props) {
    items.push({
      type: 'prop',
      id: `prop:${p.tx}:${p.ty}`,
      sortY: p.ty + 0.98,
      prop: p.kind,
      variant: p.variant,
      tx: p.tx,
      ty: p.ty,
    });
  }
  for (const r of input.roofs) {
    const openness = input.roofOpenness(r.locationId);
    items.push({ type: 'roof', id: `roof:${r.locationId}`, sortY: r.y + r.h, roof: r, openness });
    if (openness > 0.5) {
      lights.push({
        id: `hearth:${r.locationId}`,
        x: r.x + r.w / 2,
        y: r.y + r.h / 2,
        radius: Math.max(r.w, r.h) / 2 + 1,
        color: LIGHT_COLORS.hearth,
        intensity: 0.8,
      });
    }
  }
  items.sort((a, b) => a.sortY - b.sortY || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const l of staticLights) {
    if (lampLit(l.id, lighting.lampLevel)) lights.push(l);
  }
  if (input.extraLights) lights.push(...input.extraLights);

  return {
    map,
    camera: input.camera,
    timeMs: input.timeMs,
    items,
    lighting,
    lights,
    weather: map.indoor ? 'clear' : input.weather,
    sediment: sedimentLevel(map),
    divine: divineLevel(map),
    bubbles: input.bubbles,
    moveTarget: input.moveTarget ?? null,
    exitHint: input.exitHint ?? null,
    floats: input.floats ?? [],
    placement: input.placement ?? null,
  };
}
