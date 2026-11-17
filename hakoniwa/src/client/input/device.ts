// Input device tracking and controller families (ux_and_onboarding.md 16.1; release_
// engineering.md 4.4): the last device that gave a real input decides which key glyphs the
// interface shows (a mouse counts once it travels more than 8 pixels), and a gamepad's id
// decides its glyph family (Xbox, PlayStation, Switch, Steam Deck, or the game's own neutral
// glyphs); the settings may pin a family. Pure.

export type InputDevice = 'kbm' | 'pad';

export const GLYPH_FAMILIES = ['xbox', 'playstation', 'switch', 'deck', 'neutral'] as const;
export type GlyphFamily = (typeof GLYPH_FAMILIES)[number];

/** The glyph setting: follow the pad, or one family. */
export const GLYPH_SETTINGS = ['auto', ...GLYPH_FAMILIES] as const;
export type GlyphSetting = (typeof GLYPH_SETTINGS)[number];

/** Pointer travel (CSS pixels) that switches the glyphs back to keyboard and mouse. */
export const POINTER_SWITCH_PX = 8;
/** The pointer travel must happen within this time to count (ms). */
export const POINTER_WINDOW_MS = 250;

/**
 * The glyph family of a Gamepad.id. Browsers report the USB vendor id (045e Microsoft,
 * 054c Sony, 057e Nintendo, 28de Valve) or a product name; Steam Input's virtual pads
 * report as Xbox controllers. Anything unknown takes the neutral glyphs.
 */
export function familyFromId(id: string): GlyphFamily {
  const s = id.toLowerCase();
  if (/28de/.test(s) && /(1205|deck)/.test(s)) return 'deck';
  if (/steam deck/.test(s)) return 'deck';
  // before Sony: "Xbox Wireless Controller" also contains Sony's "Wireless Controller"
  if (/045e|xbox|xinput/.test(s)) return 'xbox';
  if (/054c|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'playstation';
  if (/057e|pro controller|joy-con|nintendo/.test(s)) return 'switch';
  if (/28de|steam/.test(s)) return 'xbox';
  return 'neutral';
}

/** The family the glyphs use: the setting, or the pad's own family on 'auto'. */
export function glyphFamily(setting: GlyphSetting, padId: string | null): GlyphFamily {
  if (setting !== 'auto') return setting;
  return padId ? familyFromId(padId) : 'xbox';
}

/** The last device with a real input; reports when it changes. */
export class DeviceTracker {
  device: InputDevice = 'kbm';
  private travel = 0;
  private travelSince = Number.NEGATIVE_INFINITY;

  /** A key or mouse button: keyboard and mouse. */
  key(): boolean {
    this.travel = 0;
    return this.set('kbm');
  }

  /** A pad button or a stick outside its dead zone. */
  pad(): boolean {
    this.travel = 0;
    return this.set('pad');
  }

  /**
   * Pointer movement in CSS pixels; counts once the travel passes POINTER_SWITCH_PX within
   * POINTER_WINDOW_MS (slow jitter of a resting mouse never adds up to a switch).
   */
  pointer(distance: number, nowMs: number): boolean {
    if (this.device === 'kbm') return false;
    if (nowMs - this.travelSince > POINTER_WINDOW_MS) {
      this.travel = 0;
      this.travelSince = nowMs;
    }
    this.travel += Math.abs(distance);
    if (this.travel <= POINTER_SWITCH_PX) return false;
    this.travel = 0;
    return this.set('kbm');
  }

  private set(d: InputDevice): boolean {
    if (this.device === d) return false;
    this.device = d;
    return true;
  }
}
