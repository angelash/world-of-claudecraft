import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';
import { sceneFrameFor } from '../server/ai/scene_frame';
import { sceneSemanticsAt } from '../server/ai/scene_semantics';
import { lightSemanticFor, timeSemanticAt, timeWeatherMood, weatherSemanticAt } from '../server/ai/time_weather_model';

function pos(x: number, z: number, seed = 42) {
  return { x, z, y: groundHeight(x, z, seed) };
}

describe('AI scene semantics', () => {
  it('tags Eastbrook forge as safe town heat and work noise', () => {
    const scene = sceneSemanticsAt(pos(8, 17), 8 * 60);
    expect(scene.subsceneId).toBe('eastbrook_forge');
    expect(scene.structureTags).toContain('forge');
    expect(scene.environmentalTags).toEqual(expect.arrayContaining(['hotIron', 'sparks', 'workNoise']));
    expect(scene.locationTags).toContain('safeTown');
  });

  it('adds death pressure and low safe-haven score near the Fallen Chapel', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const frame = sceneFrameFor(sim, pos(80, 86, sim.cfg.seed));
    expect(frame.subsceneId).toBe('fallen_chapel');
    expect(frame.structureTags).toContain('cryptGate');
    expect(frame.environmentalTags).toContain('deathPressure');
    expect(frame.danger.undeadPressure).toBeGreaterThan(0);
    expect(frame.danger.safeHavenScore).toBeLessThan(0.5);
  });

  it('distinguishes clear starry nights from rain and fog mood pressure', () => {
    const night = timeSemanticAt(23 * 60);
    const clear = { kind: 'clear' as const, intensity: 0.2, tags: ['clearSky'] };
    const light = lightSemanticFor(night, clear);
    expect(light.tags).toContain('starrySky');
    expect(timeWeatherMood(night, clear, light).clearNightAwe).toBeGreaterThan(0);

    const rainy = { kind: 'rain' as const, intensity: 0.7, tags: ['rain'] };
    expect(timeWeatherMood(night, rainy, lightSemanticFor(night, rainy)).rainIrritation).toBeGreaterThan(0.5);

    const fog = weatherSemanticAt('mirefen_marsh', 5 * 60);
    if (fog.kind === 'fog') expect(fog.tags).toContain('lowVisibility');
  });
});
