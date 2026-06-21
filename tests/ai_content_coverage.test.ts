import { describe, expect, it } from 'vitest';
import { aiContentCoverageReport } from '../server/ai/content_coverage';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';

describe('AI content coverage report', () => {
  it('keeps every mob family covered by semantics and at least one live template', () => {
    const report = aiContentCoverageReport();
    expect(report.families.missingSemantics).toEqual([]);
    expect(report.families.semanticsWithoutContent).toEqual([]);
    expect(report.families.familiesMissingDepth).toEqual([]);
    expect(report.families.familiesWithInvalidMoodBias).toEqual([]);
    for (const family of report.families.expected) {
      expect(report.families.templateCountByFamily[family], family).toBeGreaterThan(0);
    }
  });

  it('keeps authored NPC profiles deep enough for scene, item, time, and memory reactions', () => {
    const report = aiContentCoverageReport();
    expect(report.npcs.interactiveTotal).toBeGreaterThan(0);
    expect(report.npcs.authoredProfileTotal).toBeGreaterThan(0);
    expect(report.npcs.missingInteractiveProfiles).toEqual([]);
    expect(report.npcs.authoredNpcProfilesMissingSceneAffinities).toEqual([]);
    expect(report.npcs.authoredNpcProfilesMissingItemInterest).toEqual([]);
    expect(report.npcs.authoredNpcProfilesMissingTimeWeatherSensitivity).toEqual([]);
    expect(report.npcs.authoredNpcProfilesWithThinMemory).toEqual([]);
  });

  it('keeps scene anchors and semantic objects detailed enough for scene awareness', () => {
    const report = aiContentCoverageReport();
    expect(report.scenes.anchorTotal).toBeGreaterThanOrEqual(7);
    expect(report.scenes.semanticObjectTotal).toBeGreaterThanOrEqual(report.scenes.anchorTotal);
    expect(report.scenes.anchorsMissingSemanticObjects).toEqual([]);
    expect(report.scenes.anchorsMissingTags).toEqual([]);
    expect(report.scenes.anchorsMissingTagDepth).toEqual([]);
    expect(report.scenes.semanticObjectsMissingTags).toEqual([]);
    expect(report.scenes.semanticObjectsMissingTagDepth).toEqual([]);
    expect(report.scenes.semanticObjectsMissingAnchorOverlap).toEqual([]);
  });

  it('keeps dropped and important item semantics expressive enough for local reactions', () => {
    const report = aiContentCoverageReport();
    expect(report.items.requiredTotal).toBeGreaterThanOrEqual(6);
    expect(report.items.discardableTotal).toBeGreaterThan(report.items.requiredTotal);
    expect(report.items.missingRequiredItems).toEqual([]);
    expect(report.items.requiredItemsMissingSignals).toEqual([]);
    expect(report.items.discardableItemsMissingSignals).toEqual([]);
    expect(report.items.importantItemsMissingSignals).toEqual([]);
  });

  it('keeps authored AI lineIds registered in the HUD chrome catalog', () => {
    const report = aiContentCoverageReport();
    const aiSpeechKeys = new Set(Object.keys(hudChromeStrings.aiSpeech));
    const unknown = report.lineIds.referenced.filter((lineId) => {
      const prefix = 'hudChrome.aiSpeech.';
      return !lineId.startsWith(prefix) || !aiSpeechKeys.has(lineId.slice(prefix.length));
    });

    expect(report.lineIds.referenced.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });
});
