import { describe, expect, it } from 'vitest';
import {
  aiContentCoverageReport, aiContentReviewChecklist, aiProfileAuthoringValidationReport, aiProfilePreviewReport,
} from '../server/ai/content_coverage';
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
    expect(report.scenes.semanticObjectsMissingFeatureTags).toEqual([]);
    expect(report.scenes.semanticObjectsMissingAffordanceTags).toEqual([]);
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

  it('summarizes authored profiles for admin authoring review', () => {
    const preview = aiProfilePreviewReport();
    const aldric = preview.rows.find((row) => row.id === 'npc.brother_aldric.living_world');

    expect(preview.authoredTotal).toBeGreaterThan(0);
    expect(preview.genericTotal).toBe(2);
    expect(preview.truncated).toBe(false);
    expect(preview.validation.totalIssues).toBe(0);
    expect(aldric).toMatchObject({
      fallbackLineId: 'hudChrome.aiSpeech.brotherAldricAwake',
      canonSensitive: true,
      hasTimeWeatherSensitivity: true,
      sceneAffinities: { likes: expect.any(Number), avoids: expect.any(Number), comments: expect.any(Number) },
      itemInterest: { attracted: expect.any(Number), avoids: expect.any(Number) },
      missingAuthoringFields: [],
    });
    expect(aldric?.appliesTo).toEqual(expect.arrayContaining([{ kind: 'npc', templateId: 'brother_aldric' }]));
    expect(aldric?.personaExcerpt.length ?? 0).toBeLessThanOrEqual(110);
  });

  it('bounds profile preview rows for admin payload safety', () => {
    const preview = aiProfilePreviewReport(1);

    expect(preview.limit).toBe(1);
    expect(preview.rows).toHaveLength(1);
    expect(preview.truncated).toBe(true);
  });

  it('keeps authored profile validation free of structural issues', () => {
    const validation = aiProfileAuthoringValidationReport();

    expect(validation.totalIssues).toBe(0);
    expect(validation.errorCount).toBe(0);
    expect(validation.warningCount).toBe(0);
    expect(validation.issues).toEqual([]);
  });

  it('turns the coverage report into a reusable content review checklist', () => {
    const checklist = aiContentReviewChecklist();

    expect(checklist.status).toBe('pass');
    expect(checklist.generatedFrom).toBe('aiContentCoverageReport');
    expect(checklist.validationCommands).toEqual(['npx vitest run tests/ai_content_coverage.test.ts']);
    expect(checklist.items.map((item) => item.id)).toEqual([
      'mob-family-semantics',
      'interactive-npc-profiles',
      'scene-semantic-anchors',
      'discardable-item-semantics',
      'ai-lineid-registration',
    ]);
    expect(checklist.items.every((item) => item.status === 'pass')).toBe(true);
    expect(checklist.items.every((item) => item.reviewPrompt.length > 40)).toBe(true);
  });

  it('points content reviewers at the exact coverage category with examples', () => {
    const base = aiContentCoverageReport();
    const checklist = aiContentReviewChecklist({
      ...base,
      scenes: {
        ...base.scenes,
        anchorsMissingTagDepth: ['new_zone_watchtower'],
      },
      items: {
        ...base.items,
        importantItemsMissingSignals: ['strange_relic'],
      },
    });

    expect(checklist.status).toBe('needs_attention');
    expect(checklist.items.find((item) => item.id === 'scene-semantic-anchors')).toMatchObject({
      status: 'needs_attention',
      issueCount: 1,
      examples: ['thinAnchorTags:new_zone_watchtower'],
    });
    expect(checklist.items.find((item) => item.id === 'discardable-item-semantics')).toMatchObject({
      status: 'needs_attention',
      issueCount: 1,
      examples: ['thinImportantSignals:strange_relic'],
    });
  });
});
