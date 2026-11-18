// Guards the client's pure cores: modules that hold the client's rules (HD-2D view math,
// style packs, scene layout, procedural textures, light map, the far sky, ground marks, camera,
// sprite generation, the asset resolver, ground and decor art, lighting, weather, roofs, scene,
// combat marks and the fairness list, stage directives, switch and sediment fades, frame scheduling,
// input rules, formatting, window availability, save slots) must not touch the DOM, three.js
// or real randomness, so they stay Node-testable and deterministic. DOM and GPU work lives in
// the thin painters, the renderers, the windows and the asset loader.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT = join(__dirname, '..', 'src', 'client');

export const CLIENT_PURE_CORES = [
  'adapters/combat.ts',
  'adapters/corridor.ts',
  'adapters/domain.ts',
  'adapters/log.ts',
  'adapters/social.ts',
  'app/adapters_wiring.ts',
  'app/clock.ts',
  'app/config.ts',
  'app/newgame_model.ts',
  'app/sandbox.ts',
  'assets/doll_compose.ts',
  'assets/frames.ts',
  'assets/resolver.ts',
  'assets/runtime.ts',
  'assets/sprite_source.ts',
  'assets/types.ts',
  'audio/ambience_mixer.ts',
  'audio/audio_director.ts',
  'audio/audio_engine.ts',
  'audio/audio_manifest.ts',
  'audio/audio_settings.ts',
  'audio/audio_world.ts',
  'audio/bus_model.ts',
  'audio/captions.ts',
  'audio/cue_map.ts',
  'audio/hit_select.ts',
  'audio/music_player.ts',
  'audio/rumble.ts',
  'audio/sound_player.ts',
  'audio/spatializer.ts',
  'hd2d/daylight.ts',
  'hd2d/geometry.ts',
  'hd2d/ground_marks.ts',
  'hd2d/ground.ts',
  'hd2d/layout.ts',
  'hd2d/lightmap.ts',
  'hd2d/quality.ts',
  'hd2d/sky.ts',
  'hd2d/standee.ts',
  'hd2d/style_packs.ts',
  'hd2d/textures.ts',
  'hd2d/view.ts',
  'hud/confirm_model.ts',
  'hud/dialogue_queue.ts',
  'hud/exit_choice_model.ts',
  'hud/focus_model.ts',
  'hud/format.ts',
  'hud/gauges_model.ts',
  'hud/hint_model.ts',
  'hud/hotbar_model.ts',
  'hud/log_format.ts',
  'hud/minimap_model.ts',
  'hud/notify_model.ts',
  'hud/party_model.ts',
  'hud/save_list_model.ts',
  'hud/save_slots.ts',
  'hud/scene_model.ts',
  'hud/slot_extras.ts',
  'hud/creator/creator_look.ts',
  'hud/creator/creator_model.ts',
  'hud/story/ai_flags.ts',
  'hud/story/backlog.ts',
  'hud/story/constants.ts',
  'hud/story/cutscene_model.ts',
  'hud/story/dialogue_model.ts',
  'hud/story/handlers.ts',
  'hud/story/letter_card.ts',
  'hud/story/portrait_plan.ts',
  'hud/story/prologue_stage.ts',
  'hud/story/reading.ts',
  'hud/story/stage.ts',
  'hud/story/story_controller.ts',
  'hud/tracker_model.ts',
  'input/actions.ts',
  'input/contexts.ts',
  'input/device.ts',
  'input/focus_nav.ts',
  'input/gamepad.ts',
  'input/glyphs.ts',
  'input/input_hub.ts',
  'input/input_settings.ts',
  'input/keymap.ts',
  'input/osk.ts',
  'input/pad_bindings.ts',
  'input/picking.ts',
  'input/radial.ts',
  'input/soft_target.ts',
  'input/virtual_cursor.ts',
  'render/anim_state.ts',
  'render/bubbles.ts',
  'render/camera.ts',
  'render/combat_marks.ts',
  'render/decor_art.ts',
  'render/fairness.ts',
  'render/floating_text.ts',
  'render/frame_scheduler.ts',
  'render/frame_signals.ts',
  'render/interp.ts',
  'render/lighting.ts',
  'render/map_context.ts',
  'render/markers.ts',
  'render/roofs.ts',
  'render/scene.ts',
  'render/sediment_fade.ts',
  'render/stage_direct.ts',
  'render/switch_fade.ts',
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
  'windows/brain_inspector.ts',
  'windows/corridor/corridor_model.ts',
  'windows/help_model.ts',
  'windows/inventory_view.ts',
  'windows/quest_log_model.ts',
  'windows/settings/audio_model.ts',
  'windows/settings/controls_model.ts',
  'windows/settings/gameplay_model.ts',
  'windows/settings/shell_model.ts',
  'windows/strategy_model.ts',
  'windows/window_registry.ts',
];

const DOM =
  /\b(document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|localStorage|requestAnimationFrame|performance\.now)\b/;
const RANDOM = /\b(Math\.random|Date\.now|new Date\()/;
const THREE_IMPORT = /from 'three/;

function code(file: string): string {
  return readFileSync(join(CLIENT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The code a DOM access could hide in: quoted strings (the input context named 'window')
 * and object keys or members that merely share a global's name (`window: {...}`,
 * `x.window`) are no access to the page.
 */
function domCode(src: string): string {
  return src
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''")
    .replace(/(?<!\b(?:globalThis|self|window))\.\s*(document|window)\b/g, '.prop')
    .replace(/(^|[{,]\s*)(document|window)(\s*\??:)/gm, '$1prop$3');
}

describe('client pure cores', () => {
  for (const file of CLIENT_PURE_CORES) {
    it(`${file} has no DOM access and no real randomness or clock`, () => {
      const src = code(file);
      expect(DOM.test(domCode(src)), `${file} touches the DOM`).toBe(false);
      expect(RANDOM.test(src), `${file} uses real randomness or time`).toBe(false);
      expect(THREE_IMPORT.test(src), `${file} imports three.js`).toBe(false);
    });
  }

  it('pure cores import no DOM-side client module', () => {
    const domModules = [
      'sprite_cache',
      'flat_renderer',
      'canvas_util',
      'hd2d_renderer',
      'scene_builder',
      'materials',
      'entities',
      'post',
      'weather_overlay',
      'hd2d/index',
      'hd2d',
      'overlay_painter',
      'input_controller',
      'window_manager',
      'session',
      'shared_ui/dom',
      '/loader',
      'assets/index',
      'assets',
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
