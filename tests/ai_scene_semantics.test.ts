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

  it('adds static building and environment anchors as semantic scene objects', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const frame = sceneFrameFor(sim, pos(8, 17, sim.cfg.seed));
    expect(frame.nearbySemanticObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'sceneAnchor',
        objectId: 'eastbrook_forge_hearth',
        entityId: null,
        tags: expect.arrayContaining(['forge', 'hotIron', 'sparks']),
        featureTags: expect.arrayContaining(['orangeCoals', 'hammerMarks']),
        affordanceTags: expect.arrayContaining(['warmHands', 'repairGear']),
      }),
      expect.objectContaining({
        source: 'sceneAnchor',
        objectId: 'eastbrook_smithy_house',
        tags: expect.arrayContaining(['house', 'warmLight', 'livedIn']),
        featureTags: expect.arrayContaining(['litWindows', 'smokeCurl']),
        affordanceTags: expect.arrayContaining(['seekShelter', 'askForHelp']),
      }),
    ]));
  });

  it('extends Eastbrook town semantics down to the apothecary corner', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const frame = sceneFrameFor(sim, pos(11, -3, sim.cfg.seed));

    expect(frame.subsceneId).toBe('eastbrook_forge');
    expect(frame.locationTags).toContain('safeTown');
    expect(frame.nearbySemanticObjects).toContainEqual(expect.objectContaining({
      source: 'sceneAnchor',
      objectId: 'eastbrook_apothecary_bench',
      tags: expect.arrayContaining(['alchemy', 'herb', 'quiet']),
      featureTags: expect.arrayContaining(['dryingBundles', 'glassVials']),
      affordanceTags: expect.arrayContaining(['sniffHerbs', 'askRemedy']),
    }));
  });

  it('extends Eastbrook town semantics to the priest shrine corner', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const frame = sceneFrameFor(sim, pos(-14, -10, sim.cfg.seed));

    expect(frame.subsceneId).toBe('eastbrook_forge');
    expect(frame.nearbySemanticObjects).toContainEqual(expect.objectContaining({
      source: 'sceneAnchor',
      objectId: 'eastbrook_wayside_shrine',
      tags: expect.arrayContaining(['shrine', 'prayerMemory', 'quiet']),
      featureTags: expect.arrayContaining(['waxDrips', 'prayerRibbons']),
      affordanceTags: expect.arrayContaining(['offerPrayer', 'lowerVoice']),
    }));
  });

  it('adds feature and affordance semantics for real object entities', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const object = [...sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil');
    expect(object).toBeTruthy();
    object!.pos = pos(80, 86, sim.cfg.seed);
    object!.prevPos = { ...object!.pos };
    sim.grid.update(object!);
    const frame = sceneFrameFor(sim, pos(80, 86, sim.cfg.seed));

    expect(frame.nearbySemanticObjects).toContainEqual(expect.objectContaining({
      source: 'entity',
      objectId: 'gravecaller_sigil',
      tags: expect.arrayContaining(['quest', 'grave']),
      featureTags: expect.arrayContaining(['markedPaper', 'ritualMarkings', 'uneasyAura']),
      affordanceTags: expect.arrayContaining(['inspectObject', 'avoidObject', 'readObject']),
    }));
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

  it('adds nearby key NPCs to scene companions with authored semantic tags', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const frame = sceneFrameFor(sim, pos(4, 6, sim.cfg.seed));

    expect(frame.companions).toContainEqual(expect.objectContaining({
      templateId: 'marshal_redbrook',
      displayName: 'Marshal Redbrook',
      family: 'humanoid',
      tags: expect.arrayContaining(['npc', 'humanoid', 'questNpc', 'highStatus']),
    }));
  });

  it('marks nearby injured NPCs as companions without including excluded speakers', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const apothecary = [...sim.entities.values()].find((entity) => entity.templateId === 'apothecary_lin');
    expect(apothecary).toBeTruthy();
    apothecary!.questIds = [];
    apothecary!.vendorItems = [];
    apothecary!.hp = Math.floor(apothecary!.maxHp * 0.4);

    const included = sceneFrameFor(sim, pos(11, -3, sim.cfg.seed));
    expect(included.companions).toContainEqual(expect.objectContaining({
      templateId: 'apothecary_lin',
      family: 'humanoid',
      tags: expect.arrayContaining(['npc', 'humanoid', 'injured']),
    }));

    const excluded = sceneFrameFor(sim, pos(11, -3, sim.cfg.seed), { excludeEntityIds: [apothecary!.id] });
    expect(excluded.companions.some((companion) => companion.entityId === apothecary!.id)).toBe(false);
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
