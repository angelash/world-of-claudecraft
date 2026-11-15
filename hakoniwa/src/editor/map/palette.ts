// Flat tile colours for the map editor. Independent of the game client's renderer on
// purpose: the editor only needs tiles to be told apart at a glance. Pure.

import { BLOCKING_TILES, type TileKind } from '../../systems/world/types';

/** A Record over TileKind, so a new tile kind fails to compile until it gets a colour. */
export const TILE_COLORS: Record<TileKind, string> = {
  grass: '#5f9e4a',
  dirt: '#8b6b43',
  road: '#bba57c',
  stone: '#8d8f93',
  floor: '#c9b58c',
  sand: '#dcc98f',
  ash: '#6b6460',
  snow: '#eef2f5',
  crop: '#a5b84a',
  bridge: '#9c7444',
  door: '#d08a2e',
  water: '#4f8fd6',
  deep_water: '#2b5ca8',
  wall: '#3c3a40',
  tree: '#2f6b34',
  rock: '#6f6a64',
  void: '#111111',
};

export const TILE_KINDS = Object.keys(TILE_COLORS) as TileKind[];

export function isTileKind(value: unknown): value is TileKind {
  return typeof value === 'string' && value in TILE_COLORS;
}

export function tileColor(kind: string | undefined): string {
  return isTileKind(kind) ? TILE_COLORS[kind] : '#ff00ff';
}

export function isBlockingKind(kind: string | undefined): boolean {
  return !isTileKind(kind) || BLOCKING_TILES.has(kind);
}

/** Distinct tint for connected-component overlays (index 0 = largest area). */
export function componentColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsla(${hue.toFixed(0)}, 85%, 55%, 0.35)`;
}
