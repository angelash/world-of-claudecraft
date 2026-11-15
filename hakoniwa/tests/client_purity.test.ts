// Guards the client's pure cores: modules that hold the client's rules (camera, sprite
// generation, ground art, lighting, weather, roofs, scene, input rules, formatting,
// window availability, save slots) must not touch the DOM or real randomness, so they
// stay Node-testable and deterministic. DOM work lives in the thin painters and windows.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT = join(__dirname, '..', 'src', 'client');

export const CLIENT_PURE_CORES = [
  'adapters/combat.ts',
  'adapters/domain.ts',
  'adapters/log.ts',
  'adapters/social.ts',
  'app/adapters_wiring.ts',
  'app/clock.ts',
  'app/config.ts',
  'app/sandbox.ts',
  'hud/dialogue_queue.ts',
  'hud/format.ts',
  'hud/log_format.ts',
  'hud/minimap_model.ts',
  'hud/save_slots.ts',
  'hud/scene_model.ts',
  'input/keymap.ts',
  'input/picking.ts',
  'render/anim_state.ts',
  'render/bubbles.ts',
  'render/camera.ts',
  'render/floating_text.ts',
  'render/interp.ts',
  'render/lighting.ts',
  'render/map_context.ts',
  'render/markers.ts',
  'render/roofs.ts',
  'render/scene.ts',
  'render/tile_art.ts',
  'render/weather_fx.ts',
  'sprites/anim_spec.ts',
  'sprites/creatures.ts',
  'sprites/generate.ts',
  'sprites/humanoid.ts',
  'sprites/look.ts',
  'sprites/palette.ts',
  'sprites/pixels.ts',
  'sprites/shape.ts',
  'view/adapters.ts',
  'view/game_view.ts',
  'windows/battle_model.ts',
  'windows/inventory_view.ts',
  'windows/strategy_model.ts',
  'windows/window_registry.ts',
];

const DOM =
  /\b(document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|localStorage|requestAnimationFrame|performance\.now)\b/;
const RANDOM = /\b(Math\.random|Date\.now|new Date\()/;

function code(file: string): string {
  return readFileSync(join(CLIENT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('client pure cores', () => {
  for (const file of CLIENT_PURE_CORES) {
    it(`${file} has no DOM access and no real randomness or clock`, () => {
      const src = code(file);
      expect(DOM.test(src), `${file} touches the DOM`).toBe(false);
      expect(RANDOM.test(src), `${file} uses real randomness or time`).toBe(false);
    });
  }

  it('pure cores import no DOM-side client module', () => {
    const domModules = [
      'sprite_cache',
      'canvas_renderer',
      'canvas_util',
      'overlay_painter',
      'input_controller',
      'window_manager',
      'session',
      'shared_ui/dom',
    ];
    for (const file of CLIENT_PURE_CORES) {
      const imports = [...code(file).matchAll(/from '([^']+)'/g)].map((m) => m[1] as string);
      for (const imp of imports) {
        expect(
          domModules.some((d) => imp.endsWith(d)),
          `${file} imports ${imp}`,
        ).toBe(false);
      }
    }
  });
});
