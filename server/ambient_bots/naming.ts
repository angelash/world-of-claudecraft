import { randomBytes } from 'node:crypto';
import type { PlayerClass } from '../../src/sim/types';

const CLASS_NAME_BASE: Record<PlayerClass, string> = {
  warrior: 'Branor',
  paladin: 'Aldren',
  hunter: 'Corwin',
  rogue: 'Selric',
  priest: 'Ilyra',
  shaman: 'Torven',
  mage: 'Merion',
  warlock: 'Vaelis',
  druid: 'Faelar',
};

export function ambientBotId(): string {
  return `ambient_${randomBytes(6).toString('hex')}`;
}

export function ambientBotAccountUsername(profileId: string): string {
  const slug = profileId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'ambient';
  const compactSlug = slug.slice(0, 11);
  return `bot_${compactSlug}_${randomBytes(4).toString('hex')}`;
}

export function ambientBotAccountPassword(): string {
  return `Bot${randomBytes(12).toString('hex')}`;
}

export function ambientBotCharacterName(cls: PlayerClass, sequence: number): string {
  const base = CLASS_NAME_BASE[cls];
  const suffix = `${lettersFromSequence(sequence).slice(-2)}${lettersFromBytes(randomBytes(2), 2)}`;
  return `${base}${suffix}`.slice(0, 16);
}

function lettersFromSequence(sequence: number): string {
  let value = Math.max(0, Math.floor(sequence));
  let out = '';
  do {
    out = String.fromCharCode(97 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out.length >= 3 ? out.slice(-3) : out.padStart(3, 'a');
}

function lettersFromBytes(bytes: Uint8Array, length: number): string {
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    out += String.fromCharCode(97 + (bytes[i] % 26));
  }
  return out.padEnd(length, 'a');
}
