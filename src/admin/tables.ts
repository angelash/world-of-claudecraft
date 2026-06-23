import { escapeHtml, fmtCopper, fmtDate, fmtDuration, fmtNumber, fmtPercent, fmtRelative } from './format';
import { classLabel, zoneLabel, t } from './i18n';
import type {
  AccountDetail, AccountRow, CharacterRow, ChatFilterData, ChatModeratedAccount,
  ChatModerationDetail, FilterWord, LivePlayer, ModerationAccountDetail, ModerationQueueRow,
  AiActivePollRule, AiActiveTriggerAdminSnapshot, AiActiveTriggerDecisionSnapshot,
  AiActiveRuntimeSnapshot, AiActiveTriggerMetricsSnapshot,
  AiActiveQueuedEventSnapshot, AiActiveSequenceSnapshot, AiAuditEventSummary, AiAuditPlayerAction, AiAuditRecord, AiAuditSnapshot,
  AiContentCoverageReport, AiContentReviewChecklist, AiContentReviewChecklistItem, AiDecisionJournalEntry, AiLifeLayerDiagnosticsSnapshot, AiNpcMemory, AiRumorMemory,
  AiLifeLayerMetricsSnapshot, AiProfileAuthoringIssue, AiProfileAuthoringValidationReport,
  AiProfilePreviewReport, AiProfilePreviewRow, AiProviderTimingSnapshot,
  AiProfilePreviewTarget, AiWorldDirectorProposalAuditEntry, AiWorldDirectorState,
  ProviderUsageCache, ProviderUsageSnapshot,
} from './types';

export type AiLifeLayerTab = 'audit' | 'active' | 'usage' | 'coverage' | 'profiles' | 'diagnostics' | 'details';

// Pure HTML-string renderers for the dashboard tables. All dynamic values go
// through escapeHtml — usernames and character names are player-controlled.

export function renderOnlineTable(players: LivePlayer[]): string {
  if (players.length === 0) return `<div class="empty">${t('online.empty')}</div>`;
  const rows = players.map((p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(classLabel(p.class))}</td>
      <td class="num">${p.level}</td>
      <td>${escapeHtml(zoneLabel(p.zone))}</td>
      <td class="num">${Math.round(p.x)}, ${Math.round(p.z)}</td>
      <td class="num">${p.hp}/${p.maxHp}</td>
      <td class="num">${fmtDuration(p.sessionSeconds)}</td>
      <td class="num">${fmtDuration(p.lastSaveSecondsAgo)} ${t('common.ago')}</td>
      <td class="num">${p.accountId}</td>
    </tr>`);
  return `<table>
    <thead><tr>
      <th>${t('online.colCharacter')}</th><th>${t('online.colClass')}</th><th class="num">${t('online.colLevel')}</th><th>${t('online.colZone')}</th>
      <th class="num">${t('online.colPos')}</th><th class="num">${t('online.colHp')}</th><th class="num">${t('online.colSession')}</th>
      <th class="num">${t('online.colLastSave')}</th><th class="num">${t('online.colAcct')}</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function renderMetricCount(value: number): string {
  return escapeHtml(fmtNumber(value));
}

function renderCacheEntries(cache: ProviderUsageCache): string {
  if (cache.maxEntries === null) return escapeHtml(fmtNumber(cache.entries));
  return escapeHtml(t('usage.cacheEntriesOfMax', {
    entries: fmtNumber(cache.entries),
    max: fmtNumber(cache.maxEntries),
  }));
}

function renderCacheHitRate(cache: ProviderUsageCache): string {
  const totalReads = cache.hits + cache.misses;
  if (totalReads <= 0) return escapeHtml(t('usage.notAvailable'));
  return escapeHtml(fmtPercent(cache.hits / totalReads));
}

function renderAiNumber(value: number): string {
  return escapeHtml(fmtNumber(value));
}

function renderAiLatency(value: number): string {
  return escapeHtml(t('usage.aiMilliseconds', { value: fmtNumber(value) }));
}

function renderAiChars(value: number): string {
  return escapeHtml(t('usage.aiCharacters', { value: fmtNumber(value) }));
}

function renderAiTimingShare(value: number, total: number): string {
  if (total <= 0) return escapeHtml(t('usage.notAvailable'));
  return escapeHtml(fmtPercent(value / total));
}

function aiProviderTimingProviderLabel(provider: string): string {
  switch (provider) {
    case 'codex-exec': return t('usage.aiProviderTimingProviderExec');
    case 'codex-app-server': return t('usage.aiProviderTimingProviderAppServer');
    default: return provider ? t('usage.aiProviderTimingProviderUnknown', { provider }) : t('usage.aiDiagnosticsNone');
  }
}

function aiProviderTimingStepLabel(key: string): string {
  switch (key) {
    case 'tempDirMs': return t('usage.aiProviderTimingStepTempDir');
    case 'buildPromptMs': return t('usage.aiProviderTimingStepBuildPrompt');
    case 'writeFilesMs': return t('usage.aiProviderTimingStepWriteFiles');
    case 'codexExecMs': return t('usage.aiProviderTimingStepCodexExec');
    case 'readOutputMs': return t('usage.aiProviderTimingStepReadOutput');
    case 'parseOutputMs': return t('usage.aiProviderTimingStepParseOutput');
    case 'startupWaitMs': return t('usage.aiProviderTimingStepStartupWait');
    case 'queueWaitMs': return t('usage.aiProviderTimingStepQueueWait');
    case 'turnStartAckMs': return t('usage.aiProviderTimingStepTurnStartAck');
    case 'turnCompleteMs': return t('usage.aiProviderTimingStepTurnComplete');
    case 'firstDeltaMs': return t('usage.aiProviderTimingStepFirstDelta');
    case 'firstAgentMessageMs': return t('usage.aiProviderTimingStepFirstAgentMessage');
    case 'rollbackMs': return t('usage.aiProviderTimingStepRollback');
    case 'threadResetMs': return t('usage.aiProviderTimingStepThreadReset');
    default: return t('usage.aiProviderTimingStepUnknown', { key });
  }
}

function renderAiProviderTimingSummary(timings: AiProviderTimingSnapshot | undefined): string {
  if (!timings) return `<span class="hint">${escapeHtml(t('usage.aiProviderTimingNone'))}</span>`;
  const slowest = [...timings.steps].sort((a, b) => b.ms - a.ms)[0];
  const slowestLine = slowest
    ? `<div class="hint">${escapeHtml(t('usage.aiProviderTimingSlowest', {
      step: aiProviderTimingStepLabel(slowest.key),
      duration: t('usage.aiMilliseconds', { value: fmtNumber(slowest.ms) }),
    }))}</div>`
    : '';
  return `${escapeHtml(aiProviderTimingProviderLabel(timings.provider))} / ${renderAiLatency(timings.totalMs)}${slowestLine}`;
}

function renderAiProviderTimingTable(timings: AiProviderTimingSnapshot | undefined): string {
  if (!timings) return `<div class="empty">${t('usage.aiProviderTimingNone')}</div>`;
  const rows = timings.steps.length === 0
    ? `<tr><td colspan="3" class="empty">${t('usage.aiProviderTimingNone')}</td></tr>`
    : timings.steps.map((step) => `
      <tr>
        <td>${escapeHtml(aiProviderTimingStepLabel(step.key))}<div class="hint">${escapeHtml(step.key)}</div></td>
        <td class="num">${renderAiLatency(step.ms)}</td>
        <td class="num">${renderAiTimingShare(step.ms, timings.totalMs)}</td>
      </tr>`).join('');
  return `
    <div class="ai-audit-status-line">
      <span class="badge">${escapeHtml(aiProviderTimingProviderLabel(timings.provider))}</span>
      <span>${escapeHtml(t('usage.aiProviderTimingTotal'))}: ${renderAiLatency(timings.totalMs)}</span>
    </div>
    <div class="table-scroll">
      <table class="usage-table">
        <thead><tr>
          <th>${t('usage.aiProviderTimingStep')}</th>
          <th class="num">${t('usage.aiProviderTimingDuration')}</th>
          <th class="num">${t('usage.aiProviderTimingShare')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderAiOptionalText(value: string | undefined): string {
  if (!value) return `<span class="hint">${escapeHtml(t('usage.aiNoRecentError'))}</span>`;
  return escapeHtml(value);
}

function renderAiAuditOptionalText(value: string): string {
  if (!value) return `<span class="hint">${escapeHtml(t('usage.aiNoReason'))}</span>`;
  return escapeHtml(value);
}

function aiMetricRow(labelKey: string, value: string): string {
  return `<tr><td>${t(labelKey)}</td><td class="num">${value}</td></tr>`;
}

function normalizeAiTab(tab: string | undefined): AiLifeLayerTab {
  switch (tab) {
    case 'audit':
    case 'active':
    case 'usage':
    case 'coverage':
    case 'profiles':
    case 'diagnostics':
    case 'details':
      return tab;
    default:
      return 'audit';
  }
}

function renderAiTabButton(tab: AiLifeLayerTab, labelKey: string, activeTab: AiLifeLayerTab): string {
  const selected = tab === activeTab;
  return `<button type="button" class="ai-tab${selected ? ' active' : ''}" role="tab" data-ai-tab="${tab}" aria-selected="${selected ? 'true' : 'false'}" aria-controls="ai-tab-${tab}" tabindex="${selected ? '0' : '-1'}">${escapeHtml(t(labelKey))}</button>`;
}

function renderAiTabPanel(tab: AiLifeLayerTab, activeTab: AiLifeLayerTab, body: string): string {
  const selected = tab === activeTab;
  return `<section id="ai-tab-${tab}" class="ai-tab-panel${selected ? ' active' : ''}" role="tabpanel" data-ai-tab-panel="${tab}"${selected ? '' : ' hidden'}>${body}</section>`;
}

function coverageIssueCount(coverage: AiContentCoverageReport): number {
  return [
    coverage.families.missingSemantics,
    coverage.families.semanticsWithoutContent,
    coverage.families.familiesMissingDepth,
    coverage.families.familiesWithInvalidMoodBias,
    coverage.npcs.missingInteractiveProfiles,
    coverage.npcs.authoredNpcProfilesMissingSceneAffinities,
    coverage.npcs.authoredNpcProfilesMissingItemInterest,
    coverage.npcs.authoredNpcProfilesMissingTimeWeatherSensitivity,
    coverage.npcs.authoredNpcProfilesWithThinMemory,
    coverage.scenes.anchorsMissingSemanticObjects,
    coverage.scenes.anchorsMissingTags,
    coverage.scenes.anchorsMissingTagDepth,
    coverage.scenes.semanticObjectsMissingTags,
    coverage.scenes.semanticObjectsMissingTagDepth,
    coverage.scenes.semanticObjectsMissingFeatureTags,
    coverage.scenes.semanticObjectsMissingAffordanceTags,
    coverage.scenes.semanticObjectsMissingAnchorOverlap,
    coverage.items.missingRequiredItems,
    coverage.items.requiredItemsMissingSignals,
    coverage.items.discardableItemsMissingSignals,
    coverage.items.importantItemsMissingSignals,
  ].reduce((sum, items) => sum + items.length, 0);
}

function renderCoverageItems(items: readonly string[]): string {
  if (items.length === 0) return `<span class="hint">${escapeHtml(t('usage.aiCoverageAllClear'))}</span>`;
  const visible = items.slice(0, 8).map((item) => escapeHtml(item)).join(', ');
  const remaining = items.length - 8;
  return remaining > 0
    ? `${visible} <span class="hint">${escapeHtml(t('usage.aiCoverageMore', { count: fmtNumber(remaining) }))}</span>`
    : visible;
}

function coverageRow(labelKey: string, items: readonly string[]): string {
  const statusClass = items.length > 0 ? ' warn' : '';
  return `<tr>
    <td>${t(labelKey)}</td>
    <td class="num"><span class="badge${statusClass}">${escapeHtml(fmtNumber(items.length))}</span></td>
    <td>${renderCoverageItems(items)}</td>
  </tr>`;
}

function aiCoverageChecklistStatusLabel(status: AiContentReviewChecklistItem['status']): string {
  switch (status) {
    case 'pass': return t('usage.aiCoverageChecklistStatusPass');
    case 'needs_attention': return t('usage.aiCoverageChecklistStatusNeedsAttention');
  }
}

function aiCoverageChecklistLabel(id: AiContentReviewChecklistItem['id']): string {
  switch (id) {
    case 'mob-family-semantics': return t('usage.aiCoverageChecklistLabel.mobFamilySemantics');
    case 'interactive-npc-profiles': return t('usage.aiCoverageChecklistLabel.interactiveNpcProfiles');
    case 'scene-semantic-anchors': return t('usage.aiCoverageChecklistLabel.sceneSemanticAnchors');
    case 'discardable-item-semantics': return t('usage.aiCoverageChecklistLabel.discardableItemSemantics');
    case 'ai-lineid-registration': return t('usage.aiCoverageChecklistLabel.aiLineIdRegistration');
    default: return escapeHtml(id);
  }
}

function aiCoverageChecklistReviewPrompt(id: AiContentReviewChecklistItem['id']): string {
  switch (id) {
    case 'mob-family-semantics': return t('usage.aiCoverageChecklistReview.mobFamilySemantics');
    case 'interactive-npc-profiles': return t('usage.aiCoverageChecklistReview.interactiveNpcProfiles');
    case 'scene-semantic-anchors': return t('usage.aiCoverageChecklistReview.sceneSemanticAnchors');
    case 'discardable-item-semantics': return t('usage.aiCoverageChecklistReview.discardableItemSemantics');
    case 'ai-lineid-registration': return t('usage.aiCoverageChecklistReview.aiLineIdRegistration');
    default: return escapeHtml(id);
  }
}

function renderAiCoverageChecklist(checklist?: AiContentReviewChecklist): string {
  if (!checklist || checklist.items.length === 0) return '';
  const rows = checklist.items.map((item) => `
    <tr>
      <td>${escapeHtml(aiCoverageChecklistLabel(item.id))}</td>
      <td class="num"><span class="badge${item.status === 'needs_attention' ? ' warn' : ''}">${escapeHtml(aiCoverageChecklistStatusLabel(item.status))}</span></td>
      <td class="num">${renderAiNumber(item.issueCount)}</td>
      <td>${renderCoverageItems(item.examples)}</td>
      <td>${escapeHtml(aiCoverageChecklistReviewPrompt(item.id))}</td>
      <td><code>${escapeHtml(item.validationCommand)}</code></td>
    </tr>`).join('');
  return `
    <div class="usage-section">
      <h4>${t('usage.aiCoverageChecklistTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiCoverageChecklistColArea')}</th>
            <th class="num">${t('usage.aiCoverageChecklistColStatus')}</th>
            <th class="num">${t('usage.aiCoverageColGaps')}</th>
            <th>${t('usage.aiCoverageColExamples')}</th>
            <th>${t('usage.aiCoverageChecklistColReview')}</th>
            <th>${t('usage.aiCoverageChecklistColValidation')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAiDelimitedItems(items: readonly string[], limit = 4): string {
  if (items.length === 0) return `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`;
  const visible = items.slice(0, limit).map((item) => escapeHtml(item)).join(', ');
  const remaining = items.length - limit;
  return remaining > 0
    ? `${visible} <span class="hint">${escapeHtml(t('usage.aiDiagnosticsMore', { count: fmtNumber(remaining) }))}</span>`
    : visible;
}

function aiProfileTargetKindLabel(kind: string): string {
  switch (kind) {
    case 'npc': return t('usage.aiProfileKindNpc');
    case 'mob': return t('usage.aiProfileKindMob');
    case 'object': return t('usage.aiProfileKindObject');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: kind });
  }
}

function aiEntityKindLabel(kind: string): string {
  switch (kind) {
    case 'npc': return t('usage.aiProfileKindNpc');
    case 'mob': return t('usage.aiProfileKindMob');
    case 'object': return t('usage.aiProfileKindObject');
    case 'system': return t('usage.aiEntityKindSystem');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: kind });
  }
}

const AI_PROFILE_NAME_KEYS: Record<string, string> = {
  'npc.brother_aldric.living_world': 'usage.aiProfileName.npcBrotherAldric',
  'npc.the_merchant.living_world': 'usage.aiProfileName.npcTheMerchant',
  'npc.marshal_redbrook.living_world': 'usage.aiProfileName.npcMarshalRedbrook',
  'npc.trader_wilkes.living_world': 'usage.aiProfileName.npcTraderWilkes',
  'npc.apothecary_lin.living_world': 'usage.aiProfileName.npcApothecaryLin',
  'npc.fisherman_brandt.living_world': 'usage.aiProfileName.npcFishermanBrandt',
  'npc.foreman_odell.living_world': 'usage.aiProfileName.npcForemanOdell',
  'npc.ranger_elwyn.living_world': 'usage.aiProfileName.npcRangerElwyn',
  'npc.warden_fenwick.living_world': 'usage.aiProfileName.npcWardenFenwick',
  'npc.provisioner_hale.living_world': 'usage.aiProfileName.npcProvisionerHale',
  'npc.herbalist_yara.living_world': 'usage.aiProfileName.npcHerbalistYara',
  'npc.captain_thessaly.living_world': 'usage.aiProfileName.npcCaptainThessaly',
  'npc.quartermaster_bree.living_world': 'usage.aiProfileName.npcQuartermasterBree',
  'npc.armorer_hode.living_world': 'usage.aiProfileName.npcArmorerHode',
  'npc.smith_haldren.living_world': 'usage.aiProfileName.npcSmithHaldren',
  'npc.scout_maren.living_world': 'usage.aiProfileName.npcScoutMaren',
  'npc.loremaster_caddis.living_world': 'usage.aiProfileName.npcLoremasterCaddis',
  'npc.tidewatcher_ondrel.living_world': 'usage.aiProfileName.npcTidewatcherOndrel',
};

const AI_PROFILE_PERSONA_KEYS: Record<string, string> = {
  'npc.brother_aldric.living_world': 'usage.aiProfilePersona.npcBrotherAldric',
  'npc.the_merchant.living_world': 'usage.aiProfilePersona.npcTheMerchant',
  'npc.marshal_redbrook.living_world': 'usage.aiProfilePersona.npcMarshalRedbrook',
  'npc.trader_wilkes.living_world': 'usage.aiProfilePersona.npcTraderWilkes',
  'npc.apothecary_lin.living_world': 'usage.aiProfilePersona.npcApothecaryLin',
  'npc.fisherman_brandt.living_world': 'usage.aiProfilePersona.npcFishermanBrandt',
  'npc.foreman_odell.living_world': 'usage.aiProfilePersona.npcForemanOdell',
  'npc.ranger_elwyn.living_world': 'usage.aiProfilePersona.npcRangerElwyn',
  'npc.warden_fenwick.living_world': 'usage.aiProfilePersona.npcWardenFenwick',
  'npc.provisioner_hale.living_world': 'usage.aiProfilePersona.npcProvisionerHale',
  'npc.herbalist_yara.living_world': 'usage.aiProfilePersona.npcHerbalistYara',
  'npc.captain_thessaly.living_world': 'usage.aiProfilePersona.npcCaptainThessaly',
  'npc.quartermaster_bree.living_world': 'usage.aiProfilePersona.npcQuartermasterBree',
  'npc.armorer_hode.living_world': 'usage.aiProfilePersona.npcArmorerHode',
  'npc.smith_haldren.living_world': 'usage.aiProfilePersona.npcSmithHaldren',
  'npc.scout_maren.living_world': 'usage.aiProfilePersona.npcScoutMaren',
  'npc.loremaster_caddis.living_world': 'usage.aiProfilePersona.npcLoremasterCaddis',
  'npc.tidewatcher_ondrel.living_world': 'usage.aiProfilePersona.npcTidewatcherOndrel',
};

const AI_PROFILE_TARGET_KEYS: Record<string, string> = {
  brother_aldric: 'usage.aiProfileTarget.brotherAldric',
  brother_aldric_fen: 'usage.aiProfileTarget.brotherAldricFen',
  brother_aldric_highwatch: 'usage.aiProfileTarget.brotherAldricHighwatch',
  the_merchant: 'usage.aiProfileTarget.theMerchant',
  marshal_redbrook: 'usage.aiProfileTarget.marshalRedbrook',
  trader_wilkes: 'usage.aiProfileTarget.traderWilkes',
  apothecary_lin: 'usage.aiProfileTarget.apothecaryLin',
  fisherman_brandt: 'usage.aiProfileTarget.fishermanBrandt',
  foreman_odell: 'usage.aiProfileTarget.foremanOdell',
  ranger_elwyn: 'usage.aiProfileTarget.rangerElwyn',
  warden_fenwick: 'usage.aiProfileTarget.wardenFenwick',
  provisioner_hale: 'usage.aiProfileTarget.provisionerHale',
  herbalist_yara: 'usage.aiProfileTarget.herbalistYara',
  captain_thessaly: 'usage.aiProfileTarget.captainThessaly',
  quartermaster_bree: 'usage.aiProfileTarget.quartermasterBree',
  armorer_hode: 'usage.aiProfileTarget.armorerHode',
  smith_haldren: 'usage.aiProfileTarget.smithHaldren',
  scout_maren: 'usage.aiProfileTarget.scoutMaren',
  scout_maren_highwatch: 'usage.aiProfileTarget.scoutMarenHighwatch',
  loremaster_caddis: 'usage.aiProfileTarget.loremasterCaddis',
  tidewatcher_ondrel: 'usage.aiProfileTarget.tidewatcherOndrel',
};

const AI_DISPLAY_NAME_TEMPLATE_IDS: Record<string, string> = {
  'brother aldric': 'brother_aldric',
  merchant: 'the_merchant',
  'the merchant': 'the_merchant',
  'marshal redbrook': 'marshal_redbrook',
  'trader wilkes': 'trader_wilkes',
  'apothecary lin': 'apothecary_lin',
  'fisherman brandt': 'fisherman_brandt',
  'foreman odell': 'foreman_odell',
  'ranger elwyn': 'ranger_elwyn',
  'warden fenwick': 'warden_fenwick',
  'provisioner hale': 'provisioner_hale',
  'herbalist yara': 'herbalist_yara',
  'captain thessaly': 'captain_thessaly',
  'quartermaster bree': 'quartermaster_bree',
  'armorer hode': 'armorer_hode',
  'smith haldren': 'smith_haldren',
  'scout maren': 'scout_maren',
  'loremaster caddis': 'loremaster_caddis',
  'tidewatcher ondrel': 'tidewatcher_ondrel',
};

const AI_SCENE_LABEL_KEYS: Record<string, string> = {
  eastbrook_vale: 'zone.eastbrook_vale',
  mirefen_marsh: 'zone.mirefen_marsh',
  thornpeak_heights: 'zone.thornpeak_heights',
  eastbrook_forge: 'usage.aiScene.eastbrookForge',
  fallen_chapel: 'usage.aiScene.fallenChapel',
  mirror_lake_dock: 'usage.aiScene.mirrorLakeDock',
  fenbridge_bridge: 'usage.aiScene.fenbridgeBridge',
  drowned_chapel_reeds: 'usage.aiScene.drownedChapelReeds',
  highwatch_tower: 'usage.aiScene.highwatchTower',
  abandoned_crypt_entrance: 'usage.aiScene.abandonedCryptEntrance',
  bandit_camp: 'usage.aiScene.banditCamp',
};

function stripTechnicalIdSuffix(label: string, id: string): string {
  return label
    .replace(new RegExp(`\\s*\\(${escapeRegExp(id)}\\)\\s*$`), '')
    .replace(new RegExp(`\\s*（${escapeRegExp(id)}）\\s*$`), '')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aiTemplateLabel(templateId: string): string {
  const key = AI_PROFILE_TARGET_KEYS[templateId];
  return key ? stripTechnicalIdSuffix(t(key), templateId) : templateId;
}

function aiSpeakerLabel(speakerName: string): string {
  const templateId = AI_DISPLAY_NAME_TEMPLATE_IDS[speakerName.trim().toLowerCase().replace(/\s+/g, ' ')];
  return templateId ? aiTemplateLabel(templateId) : speakerName;
}

function aiSceneLabel(sceneId: string): string {
  const key = AI_SCENE_LABEL_KEYS[sceneId];
  return key ? t(key) : sceneId;
}

function aiTopicLabel(topic: string): string {
  switch (topic) {
    case 'greeting': return t('usage.aiTopicGreeting');
    case 'recent': return t('usage.aiTopicRecent');
    case 'rumor': return t('usage.aiTopicRumor');
    case 'place': return t('usage.aiTopicPlace');
    case 'quest_hint': return t('usage.aiTopicQuestHint');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: topic });
  }
}

function aiProfileDisplayName(row: AiProfilePreviewRow): string {
  const key = AI_PROFILE_NAME_KEYS[row.id];
  return key ? t(key) : row.id;
}

function aiProfilePersona(row: AiProfilePreviewRow): string {
  const key = AI_PROFILE_PERSONA_KEYS[row.id];
  return key ? t(key) : row.personaExcerpt;
}

function aiProfileTargetTemplateLabel(target: AiProfilePreviewTarget): string {
  const key = target.kind === 'npc' ? AI_PROFILE_TARGET_KEYS[target.templateId] : undefined;
  return key ? t(key) : target.templateId;
}

function renderAiProfileTargets(targets: readonly AiProfilePreviewTarget[]): string {
  if (targets.length === 0) return `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`;
  const visible = targets.slice(0, 3).map((target) => escapeHtml(t('usage.aiProfileTargetSummary', {
    kind: aiProfileTargetKindLabel(target.kind),
    templateId: aiProfileTargetTemplateLabel(target),
  }))).join(', ');
  const remaining = targets.length - 3;
  return remaining > 0
    ? `${visible} <span class="hint">${escapeHtml(t('usage.aiDiagnosticsMore', { count: fmtNumber(remaining) }))}</span>`
    : visible;
}

function renderAiProfileGaps(row: AiProfilePreviewRow): string {
  if (row.missingAuthoringFields.length === 0) {
    return `<span class="hint">${escapeHtml(t('usage.aiProfileNoGaps'))}</span>`;
  }
  return renderAiDelimitedItems(row.missingAuthoringFields, 4);
}

function aiProfileIssueSeverityClass(severity: string): string {
  if (severity === 'error') return ' bad';
  if (severity === 'warning') return ' warn';
  return '';
}

function aiProfileIssueSeverityLabel(severity: string): string {
  switch (severity) {
    case 'error': return t('usage.aiProfileIssueError');
    case 'warning': return t('usage.aiProfileIssueWarning');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: severity });
  }
}

function aiProfileIssueDescription(issue: AiProfileAuthoringIssue): string {
  switch (issue.code) {
    case 'duplicateProfileId': return t('usage.aiProfileIssueDuplicateProfileId');
    case 'missingAuthoringField': return t('usage.aiProfileIssueMissingAuthoringField');
    case 'fallbackNotAllowed': return t('usage.aiProfileIssueFallbackNotAllowed');
    case 'invalidLineIdShape': return t('usage.aiProfileIssueInvalidLineIdShape');
    case 'duplicateProfileTarget': return t('usage.aiProfileIssueDuplicateProfileTarget');
    case 'unknownNpcTarget': return t('usage.aiProfileIssueUnknownNpcTarget');
    case 'unknownMobTarget': return t('usage.aiProfileIssueUnknownMobTarget');
    case 'missingInteractiveProfile': return t('usage.aiProfileIssueMissingInteractiveProfile');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: issue.code });
  }
}

function renderAiProfileIssueTarget(issue: AiProfileAuthoringIssue): string {
  if (!issue.targetKind || !issue.targetTemplateId) {
    return `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`;
  }
  return escapeHtml(t('usage.aiProfileTargetSummary', {
    kind: aiProfileTargetKindLabel(issue.targetKind),
    templateId: issue.targetTemplateId,
  }));
}

function renderAiProfileIssueRow(issue: AiProfileAuthoringIssue): string {
  return `<tr>
    <td><span class="badge${aiProfileIssueSeverityClass(issue.severity)}">${escapeHtml(aiProfileIssueSeverityLabel(issue.severity))}</span></td>
    <td>${escapeHtml(issue.code)}</td>
    <td>${escapeHtml(issue.profileId)}</td>
    <td>${renderAiProfileIssueTarget(issue)}</td>
    <td>${escapeHtml(aiProfileIssueDescription(issue))}</td>
  </tr>`;
}

function renderAiProfileValidation(validation: AiProfileAuthoringValidationReport): string {
  if (validation.totalIssues === 0) {
    return `<div class="hint">${escapeHtml(t('usage.aiProfileValidationNoIssues'))}</div>`;
  }
  const visibleIssues = validation.issues.slice(0, 8);
  const hiddenCount = Math.max(0, validation.totalIssues - visibleIssues.length);
  const hiddenHint = validation.truncated || hiddenCount > 0
    ? `<div class="hint">${escapeHtml(t('usage.aiProfileValidationMore', { count: fmtNumber(hiddenCount) }))}</div>`
    : '';
  return `
    ${hiddenHint}
    <div class="table-scroll">
      <table class="usage-table">
        <thead><tr>
          <th>${t('usage.aiProfileIssueColSeverity')}</th>
          <th>${t('usage.aiProfileIssueColCode')}</th>
          <th>${t('usage.aiProfileIssueColProfile')}</th>
          <th>${t('usage.aiProfileIssueColTarget')}</th>
          <th>${t('usage.aiProfileIssueColDetail')}</th>
        </tr></thead>
        <tbody>${visibleIssues.map(renderAiProfileIssueRow).join('')}</tbody>
      </table>
    </div>`;
}

function renderAiProfileRow(row: AiProfilePreviewRow): string {
  const canonLabel = row.canonSensitive
    ? t('usage.aiProfileCanonSensitive')
    : t('usage.aiProfileCanonFlexible');
  const canonClass = row.canonSensitive ? ' warn' : '';
  const sceneItemSummary = t('usage.aiProfileSceneItemSummary', {
    likes: fmtNumber(row.sceneAffinities.likes),
    avoids: fmtNumber(row.sceneAffinities.avoids),
    comments: fmtNumber(row.sceneAffinities.comments),
    attracted: fmtNumber(row.itemInterest.attracted),
    itemAvoids: fmtNumber(row.itemInterest.avoids),
  });
  const timeCompanionSummary = t('usage.aiProfileTimeCompanionSummary', {
    time: row.hasTimeWeatherSensitivity ? t('usage.aiProfileTimeReady') : t('usage.aiProfileTimeMissing'),
    companions: fmtNumber(row.companionReactionCount),
  });
  const knowledgeSummary = t('usage.aiProfileKnowledgeSummary', {
    knowledge: fmtNumber(row.knowledgeScopeCount),
    taboo: fmtNumber(row.tabooTopicCount),
  });
  const linesIntentsSummary = t('usage.aiProfileLinesIntentsSummary', {
    lines: fmtNumber(row.allowedLineIdCount),
    intents: fmtNumber(row.allowedIntentTypes.length),
  });

  return `<tr>
    <td>${escapeHtml(aiProfileDisplayName(row))}<div class="hint">${escapeHtml(t('usage.aiProfileTechnicalId', { id: row.id }))}</div><div class="hint">${escapeHtml(t('usage.aiProfileFallbackLine', { lineId: row.fallbackLineId }))}</div></td>
    <td>${renderAiProfileTargets(row.appliesTo)}</td>
    <td><span class="badge${canonClass}">${escapeHtml(canonLabel)}</span></td>
    <td>${escapeHtml(aiProfilePersona(row))}</td>
    <td>${escapeHtml(knowledgeSummary)}</td>
    <td>${escapeHtml(sceneItemSummary)}</td>
    <td>${escapeHtml(timeCompanionSummary)}</td>
    <td>${escapeHtml(linesIntentsSummary)}</td>
    <td>${renderAiProfileGaps(row)}</td>
  </tr>`;
}

function aiDecisionStatusClass(status: string): string {
  if (status === 'provider_error') return ' bad';
  if (status === 'rejected') return ' warn';
  return '';
}

function aiDecisionStatusLabel(status: string): string {
  switch (status) {
    case 'accepted': return t('usage.aiDecisionStatusAccepted');
    case 'rejected': return t('usage.aiDecisionStatusRejected');
    case 'provider_error': return t('usage.aiDecisionStatusProviderError');
    case 'local_reaction': return t('usage.aiDecisionStatusLocalReaction');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: status });
  }
}

function aiTriggerLabel(trigger: string): string {
  switch (trigger) {
    case 'npc_gossip_opened': return t('usage.aiTriggerNpcGossip');
    case 'npc_question': return t('usage.aiTriggerNpcQuestion');
    case 'object_inspected': return t('usage.aiTriggerObjectInspected');
    case 'singularity_candidate': return t('usage.aiTriggerSingularityCandidate');
    case 'item_discarded': return t('usage.aiTriggerItemDiscarded');
    case 'scene_inspected': return t('usage.aiTriggerSceneInspected');
    case 'encounter_memory': return t('usage.aiTriggerEncounterMemory');
    case 'quest_completed': return t('usage.aiTriggerQuestCompleted');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: trigger });
  }
}

function aiMoodLabel(mood: string): string {
  switch (mood) {
    case 'uncanny': return t('usage.aiMoodUncanny');
    case 'haunted': return t('usage.aiMoodHaunted');
    case 'hungry': return t('usage.aiMoodHungry');
    case 'covetous': return t('usage.aiMoodCovetous');
    case 'stirred': return t('usage.aiMoodStirred');
    case 'triumphant': return t('usage.aiMoodTriumphant');
    case 'dread': return t('usage.aiMoodDread');
    case 'relieved': return t('usage.aiMoodRelieved');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: mood });
  }
}

function aiProposalLabel(proposal: string): string {
  switch (proposal) {
    case 'npcTopicShift': return t('usage.aiProposalNpcTopicShift');
    case 'campAlert': return t('usage.aiProposalCampAlert');
    case 'traceEcho': return t('usage.aiProposalTraceEcho');
    case 'encounterEcho': return t('usage.aiProposalEncounterEcho');
    case 'questEcho': return t('usage.aiProposalQuestEcho');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: proposal });
  }
}

function aiProposalIntentLabel(intent: string): string {
  switch (intent) {
    case 'nudgeNpcRumor': return t('usage.aiProposalIntentNudgeNpcRumor');
    case 'raiseCampCaution': return t('usage.aiProposalIntentRaiseCampCaution');
    case 'echoTrace': return t('usage.aiProposalIntentEchoTrace');
    case 'echoEncounterMemory': return t('usage.aiProposalIntentEchoEncounterMemory');
    case 'echoQuestRelief': return t('usage.aiProposalIntentEchoQuestRelief');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: intent });
  }
}

function aiSubjectKindLabel(kind: string): string {
  switch (kind) {
    case 'item': return t('usage.aiSubjectItem');
    case 'encounter': return t('usage.aiSubjectEncounter');
    case 'quest': return t('usage.aiSubjectQuest');
    case 'scene': return t('usage.aiSubjectScene');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: kind });
  }
}

function aiProviderSourceLabel(source: string): string {
  switch (source) {
    case 'codex': return t('usage.aiProviderSourceCodex');
    case 'provider': return t('usage.aiProviderSourceProvider');
    case 'fallback': return t('usage.aiProviderSourceFallback');
    case 'local': return t('usage.aiProviderSourceLocal');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: source });
  }
}

function aiProposalLifecycleLabel(lifecycle: string): string {
  switch (lifecycle) {
    case 'created': return t('usage.aiProposalLifecycleCreated');
    case 'refreshed': return t('usage.aiProposalLifecycleRefreshed');
    case 'expired': return t('usage.aiProposalLifecycleExpired');
    case 'evicted': return t('usage.aiProposalLifecycleEvicted');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: lifecycle });
  }
}

function renderAiMemoryWrites(entry: AiDecisionJournalEntry): string {
  return renderAiDelimitedItems(entry.memoryWrites.map((record) => `${record.kind}:${record.refId}`), 3);
}

function renderAiDecisionRow(entry: AiDecisionJournalEntry): string {
  return `<tr>
    <td class="num">${renderAiNumber(entry.sequence)}</td>
    <td><span class="badge${aiDecisionStatusClass(entry.status)}">${escapeHtml(aiDecisionStatusLabel(entry.status))}</span></td>
    <td>${escapeHtml(aiTriggerLabel(entry.trigger))}</td>
    <td>${escapeHtml(t('usage.aiEntitySummary', { templateId: aiTemplateLabel(entry.templateId), entityId: fmtNumber(entry.entityId) }))}</td>
    <td>${entry.sceneId ? escapeHtml(aiSceneLabel(entry.sceneId)) : `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`}</td>
    <td>${renderAiDelimitedItems(entry.lineIds)}</td>
    <td>${renderAiDelimitedItems(entry.intents)}</td>
    <td>${renderAiMemoryWrites(entry)}</td>
    <td>${entry.reason ? escapeHtml(entry.reason) : `<span class="hint">${escapeHtml(t('usage.aiNoReason'))}</span>`}</td>
  </tr>`;
}

function renderAiAuditEntity(record: AiAuditRecord): string {
  return escapeHtml(t('usage.aiAuditEntitySummary', {
    kind: aiEntityKindLabel(record.entityKind),
    templateId: record.templateId ? aiTemplateLabel(record.templateId) : t('usage.aiDiagnosticsNone'),
    entityId: record.entityId === null ? t('usage.aiDiagnosticsNone') : fmtNumber(record.entityId),
  }));
}

function renderAiAuditScene(record: AiAuditRecord): string {
  if (!record.sceneId && !record.zoneId) return `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`;
  return escapeHtml(t('usage.aiSceneZoneSummary', {
    sceneId: record.sceneId ? aiSceneLabel(record.sceneId) : t('usage.aiDiagnosticsNone'),
    zoneId: record.zoneId ? aiSceneLabel(record.zoneId) : t('usage.aiDiagnosticsNone'),
  }));
}

function aiAuditActionLabel(action: AiAuditPlayerAction | undefined, trigger: string): string {
  if (!action) return aiTriggerLabel(trigger);
  switch (action.labelKey) {
    case 'usage.aiActionNpcGreeting': return t('usage.aiActionNpcGreeting');
    case 'usage.aiActionNpcQuestion': return t('usage.aiActionNpcQuestion');
    case 'usage.aiActionNpcRecent': return t('usage.aiActionNpcRecent');
    case 'usage.aiActionNpcRumor': return t('usage.aiActionNpcRumor');
    case 'usage.aiActionNpcPlace': return t('usage.aiActionNpcPlace');
    case 'usage.aiActionNpcQuestHint': return t('usage.aiActionNpcQuestHint');
    case 'usage.aiActionObjectInspected': return t('usage.aiActionObjectInspected');
    case 'usage.aiActionSingularityCandidate': return t('usage.aiActionSingularityCandidate');
    case 'usage.aiActionPetCommand': return t('usage.aiActionPetCommand');
    default: return t('usage.aiActionUnknown');
  }
}

function renderAiAuditAction(record: AiAuditRecord): string {
  const action = record.playerAction;
  const label = aiAuditActionLabel(action, record.trigger);
  const details = action?.topic
    ? t('usage.aiAuditActionTopic', { topic: aiTopicLabel(action.topic) })
    : t('usage.aiAuditActionTrigger', { trigger: aiTriggerLabel(record.trigger) });
  return `${escapeHtml(label)}<div class="hint">${escapeHtml(details)}</div>`;
}

function aiAuditActionDetail(action: AiAuditPlayerAction | undefined, trigger: string): string {
  return action?.topic
    ? t('usage.aiAuditActionTopic', { topic: aiTopicLabel(action.topic) })
    : t('usage.aiAuditActionTrigger', { trigger: aiTriggerLabel(trigger) });
}

function renderAiAuditTokens(inputTokens: number, outputTokens: number, totalTokens: number, estimated: boolean): string {
  const estimate = estimated
    ? `<div class="hint">${escapeHtml(t('usage.aiAuditEstimated'))}</div>`
    : '';
  return `${renderAiNumber(totalTokens)}<div class="hint">${escapeHtml(t('usage.aiAuditTokenInOut', {
    input: fmtNumber(inputTokens),
    output: fmtNumber(outputTokens),
  }))}</div>${estimate}`;
}

function localizeAiAuditSummaryText(text: string): string {
  const normalized = text.trim();
  if (/^Line-id-only response using the single allowed .* line/i.test(normalized)) {
    return t('usage.aiAuditLineIdOnlySummary');
  }
  if (/^thinking:[^:]+:\d+(\.\d+)?$/i.test(normalized)) {
    const [, speakerName = '', durationMs = '0'] = /^thinking:([^:]+):(\d+(?:\.\d+)?)$/i.exec(normalized) ?? [];
    return t('usage.aiAuditThinkingSummary', {
      speaker: speakerName ? aiSpeakerLabel(speakerName) : t('usage.aiDiagnosticsNone'),
      duration: fmtNumber(Number(durationMs) || 0),
    });
  }
  return text;
}

function renderAiAuditFinalSummary(record: AiAuditRecord): string {
  const summary = record.deliveredSummary ?? record.chain?.delivered.textSummary ?? [];
  if (summary.length === 0 && (record.error || record.reason)) {
    return renderAiAuditOptionalText(record.error || record.reason);
  }
  if (summary.length === 0) return `<span class="hint">${escapeHtml(t('usage.aiAuditNoDelivered'))}</span>`;
  return renderAiDelimitedItems(summary.map(localizeAiAuditSummaryText), 2);
}

function renderAiAuditSummary(audit: AiAuditSnapshot): string {
  const totals = audit.summary.totals;
  const rows = audit.summary.windows.map((window) => `
    <tr>
      <td>${escapeHtml(t(window.labelKey))}</td>
      <td class="num">${renderAiNumber(window.providerJobs)}</td>
      <td class="num">${renderAiNumber(window.accepted)}</td>
      <td class="num">${renderAiNumber(window.rejected)}</td>
      <td class="num">${renderAiNumber(window.providerErrors)}</td>
      <td class="num">${renderAiNumber(window.fallbacks)}</td>
      <td class="num">${renderAiNumber(window.localReactions)}</td>
      <td class="num">${renderAiNumber(window.memoryWrites)}</td>
      <td class="num">${renderAiAuditTokens(window.inputTokens, window.outputTokens, window.totalTokens, window.estimatedTokens)}</td>
    </tr>`).join('');
  const estimateClass = totals.estimatedTokens ? ' warn' : '';
  return `<div class="usage-section">
      <div class="hint">${escapeHtml(t('usage.aiAuditTokenNote'))}</div>
      <div class="ai-health-grid">
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(totals.providerJobs)}</div>
          <div class="ai-health-label">${t('usage.aiAuditProviderJobs')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(totals.localReactions)}</div>
          <div class="ai-health-label">${t('usage.aiAuditLocalReactions')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(totals.totalTokens)}</div>
          <div class="ai-health-label">${t('usage.aiAuditTotalTokens')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(totals.averageProviderJobTokens)}</div>
          <div class="ai-health-label">${t('usage.aiAuditAverageTokens')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(totals.lastTotalTokens)}</div>
          <div class="ai-health-label">${t('usage.aiAuditLastTokens')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${estimateClass}">${escapeHtml(t(totals.estimatedTokens ? 'usage.aiAuditEstimated' : 'usage.aiAuditExact'))}</span></div>
          <div class="ai-health-label">${t('usage.aiAuditTokenMode')}</div>
        </div>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiAuditColWindow')}</th>
            <th class="num">${t('usage.aiAuditColProviderJobs')}</th>
            <th class="num">${t('usage.aiAuditColAccepted')}</th>
            <th class="num">${t('usage.aiAuditColRejected')}</th>
            <th class="num">${t('usage.aiAuditColErrors')}</th>
            <th class="num">${t('usage.aiAuditColFallbacks')}</th>
            <th class="num">${t('usage.aiAuditColLocal')}</th>
            <th class="num">${t('usage.aiAuditColMemoryWrites')}</th>
            <th class="num">${t('usage.aiAuditColTokens')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAiAuditRecordCard(record: AiAuditRecord, selectedAuditId: string | null): string {
  const statusClass = aiDecisionStatusClass(record.status);
  const selected = record.auditId === selectedAuditId;
  const action = record.playerAction;
  return `<button type="button" class="ai-audit-card${selected ? ' active' : ''}" data-ai-audit-id="${escapeHtml(record.auditId)}" aria-pressed="${selected ? 'true' : 'false'}">
    <span class="ai-audit-card-top">
      <span class="ai-audit-time">${escapeHtml(fmtDate(record.createdAt))}</span>
      <span class="badge${statusClass}">${escapeHtml(aiDecisionStatusLabel(record.status))}</span>
    </span>
    <span class="ai-audit-card-title">${escapeHtml(aiAuditActionLabel(action, record.trigger))}</span>
    <span class="ai-audit-card-sub">${escapeHtml(aiAuditActionDetail(action, record.trigger))}</span>
    <span class="ai-audit-card-meta">
      <span class="ai-audit-card-chip">${renderAiAuditEntity(record)}</span>
      <span class="ai-audit-card-chip">${renderAiAuditScene(record)}</span>
      <span class="ai-audit-card-chip">${escapeHtml(aiProviderSourceLabel(record.providerSource))}</span>
      <span class="ai-audit-card-chip">${renderAiLatency(record.latencyMs)}</span>
    </span>
    <span class="ai-audit-card-output">${renderAiAuditFinalSummary(record)}</span>
  </button>`;
}

function renderAiAuditRecords(audit: AiAuditSnapshot, selectedAuditId: string | null): string {
  const records = audit.recent.length === 0
    ? `<div class="empty">${t('usage.aiAuditNoRecords')}</div>`
    : audit.recent.slice(0, 40).map((record) => renderAiAuditRecordCard(record, selectedAuditId)).join('');
  return `
      <div class="admin-actions">
        <button class="danger" data-clean-ai-audit>${t('usage.aiAuditCleanNonReal')}</button>
      </div>
      <div class="hint">${escapeHtml(t('usage.aiAuditCleanHint'))}</div>
      <div class="ai-audit-layout">
        <section class="ai-audit-list" aria-label="${escapeHtml(t('usage.aiAuditRecentTitle'))}">
          ${records}
        </section>
        <section id="ai-audit-detail" class="ai-audit-detail-slot" aria-live="polite">
          <div class="empty">${t('usage.aiAuditDetailEmpty')}</div>
        </section>
      </div>`;
}

function renderJsonBlock(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value, null, 2) ?? '';
  } catch {
    json = String(value);
  }
  return `<pre class="ai-audit-pre">${escapeHtml(json || t('usage.aiDiagnosticsNone'))}</pre>`;
}

function renderTextBlock(value: string, truncated = false): string {
  const body = value || t('usage.aiDiagnosticsNone');
  const truncation = truncated
    ? `<div class="hint">${escapeHtml(t('usage.aiAuditTruncated'))}</div>`
    : '';
  return `${truncation}<pre class="ai-audit-pre">${escapeHtml(body)}</pre>`;
}

function renderAiAuditDetailPair(labelKey: string, value: string): string {
  return `<dt>${t(labelKey)}</dt><dd>${escapeHtml(value || t('usage.aiDiagnosticsNone'))}</dd>`;
}

function aiAuditEventText(event: AiAuditEventSummary): string {
  return event.text || event.speechText || event.lineId || event.type;
}

function aiAuditEventTarget(event: AiAuditEventSummary): string {
  const parts = [
    event.targetEntityId !== null ? t('usage.aiAuditTargetEntity', { value: fmtNumber(event.targetEntityId) }) : '',
    event.targetObjectId !== null ? t('usage.aiAuditTargetObject', { value: fmtNumber(event.targetObjectId) }) : '',
    event.targetItemId ? t('usage.aiAuditTargetItem', { value: event.targetItemId }) : '',
    event.reactionKind ? t('usage.aiAuditReaction', { value: event.reactionKind }) : '',
  ].filter(Boolean);
  return parts.join(' / ');
}

function renderAiAuditEvents(events: readonly AiAuditEventSummary[]): string {
  if (events.length === 0) return `<div class="empty">${t('usage.aiAuditNoEvents')}</div>`;
  const rows = events.map((event) => `
    <tr>
      <td>${escapeHtml(event.type)}</td>
      <td>${event.speakerName
        ? escapeHtml(t('usage.aiAuditSpeakerSummary', { name: aiSpeakerLabel(event.speakerName), id: event.speakerId === null ? t('usage.aiDiagnosticsNone') : fmtNumber(event.speakerId) }))
        : `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`}</td>
      <td>${escapeHtml(event.source || event.speechMode || t('usage.aiDiagnosticsNone'))}</td>
      <td>${escapeHtml(localizeAiAuditSummaryText(aiAuditEventText(event)))}</td>
      <td>${escapeHtml(aiAuditEventTarget(event) || t('usage.aiDiagnosticsNone'))}</td>
      <td>
        <details class="ai-audit-raw">
          <summary>${t('usage.aiAuditRawEvent')}</summary>
          ${renderJsonBlock(event.raw)}
          ${event.rawTruncated ? `<div class="hint">${escapeHtml(t('usage.aiAuditTruncated'))}</div>` : ''}
        </details>
      </td>
    </tr>`).join('');
  return `<div class="table-scroll">
    <table class="usage-table ai-audit-event-table">
      <thead><tr>
        <th>${t('usage.aiAuditEventType')}</th>
        <th>${t('usage.aiAuditEventSpeaker')}</th>
        <th>${t('usage.aiAuditEventSource')}</th>
        <th>${t('usage.aiAuditEventText')}</th>
        <th>${t('usage.aiAuditEventTarget')}</th>
        <th>${t('usage.aiAuditEventRaw')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export function renderAiAuditRecordDetail(record: AiAuditRecord): string {
  const chain = record.chain;
  if (!chain) {
    return `<div class="ai-audit-detail-panel"><div class="empty">${t('usage.aiAuditDetailMissing')}</div></div>`;
  }
  const action = chain.playerAction;
  const validationClass = chain.validation.ok ? '' : ' warn';
  const providerTimings = record.providerTimings ?? chain.provider.timings;
  const promptChars = record.promptChars || chain.requestContext.promptChars;
  const rawOutputChars = record.rawOutputChars || chain.provider.rawOutputChars;
  return `<div class="ai-audit-detail-panel">
    <div class="ai-audit-detail-title">
      <h4>${escapeHtml(t('usage.aiAuditDetailTitle'))}</h4>
      <div class="hint">${escapeHtml(record.auditId)}</div>
    </div>
    <div class="detail-grid ai-audit-detail-grid">
      <section>
        <h4>${t('usage.aiAuditDetailPlayerAction')}</h4>
        <dl>
          ${renderAiAuditDetailPair('usage.aiAuditDetailAction', aiAuditActionLabel(action, record.trigger))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailTopic', aiTopicLabel(action.topic))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailLocale', action.locale)}
          ${renderAiAuditDetailPair('usage.aiAuditDetailPlayer', action.protocol.playerEntityId === null ? '' : fmtNumber(action.protocol.playerEntityId))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailEntity', `${aiTemplateLabel(action.protocol.templateId)} #${action.protocol.entityId ?? t('usage.aiDiagnosticsNone')}`)}
        </dl>
      </section>
      <section>
        <h4>${t('usage.aiAuditDetailServerSummary')}</h4>
        <dl>
          ${renderAiAuditDetailPair('usage.aiAuditDetailJobId', record.jobId)}
          ${renderAiAuditDetailPair('usage.aiAuditDetailTrigger', aiTriggerLabel(record.trigger))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailScene', `${record.sceneId ? aiSceneLabel(record.sceneId) : t('usage.aiDiagnosticsNone')} / ${record.zoneId ? aiSceneLabel(record.zoneId) : t('usage.aiDiagnosticsNone')}`)}
          ${renderAiAuditDetailPair('usage.aiAuditDetailOutputMode', record.outputMode)}
          ${renderAiAuditDetailPair('usage.aiAuditDetailAllowed', t('usage.aiAuditAllowedSummary', {
            intents: fmtNumber(record.allowedIntentCount),
            lines: fmtNumber(record.allowedLineIdCount),
          }))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailContextCounts', t('usage.aiAuditContextCountSummary', {
            memory: fmtNumber(record.memorySignalCount),
            director: fmtNumber(record.directorProposalCount),
            objects: fmtNumber(record.sceneObjectCount),
            companions: fmtNumber(record.companionCount),
          }))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailPromptSize', t('usage.aiCharacters', { value: fmtNumber(promptChars) }))}
          ${renderAiAuditDetailPair('usage.aiAuditDetailRawOutputSize', t('usage.aiCharacters', { value: fmtNumber(rawOutputChars) }))}
        </dl>
      </section>
    </div>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiProviderTimingTitle')}</h4>
      ${renderAiProviderTimingTable(providerTimings)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailPrompt')}</h4>
      ${renderTextBlock(chain.requestContext.promptText, chain.requestContext.promptTruncated)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailRawOutput')}</h4>
      ${renderTextBlock(chain.provider.rawOutput || chain.provider.error, chain.provider.rawOutputTruncated)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailParsedDecision')}</h4>
      ${renderJsonBlock(chain.provider.parsedDecision)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailContextJson')}</h4>
      ${renderJsonBlock(chain.requestContext.context)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailValidation')}</h4>
      <div class="ai-audit-status-line">
        <span class="badge${validationClass}">${escapeHtml(chain.validation.ok ? t('usage.aiAuditValidationPassed') : t('usage.aiAuditValidationFailed'))}</span>
        <span>${escapeHtml(chain.validation.reason || t('usage.aiNoReason'))}</span>
      </div>
      ${renderAiAuditEvents(chain.validation.events)}
    </section>
    <section class="ai-audit-detail-section">
      <h4>${t('usage.aiAuditDetailDelivered')}</h4>
      <div class="hint">${renderAiDelimitedItems(chain.delivered.textSummary.map(localizeAiAuditSummaryText), 4)}</div>
      ${renderAiAuditEvents(chain.delivered.events)}
    </section>
  </div>`;
}

function renderAiDirectorSubject(state: AiWorldDirectorState): string {
  const subject = state.subjectName ?? state.subjectTemplateId ?? state.itemId;
  return escapeHtml(t('usage.aiSubjectSummary', {
    kind: aiSubjectKindLabel(state.subjectKind),
    value: subject,
  }));
}

function renderAiDirectorScene(state: AiWorldDirectorState): string {
  return escapeHtml(t('usage.aiSceneZoneSummary', {
    sceneId: aiSceneLabel(state.sceneId),
    zoneId: aiSceneLabel(state.zoneId),
  }));
}

function renderAiDirectorRow(state: AiWorldDirectorState): string {
  return `<tr>
    <td><span class="badge">${escapeHtml(aiMoodLabel(state.mood))}</span></td>
    <td>${escapeHtml(aiProposalLabel(state.proposalType))}</td>
    <td>${renderAiDirectorSubject(state)}</td>
    <td>${renderAiDirectorScene(state)}</td>
    <td class="num">${escapeHtml(fmtPercent(state.heat))}</td>
    <td>${escapeHtml(state.lineId)}</td>
    <td>${renderAiDelimitedItems(state.evidence, 5)}</td>
  </tr>`;
}

function renderAiProposalJournalRow(entry: AiWorldDirectorProposalAuditEntry): string {
  return `<tr>
    <td><span class="badge">${escapeHtml(aiProposalLifecycleLabel(entry.lifecycle))}</span></td>
    <td>${escapeHtml(aiMoodLabel(entry.mood))}</td>
    <td>${escapeHtml(aiProposalLabel(entry.proposalType))}</td>
    <td>${escapeHtml(aiProposalIntentLabel(entry.intent))}</td>
    <td>${escapeHtml(t('usage.aiSubjectSummary', { kind: aiSubjectKindLabel(entry.subjectKind), value: entry.targetRef }))}</td>
    <td>${escapeHtml(t('usage.aiSceneZoneSummary', { sceneId: aiSceneLabel(entry.sceneId), zoneId: aiSceneLabel(entry.zoneId) }))}</td>
    <td class="num">${escapeHtml(fmtPercent(entry.intensity))}</td>
    <td>${renderAiDelimitedItems([...entry.reasonTags, ...entry.safetyNotes], 5)}</td>
  </tr>`;
}

function renderAiNpcMemoryRow(memory: AiNpcMemory): string {
  return `<tr>
    <td><span class="badge">${escapeHtml(t('usage.aiSocialTypeNpcMemory'))}</span></td>
    <td>${escapeHtml(aiTemplateLabel(memory.templateId))}</td>
    <td>${renderAiDelimitedItems(memory.sceneIds.map(aiSceneLabel), 3)}</td>
    <td>${escapeHtml(t('usage.aiSocialPlayerSummary', {
      playerName: memory.playerName,
      playerEntityId: fmtNumber(memory.playerEntityId),
    }))}</td>
    <td class="num">${renderAiNumber(memory.interactionCount)}</td>
    <td class="num">${escapeHtml(fmtPercent(memory.affinity))}</td>
    <td>${escapeHtml(t('usage.aiSocialLastSeen', { value: fmtNumber(memory.lastInteractionAt) }))}</td>
    <td>${renderAiDelimitedItems([], 3)}</td>
  </tr>`;
}

function renderAiRumorRow(rumor: AiRumorMemory): string {
  const subject = rumor.subjectKind === 'quest'
    ? escapeHtml(t('usage.aiSubjectSummary', { kind: aiSubjectKindLabel('quest'), value: rumor.questId ?? rumor.itemId }))
    : escapeHtml(t('usage.aiSubjectSummary', { kind: aiSubjectKindLabel(rumor.subjectKind), value: rumor.itemId }));
  return `<tr>
    <td><span class="badge">${escapeHtml(t('usage.aiSocialTypeRumor'))}</span></td>
    <td>${subject}</td>
    <td>${escapeHtml(t('usage.aiSceneZoneSummary', { sceneId: aiSceneLabel(rumor.sceneId), zoneId: aiSceneLabel(rumor.zoneId) }))}</td>
    <td>${escapeHtml(t('usage.aiSocialPlayerId', { playerEntityId: fmtNumber(rumor.sourcePlayerEntityId) }))}</td>
    <td class="num">${escapeHtml(rumor.scope)}</td>
    <td class="num">${escapeHtml(fmtPercent(rumor.strength))}</td>
    <td>${escapeHtml(t('usage.aiSocialExpiresAt', { value: fmtNumber(rumor.expiresAt) }))}</td>
    <td>${renderAiDelimitedItems(rumor.lineIds, 3)}</td>
  </tr>`;
}

function renderAiDiagnostics(diagnostics: AiLifeLayerDiagnosticsSnapshot): string {
  const recentDecisions = diagnostics.recentDecisions.slice(-8).reverse();
  const directorStates = diagnostics.worldDirectorStates.slice(0, 8);
  const proposalJournal = (diagnostics.worldDirectorProposalJournal ?? []).slice(0, 8);
  const socialMemory = diagnostics.socialMemory ?? { npcMemories: [], rumors: [] };
  const socialRows = [
    ...socialMemory.rumors.slice(0, 6).map(renderAiRumorRow),
    ...socialMemory.npcMemories.slice(0, 6).map(renderAiNpcMemoryRow),
  ];
  const persistenceErrors = diagnostics.memoryPersistence.errors.slice(-4).reverse();
  const flushingLabel = diagnostics.memoryPersistence.flushing
    ? t('usage.aiMemoryFlushingYes')
    : t('usage.aiMemoryFlushingNo');
  const pruningLabel = diagnostics.memoryPersistence.pruning
    ? t('usage.aiMemoryPruningYes')
    : t('usage.aiMemoryPruningNo');
  const budgetingLabel = diagnostics.memoryPersistence.budgeting
    ? t('usage.aiMemoryBudgetingYes')
    : t('usage.aiMemoryBudgetingNo');
  const flushingClass = diagnostics.memoryPersistence.flushing ? ' warn' : '';
  const pruningClass = diagnostics.memoryPersistence.pruning ? ' warn' : '';
  const budgetingClass = diagnostics.memoryPersistence.budgeting ? ' warn' : '';
  const errorClass = persistenceErrors.length > 0 ? ' warn' : '';
  const memoryBudget = diagnostics.memoryPersistence.budget ?? {
    maxTotalRecords: 0,
    maxRecordsPerPlayer: 0,
    maxRecordsPerKind: {},
    batchSize: 0,
  };

  const decisionRows = recentDecisions.length === 0
    ? `<tr><td colspan="9" class="empty">${t('usage.aiDiagnosticsNoDecisions')}</td></tr>`
    : recentDecisions.map(renderAiDecisionRow).join('');
  const directorRows = directorStates.length === 0
    ? `<tr><td colspan="7" class="empty">${t('usage.aiDiagnosticsNoDirectorStates')}</td></tr>`
    : directorStates.map(renderAiDirectorRow).join('');
  const proposalJournalRows = proposalJournal.length === 0
    ? `<tr><td colspan="8" class="empty">${t('usage.aiDiagnosticsNoProposalJournal')}</td></tr>`
    : proposalJournal.map(renderAiProposalJournalRow).join('');
  const socialTableRows = socialRows.length === 0
    ? `<tr><td colspan="8" class="empty">${t('usage.aiDiagnosticsNoSocialMemory')}</td></tr>`
    : socialRows.join('');

  return `
      <div class="admin-actions">
        <button class="danger" data-clear-ai-memory>${t('usage.aiClearMemory')}</button>
      </div>
      <div class="hint">${escapeHtml(t('usage.aiClearScopeHint'))}</div>
      <div class="ai-health-grid">
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.recentDecisions.length)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsDecisions')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.worldDirectorStates.length)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsDirectorStates')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.worldDirectorProposalJournal?.length ?? 0)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsProposalJournal')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(socialMemory.npcMemories.length)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsNpcMemories')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(socialMemory.rumors.length)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsRumors')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.memoryPersistence.pending)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsPendingWrites')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${flushingClass}">${escapeHtml(flushingLabel)}</span></div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsMemoryFlush')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${pruningClass}">${escapeHtml(pruningLabel)}</span></div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsMemoryPrune')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${budgetingClass}">${escapeHtml(budgetingLabel)}</span></div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsMemoryBudget')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.memoryPersistence.lastPruneDeleted)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsLastPruneDeleted')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(diagnostics.memoryPersistence.lastBudgetDeleted)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsLastBudgetDeleted')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(memoryBudget.maxTotalRecords)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsBudgetTotal')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(memoryBudget.maxRecordsPerPlayer)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsBudgetPerPlayer')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${errorClass}">${renderAiNumber(persistenceErrors.length)}</span></div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsMemoryErrors')}</div>
        </div>
      </div>
      <div class="hint">${persistenceErrors.length > 0
        ? renderAiDelimitedItems(persistenceErrors, 2)
        : escapeHtml(t('usage.aiDiagnosticsNoMemoryErrors'))}</div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th class="num">${t('usage.aiDecisionColSeq')}</th>
            <th>${t('usage.aiDecisionColStatus')}</th>
            <th>${t('usage.aiDecisionColTrigger')}</th>
            <th>${t('usage.aiDecisionColEntity')}</th>
            <th>${t('usage.aiDecisionColScene')}</th>
            <th>${t('usage.aiDecisionColLineIds')}</th>
            <th>${t('usage.aiDecisionColIntents')}</th>
            <th>${t('usage.aiDecisionColMemoryWrites')}</th>
            <th>${t('usage.aiDecisionColReason')}</th>
          </tr></thead>
          <tbody>${decisionRows}</tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiDirectorColMood')}</th>
            <th>${t('usage.aiDirectorColProposal')}</th>
            <th>${t('usage.aiDirectorColSubject')}</th>
            <th>${t('usage.aiDirectorColScene')}</th>
            <th class="num">${t('usage.aiDirectorColHeat')}</th>
            <th>${t('usage.aiDirectorColLineId')}</th>
            <th>${t('usage.aiDirectorColEvidence')}</th>
          </tr></thead>
          <tbody>${directorRows}</tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiProposalColLifecycle')}</th>
            <th>${t('usage.aiDirectorColMood')}</th>
            <th>${t('usage.aiDirectorColProposal')}</th>
            <th>${t('usage.aiProposalColIntent')}</th>
            <th>${t('usage.aiDirectorColSubject')}</th>
            <th>${t('usage.aiDirectorColScene')}</th>
            <th class="num">${t('usage.aiProposalColIntensity')}</th>
            <th>${t('usage.aiProposalColEvidence')}</th>
          </tr></thead>
          <tbody>${proposalJournalRows}</tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiSocialColType')}</th>
            <th>${t('usage.aiSocialColSubject')}</th>
            <th>${t('usage.aiSocialColScene')}</th>
            <th>${t('usage.aiSocialColPlayer')}</th>
            <th class="num">${t('usage.aiSocialColCountScope')}</th>
            <th class="num">${t('usage.aiSocialColStrength')}</th>
            <th>${t('usage.aiSocialColTiming')}</th>
            <th>${t('usage.aiSocialColLineIds')}</th>
          </tr></thead>
          <tbody>${socialTableRows}</tbody>
        </table>
      </div>`;
}

function renderAiContentCoverage(coverage: AiContentCoverageReport, checklist?: AiContentReviewChecklist): string {
  const issueCount = coverageIssueCount(coverage);
  const statusKey = issueCount > 0 ? 'usage.aiCoverageStatusGaps' : 'usage.aiCoverageStatusReady';
  const statusClass = issueCount > 0 ? ' warn' : '';
  const rows = [
    coverageRow('usage.aiCoverageFamiliesMissingSemantics', coverage.families.missingSemantics),
    coverageRow('usage.aiCoverageFamiliesNoTemplates', coverage.families.semanticsWithoutContent),
    coverageRow('usage.aiCoverageFamiliesMissingDepth', coverage.families.familiesMissingDepth),
    coverageRow('usage.aiCoverageFamiliesInvalidMood', coverage.families.familiesWithInvalidMoodBias),
    coverageRow('usage.aiCoverageNpcMissingProfiles', coverage.npcs.missingInteractiveProfiles),
    coverageRow('usage.aiCoverageNpcMissingScene', coverage.npcs.authoredNpcProfilesMissingSceneAffinities),
    coverageRow('usage.aiCoverageNpcMissingItems', coverage.npcs.authoredNpcProfilesMissingItemInterest),
    coverageRow('usage.aiCoverageNpcMissingTimeWeather', coverage.npcs.authoredNpcProfilesMissingTimeWeatherSensitivity),
    coverageRow('usage.aiCoverageNpcThinMemory', coverage.npcs.authoredNpcProfilesWithThinMemory),
    coverageRow('usage.aiCoverageSceneMissingObjects', coverage.scenes.anchorsMissingSemanticObjects),
    coverageRow('usage.aiCoverageSceneMissingTags', coverage.scenes.anchorsMissingTags),
    coverageRow('usage.aiCoverageSceneMissingDepth', coverage.scenes.anchorsMissingTagDepth),
    coverageRow('usage.aiCoverageObjectMissingTags', coverage.scenes.semanticObjectsMissingTags),
    coverageRow('usage.aiCoverageObjectMissingDepth', coverage.scenes.semanticObjectsMissingTagDepth),
    coverageRow('usage.aiCoverageObjectMissingFeatures', coverage.scenes.semanticObjectsMissingFeatureTags),
    coverageRow('usage.aiCoverageObjectMissingAffordances', coverage.scenes.semanticObjectsMissingAffordanceTags),
    coverageRow('usage.aiCoverageObjectMissingOverlap', coverage.scenes.semanticObjectsMissingAnchorOverlap),
    coverageRow('usage.aiCoverageItemMissingRequired', coverage.items.missingRequiredItems),
    coverageRow('usage.aiCoverageItemMissingRequiredSignals', coverage.items.requiredItemsMissingSignals),
    coverageRow('usage.aiCoverageItemMissingDiscardSignals', coverage.items.discardableItemsMissingSignals),
    coverageRow('usage.aiCoverageItemMissingImportantSignals', coverage.items.importantItemsMissingSignals),
  ].join('');

  return `
      <div class="ai-health-grid">
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${statusClass}">${escapeHtml(t(statusKey))}</span></div>
          <div class="ai-health-label">${t('usage.aiCoverageStatusTitle')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(coverage.families.expected.length)}</div>
          <div class="ai-health-label">${t('usage.aiCoverageFamilies')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(coverage.npcs.authoredProfileTotal)} / ${renderAiNumber(coverage.npcs.interactiveTotal)}</div>
          <div class="ai-health-label">${t('usage.aiCoverageProfiles')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(coverage.scenes.anchorTotal)} / ${renderAiNumber(coverage.scenes.semanticObjectTotal)}</div>
          <div class="ai-health-label">${t('usage.aiCoverageScenes')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(coverage.items.discardableTotal)}</div>
          <div class="ai-health-label">${t('usage.aiCoverageItems')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(coverage.lineIds.referenced.length)}</div>
          <div class="ai-health-label">${t('usage.aiCoverageLineIds')}</div>
        </div>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.colMetric')}</th>
            <th class="num">${t('usage.aiCoverageColGaps')}</th>
            <th>${t('usage.aiCoverageColExamples')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderAiCoverageChecklist(checklist)}`;
}

function renderAiProfilePreview(profiles: AiProfilePreviewReport): string {
  const totalGaps = profiles.rows.reduce((sum, row) => sum + row.missingAuthoringFields.length, 0);
  const visibleRows = profiles.rows.slice(0, 12);
  const hiddenCount = Math.max(0, profiles.authoredTotal - visibleRows.length);
  const validationStatusKey = profiles.validation.errorCount > 0
    ? 'usage.aiProfileValidationErrors'
    : profiles.validation.warningCount > 0
      ? 'usage.aiProfileValidationWarnings'
      : 'usage.aiProfileValidationPassed';
  const validationStatusClass = profiles.validation.errorCount > 0
    ? ' bad'
    : profiles.validation.warningCount > 0 ? ' warn' : '';
  const rows = visibleRows.length === 0
    ? `<tr><td colspan="9" class="empty">${t('usage.aiProfilesNoRows')}</td></tr>`
    : visibleRows.map(renderAiProfileRow).join('');
  const truncatedHint = profiles.truncated || hiddenCount > 0
    ? `<div class="hint">${escapeHtml(t('usage.aiProfilesTruncated', { count: fmtNumber(hiddenCount) }))}</div>`
    : '';

  return `
      <div class="ai-health-grid">
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(profiles.authoredTotal)}</div>
          <div class="ai-health-label">${t('usage.aiProfilesAuthored')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(profiles.genericTotal)}</div>
          <div class="ai-health-label">${t('usage.aiProfilesGeneric')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(visibleRows.length)}</div>
          <div class="ai-health-label">${t('usage.aiProfilesShowing')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${totalGaps > 0 ? ' warn' : ''}">${renderAiNumber(totalGaps)}</span></div>
          <div class="ai-health-label">${t('usage.aiProfilesAuthoringGaps')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${validationStatusClass}">${escapeHtml(t(validationStatusKey))}</span></div>
          <div class="ai-health-label">${t('usage.aiProfileValidationTitle')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(profiles.validation.warningCount)}</div>
          <div class="ai-health-label">${t('usage.aiProfileValidationWarningCount')}</div>
        </div>
      </div>
      ${truncatedHint}
      ${renderAiProfileValidation(profiles.validation)}
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiProfileColProfile')}</th>
            <th>${t('usage.aiProfileColTargets')}</th>
            <th>${t('usage.aiProfileColCanon')}</th>
            <th>${t('usage.aiProfileColPersona')}</th>
            <th>${t('usage.aiProfileColKnowledge')}</th>
            <th>${t('usage.aiProfileColSceneItem')}</th>
            <th>${t('usage.aiProfileColTimeCompanion')}</th>
            <th>${t('usage.aiProfileColLinesIntents')}</th>
            <th>${t('usage.aiProfileColGaps')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

function aiActiveCategoryLabel(category: AiActivePollRule['category']): string {
  switch (category) {
    case 'sceneAmbient': return t('usage.aiActiveCategorySceneAmbient');
    case 'time': return t('usage.aiActiveCategoryTime');
    case 'weather': return t('usage.aiActiveCategoryWeather');
    case 'townLife': return t('usage.aiActiveCategoryTownLife');
    case 'livingRoutine': return t('usage.aiActiveCategoryLivingRoutine');
    case 'creatureRoutine': return t('usage.aiActiveCategoryCreatureRoutine');
    case 'socialSequence': return t('usage.aiActiveCategorySocialSequence');
  }
}

function aiActiveProviderPolicyLabel(policy: AiActivePollRule['providerPolicy']): string {
  switch (policy) {
    case 'localOnly': return t('usage.aiActiveProviderLocalOnly');
    case 'codexAllowed': return t('usage.aiActiveProviderCodexAllowed');
    case 'codexPreferred': return t('usage.aiActiveProviderCodexPreferred');
  }
}

function aiActiveOutputModeLabel(mode: AiActivePollRule['outputMode']): string {
  switch (mode) {
    case 'lineIdOnly': return t('usage.aiActiveOutputLineIdOnly');
    case 'dynamicTextFirst': return t('usage.aiActiveOutputDynamicTextFirst');
    case 'mixedLivingWorld': return t('usage.aiActiveOutputMixedLivingWorld');
  }
}

function aiActiveRuleSelect<T extends string>(field: string, value: T, values: readonly T[], label: (value: T) => string, ariaKey: string, ruleTitle: string): string {
  const options = values.map((option) => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(label(option))}</option>`).join('');
  return `<select data-ai-active-rule-field="${field}" aria-label="${escapeHtml(t(ariaKey, { rule: ruleTitle }))}">${options}</select>`;
}

function aiActiveRuleNumberInput(rule: AiActivePollRule, field: string, value: number, min: number, max: number, ariaKey: string): string {
  return `<input type="number" min="${min}" max="${max}" step="1" value="${value}" data-ai-active-rule-field="${field}" aria-label="${escapeHtml(t(ariaKey, { rule: rule.title }))}">`;
}

function renderAiActiveRuleRow(rule: AiActivePollRule): string {
  return `<tr data-ai-active-rule-id="${escapeHtml(rule.ruleId)}">
    <td>
      <b>${escapeHtml(rule.title)}</b>
      <div class="hint">${escapeHtml(rule.ruleId)} / ${escapeHtml(aiActiveCategoryLabel(rule.category))}</div>
    </td>
    <td class="num">
      <input type="checkbox" data-ai-active-rule-field="enabled" aria-label="${escapeHtml(t('usage.aiActiveRuleEnabledAria', { rule: rule.title }))}"${rule.enabled ? ' checked' : ''}>
    </td>
    <td class="num">${aiActiveRuleNumberInput(rule, 'periodSeconds', rule.periodSeconds, 1, 86400, 'usage.aiActiveRulePeriodAria')}</td>
    <td class="num">${aiActiveRuleNumberInput(rule, 'jitterSeconds', rule.jitterSeconds, 0, 3600, 'usage.aiActiveRuleJitterAria')}</td>
    <td class="num">${aiActiveRuleNumberInput(rule, 'priority', rule.priority, 0, 100, 'usage.aiActiveRulePriorityAria')}</td>
    <td>${aiActiveRuleSelect('providerPolicy', rule.providerPolicy, ['localOnly', 'codexAllowed', 'codexPreferred'], aiActiveProviderPolicyLabel, 'usage.aiActiveRuleProviderAria', rule.title)}</td>
    <td>${aiActiveRuleSelect('outputMode', rule.outputMode, ['lineIdOnly', 'dynamicTextFirst', 'mixedLivingWorld'], aiActiveOutputModeLabel, 'usage.aiActiveRuleOutputAria', rule.title)}</td>
    <td class="num">${aiActiveRuleNumberInput(rule, 'cooldown.perPlayerSeconds', rule.cooldown.perPlayerSeconds, 0, 86400, 'usage.aiActiveRulePlayerCooldownAria')}</td>
    <td class="num">${aiActiveRuleNumberInput(rule, 'cooldown.perEntitySeconds', rule.cooldown.perEntitySeconds, 0, 86400, 'usage.aiActiveRuleEntityCooldownAria')}</td>
    <td class="num"><button type="button" data-save-ai-active-rule>${t('usage.aiActiveSaveRule')}</button></td>
  </tr>`;
}

function renderAiActiveRecentDecision(decision: AiActiveTriggerDecisionSnapshot): string {
  return `<tr>
    <td>${escapeHtml(fmtDate(new Date(decision.createdAtMs).toISOString()))}</td>
    <td>${escapeHtml(decision.ruleId)}</td>
    <td class="num">${renderAiNumber(decision.playerEntityId)}</td>
    <td>${escapeHtml(decision.speakerTemplateId ?? decision.skipReason ?? t('usage.aiDiagnosticsNone'))}</td>
    <td>${escapeHtml(decision.sceneId ?? t('usage.aiDiagnosticsNone'))}</td>
    <td>${escapeHtml(decision.lineId ?? t('usage.aiDiagnosticsNone'))}</td>
  </tr>`;
}

function renderAiActiveQueuedEvent(event: AiActiveQueuedEventSnapshot): string {
  return `<tr>
    <td>${escapeHtml(event.kind)}</td>
    <td>${escapeHtml(event.itemId ?? event.questId ?? event.subjectTemplateId ?? t('usage.aiDiagnosticsNone'))}</td>
    <td class="num">${renderAiNumber(event.priority)}</td>
    <td class="num">${renderAiNumber(event.attempts)}</td>
    <td>${escapeHtml(event.observations.slice(0, 3).join(', '))}</td>
  </tr>`;
}

function renderAiActiveSpeakerCell(sequence: AiActiveSequenceSnapshot): string {
  const names = sequence.speakerNames
    .map((speakerName) => aiSpeakerLabel(speakerName))
    .filter((speakerName, index, list) => speakerName && list.indexOf(speakerName) === index);
  const primary = names.length > 0
    ? names.slice(0, 3).join(', ')
    : sequence.speakerTemplateIds.slice(0, 3).map(aiTemplateLabel).join(', ');
  const technicalIds = sequence.speakerTemplateIds.slice(0, 3).join(', ');
  const details = technicalIds && technicalIds !== primary
    ? `<div class="hint">${escapeHtml(technicalIds)}</div>`
    : '';
  return `${escapeHtml(primary || t('usage.aiDiagnosticsNone'))}${details}`;
}

function renderAiActiveFocusCell(sequence: AiActiveSequenceSnapshot): string {
  const primary = sequence.focusDisplayName?.trim()
    || (sequence.focusObjectTemplateId ? aiTemplateLabel(sequence.focusObjectTemplateId) : '')
    || sequence.focusObjectId
    || t('usage.aiDiagnosticsNone');
  const details = [sequence.focusObjectTemplateId, sequence.focusObjectId]
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  const hint = details && details !== primary
    ? `<div class="hint">${escapeHtml(details)}</div>`
    : '';
  return `${escapeHtml(primary)}${hint}`;
}

function renderAiActiveSequence(sequence: AiActiveSequenceSnapshot): string {
  const kind = sequence.kind === 'creature' && sequence.family
    ? `${sequence.kind}:${sequence.family}`
    : sequence.kind;
  return `<tr>
    <td>
      <b>${escapeHtml(kind)}</b>
      <div class="hint">${escapeHtml(sequence.sequenceId)} / ${escapeHtml(sequence.ruleId)}</div>
    </td>
    <td class="num">${renderAiNumber(sequence.playerEntityId)}</td>
    <td>${renderAiActiveSpeakerCell(sequence)}</td>
    <td>${escapeHtml(sequence.sceneId ? aiSceneLabel(sequence.sceneId) : t('usage.aiDiagnosticsNone'))}</td>
    <td>${renderAiActiveFocusCell(sequence)}</td>
    <td class="num">${renderAiNumber(sequence.remainingBeats)}</td>
    <td>${escapeHtml(fmtDate(new Date(sequence.nextBeatAtMs).toISOString()))}</td>
    <td>${escapeHtml(sequence.lineIds[0] ?? t('usage.aiDiagnosticsNone'))}</td>
  </tr>`;
}

function renderAiActiveLastAction(metrics: AiActiveTriggerMetricsSnapshot): string {
  if (!metrics.activeLastActionKind || !metrics.activeLastActionResult) {
    return escapeHtml(t('usage.aiActiveActionNone'));
  }
  const resultKey = metrics.activeLastActionResult === 'applied'
    ? 'usage.aiActiveActionApplied'
    : 'usage.aiActiveActionRejected';
  const parts = [
    metrics.activeLastActionKind,
    t(resultKey),
    metrics.activeLastActionReason,
  ].filter(Boolean);
  return escapeHtml(parts.join(' / '));
}

function renderAiActiveRuntimeMoment(timestampMs: number): string {
  if (timestampMs <= 0) return escapeHtml(t('usage.aiDiagnosticsNone'));
  return escapeHtml(fmtRelative(new Date(timestampMs).toISOString()));
}

function renderAiActiveRuntimeCountdown(targetAtMs: number): string {
  if (targetAtMs <= 0) return escapeHtml(t('usage.aiDiagnosticsNone'));
  return escapeHtml(fmtDuration(Math.max(0, (targetAtMs - Date.now()) / 1000)));
}

function renderAiActiveRuntimeAge(ageMs: number): string {
  if (ageMs <= 0) return escapeHtml(t('usage.aiDiagnosticsNone'));
  return escapeHtml(fmtDuration(ageMs / 1000));
}

function aiActiveRuntimeStateLabel(runtime: AiActiveRuntimeSnapshot): string {
  switch (runtime.lastTickState) {
    case 'disabled': return t('usage.aiActiveRuntimeState.disabled');
    case 'event': return t('usage.aiActiveRuntimeState.event');
    case 'poll': return t('usage.aiActiveRuntimeState.poll');
    case 'idle': return t('usage.aiActiveRuntimeState.idle');
  }
}

function aiActiveSkipReasonLabel(reason: AiActiveRuntimeSnapshot['lastTickSkipReason']): string {
  switch (reason) {
    case 'disabled': return t('usage.aiActiveSkip.disabled');
    case 'events_disabled': return t('usage.aiActiveSkip.events_disabled');
    case 'polls_disabled': return t('usage.aiActiveSkip.polls_disabled');
    case 'no_online_players': return t('usage.aiActiveSkip.no_online_players');
    case 'not_due': return t('usage.aiActiveSkip.not_due');
    case 'player_missing': return t('usage.aiActiveSkip.player_missing');
    case 'player_busy_combat': return t('usage.aiActiveSkip.player_busy_combat');
    case 'player_recent_ai_speech': return t('usage.aiActiveSkip.player_recent_ai_speech');
    case 'no_candidate': return t('usage.aiActiveSkip.no_candidate');
    case 'entity_cooldown': return t('usage.aiActiveSkip.entity_cooldown');
    default: return t('usage.aiDiagnosticsNone');
  }
}

function renderAiActiveRuntimeHint(diagnostics: AiActiveTriggerAdminSnapshot['diagnostics']): string {
  const { runtime } = diagnostics;
  if (!diagnostics.enabled) return escapeHtml(t('usage.aiActiveRuntimeHintDisabled'));
  if (runtime.lastTickState === 'event' || runtime.lastTickState === 'poll') {
    return escapeHtml(t('usage.aiActiveRuntimeHintProduced', { count: fmtNumber(runtime.lastTickProducedEvents) }));
  }
  if (runtime.lastTickSkipReason === 'no_online_players') {
    return escapeHtml(t('usage.aiActiveRuntimeHintNoOnline'));
  }
  if (runtime.lastTickSkipReason === 'not_due') {
    return escapeHtml(t('usage.aiActiveRuntimeHintNotDue'));
  }
  if (runtime.lastTickSkipReason) {
    return escapeHtml(t('usage.aiActiveRuntimeHintIdleReason', {
      reason: aiActiveSkipReasonLabel(runtime.lastTickSkipReason),
    }));
  }
  return escapeHtml(t('usage.aiActiveRuntimeHintHealthy'));
}

function renderAiActiveTriggerControls(active?: AiActiveTriggerAdminSnapshot): string {
  if (!active) return `<div class="empty">${t('usage.aiActiveNoData')}</div>`;
  const { diagnostics, metrics } = active;
  const policy = diagnostics.populationPolicy;
  const runtime = diagnostics.runtime;
  const runtimeStateClass = !diagnostics.enabled
    || (runtime.lastTickState === 'idle' && runtime.lastTickSkipReason !== '' && runtime.lastTickSkipReason !== 'no_online_players' && runtime.lastTickSkipReason !== 'not_due')
    ? ' warn'
    : '';
  const rules = diagnostics.rules.map(renderAiActiveRuleRow).join('');
  const recentRows = diagnostics.recentDecisions.length === 0
    ? `<tr><td colspan="6" class="empty">${t('usage.aiActiveNoRecentDecisions')}</td></tr>`
    : diagnostics.recentDecisions.slice(0, 12).map(renderAiActiveRecentDecision).join('');
  const queueRows = diagnostics.eventQueue.length === 0
    ? `<tr><td colspan="5" class="empty">${t('usage.aiActiveNoQueuedEvents')}</td></tr>`
    : diagnostics.eventQueue.slice(0, 12).map(renderAiActiveQueuedEvent).join('');
  const sequenceRows = diagnostics.activeSequences.length === 0
    ? `<tr><td colspan="8" class="empty">${t('usage.aiActiveNoActiveSequences')}</td></tr>`
    : diagnostics.activeSequences.slice(0, 12).map(renderAiActiveSequence).join('');
  return `
    <div class="ai-health-grid">
      <div class="ai-health-cell">
        <div class="ai-health-value"><span class="badge${diagnostics.enabled ? '' : ' warn'}">${escapeHtml(t(diagnostics.enabled ? 'usage.aiActiveEnabled' : 'usage.aiActiveDisabled'))}</span></div>
        <div class="ai-health-label">${t('usage.aiActiveStatus')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(metrics.activeProviderPending)}</div>
        <div class="ai-health-label">${t('usage.aiActiveProviderPending')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(metrics.activeProviderSuccesses)} / ${renderAiNumber(metrics.activeProviderErrors)}</div>
        <div class="ai-health-label">${t('usage.aiActiveProviderSuccessError')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(diagnostics.codexBudget.remainingCalls5h)} / ${renderAiNumber(diagnostics.codexBudget.remainingCallsWeek)}</div>
        <div class="ai-health-label">${t('usage.aiActiveBudgetRemaining')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${policy ? escapeHtml(t(`usage.aiActiveBand.${policy.band}`)) : escapeHtml(t('usage.aiDiagnosticsNone'))}</div>
        <div class="ai-health-label">${t('usage.aiActivePopulationBand')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiLatency(metrics.activeLastProviderLatencyMs)}</div>
        <div class="ai-health-label">${t('usage.aiActiveLastLatency')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(metrics.activeActionsApplied)} / ${renderAiNumber(metrics.activeActionsRejected)}</div>
        <div class="ai-health-label">${t('usage.aiActiveActionsAppliedRejected')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiActiveLastAction(metrics)}</div>
        <div class="ai-health-label">${t('usage.aiActiveLastAction')}</div>
      </div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveRuntimeTitle')}</h4>
      <div class="ai-health-grid">
        <div class="ai-health-cell">
          <div class="ai-health-value"><span class="badge${runtimeStateClass}">${escapeHtml(aiActiveRuntimeStateLabel(runtime))}</span></div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeStateLabel')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiActiveRuntimeMoment(runtime.lastTickCompletedAtMs)}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeLastTick')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${escapeHtml(fmtDuration(runtime.schedulerIntervalMs / 1000))}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeInterval')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(runtime.lastTickSessionCount)}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeSessions')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${escapeHtml(aiActiveSkipReasonLabel(runtime.lastTickSkipReason))}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeLastReason')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiActiveRuntimeCountdown(runtime.nextDueAtMs)}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeNextDue')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiNumber(runtime.queuedEventCount)}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeQueueSize')}</div>
        </div>
        <div class="ai-health-cell">
          <div class="ai-health-value">${renderAiActiveRuntimeAge(runtime.oldestQueuedEventAgeMs)}</div>
          <div class="ai-health-label">${t('usage.aiActiveRuntimeQueueAge')}</div>
        </div>
      </div>
      <div class="hint">${renderAiActiveRuntimeHint(diagnostics)}</div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiProviderTimingTitle')}</h4>
      <div class="ai-audit-status-line">
        <span>${t('usage.aiActiveColRule')}: ${escapeHtml(metrics.activeLastRuleId || t('usage.aiDiagnosticsNone'))}</span>
        <span>${t('usage.aiActiveLastLatency')}: ${renderAiLatency(metrics.activeLastProviderLatencyMs)}</span>
      </div>
      ${renderAiProviderTimingTable(metrics.activeLastProviderTimings)}
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveGlobalTitle')}</h4>
      <div class="ai-audit-status-line" data-ai-active-global>
        <label><input type="checkbox" data-ai-active-global-field="enabled"${diagnostics.enabled ? ' checked' : ''}> ${t('usage.aiActiveGlobalEnabled')}</label>
        <label><input type="checkbox" data-ai-active-global-field="eventsEnabled"${diagnostics.eventsEnabled ? ' checked' : ''}> ${t('usage.aiActiveGlobalEvents')}</label>
        <label><input type="checkbox" data-ai-active-global-field="pollsEnabled"${diagnostics.pollsEnabled ? ' checked' : ''}> ${t('usage.aiActiveGlobalPolls')}</label>
        <label><input type="checkbox" data-ai-active-global-field="realActionsEnabled"${diagnostics.realActionsEnabled ? ' checked' : ''}> ${t('usage.aiActiveGlobalRealActions')}</label>
        <button type="button" data-save-ai-active-global>${t('usage.aiActiveSaveGlobal')}</button>
      </div>
      <div class="hint">${escapeHtml(t('usage.aiActiveGlobalHint'))}</div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveRulesTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiActiveColRule')}</th>
            <th class="num">${t('usage.aiActiveColEnabled')}</th>
            <th class="num">${t('usage.aiActiveColPeriod')}</th>
            <th class="num">${t('usage.aiActiveColJitter')}</th>
            <th class="num">${t('usage.aiActiveColPriority')}</th>
            <th>${t('usage.aiActiveColProvider')}</th>
            <th>${t('usage.aiActiveColOutput')}</th>
            <th class="num">${t('usage.aiActiveColPlayerCooldown')}</th>
            <th class="num">${t('usage.aiActiveColEntityCooldown')}</th>
            <th class="num">${t('usage.aiActiveColAction')}</th>
          </tr></thead>
          <tbody>${rules}</tbody>
        </table>
      </div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveRecentTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiAuditColTime')}</th>
            <th>${t('usage.aiActiveColRule')}</th>
            <th class="num">${t('usage.aiActiveColPlayer')}</th>
            <th>${t('usage.aiActiveColSpeaker')}</th>
            <th>${t('usage.aiAuditDetailScene')}</th>
            <th>${t('usage.aiActiveColLine')}</th>
          </tr></thead>
          <tbody>${recentRows}</tbody>
        </table>
      </div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveQueueTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiActiveColEvent')}</th>
            <th>${t('usage.aiActiveColSubject')}</th>
            <th class="num">${t('usage.aiActiveColPriority')}</th>
            <th class="num">${t('usage.aiActiveColAttempts')}</th>
            <th>${t('usage.aiActiveColObservations')}</th>
          </tr></thead>
          <tbody>${queueRows}</tbody>
        </table>
      </div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.aiActiveSequencesTitle')}</h4>
      <div class="ai-audit-status-line">
        <button type="button" data-cancel-ai-active-sequences${diagnostics.activeSequences.length === 0 ? ' disabled' : ''}>${t('usage.aiActiveCancelSequences')}</button>
        <span class="hint">${escapeHtml(t('usage.aiActiveSequencesHint'))}</span>
      </div>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.aiActiveColSequence')}</th>
            <th class="num">${t('usage.aiActiveColPlayer')}</th>
            <th>${t('usage.aiActiveColSpeaker')}</th>
            <th>${t('usage.aiAuditDetailScene')}</th>
            <th>${t('usage.aiActiveColFocus')}</th>
            <th class="num">${t('usage.aiActiveColRemainingBeats')}</th>
            <th>${t('usage.aiActiveColNextBeat')}</th>
            <th>${t('usage.aiActiveColLine')}</th>
          </tr></thead>
          <tbody>${sequenceRows}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderAiLifeLayerMetrics(
  ai: AiLifeLayerMetricsSnapshot,
  coverage?: AiContentCoverageReport,
  diagnostics?: AiLifeLayerDiagnosticsSnapshot,
  profiles?: AiProfilePreviewReport,
  audit?: AiAuditSnapshot,
  active?: AiActiveTriggerAdminSnapshot,
  activeTab: AiLifeLayerTab = 'audit',
  selectedAuditId: string | null = null,
  coverageChecklist?: AiContentReviewChecklist,
): string {
  const selectedTab = normalizeAiTab(activeTab);
  const needsAttention = ai.providerErrors > 0 || ai.memoryFlushFailures > 0 || ai.memoryPruneFailures > 0 || ai.memoryBudgetFailures > 0;
  const statusKey = needsAttention ? 'usage.aiStatusAttention' : 'usage.aiStatusHealthy';
  const statusClass = needsAttention ? ' warn' : '';
  const rows = [
    aiMetricRow('usage.aiProviderCalls', renderAiNumber(ai.providerCalls)),
    aiMetricRow('usage.aiProviderSuccesses', renderAiNumber(ai.providerSuccesses)),
    aiMetricRow('usage.aiProviderErrors', renderAiNumber(ai.providerErrors)),
    aiMetricRow('usage.aiProviderFallbacks', renderAiNumber(ai.providerFallbacks)),
    aiMetricRow('usage.aiAcceptedDecisions', renderAiNumber(ai.acceptedDecisions)),
    aiMetricRow('usage.aiRejectedDecisions', renderAiNumber(ai.rejectedDecisions)),
    aiMetricRow('usage.aiLocalReactions', renderAiNumber(ai.localReactions)),
    aiMetricRow('usage.aiGeneratedEvents', renderAiNumber(ai.generatedEvents)),
    aiMetricRow('usage.aiMemoryWritesQueued', renderAiNumber(ai.memoryWritesQueued)),
    aiMetricRow('usage.aiMemoryFlushFailures', renderAiNumber(ai.memoryFlushFailures)),
    aiMetricRow('usage.aiMemoryPruneRuns', renderAiNumber(ai.memoryPruneRuns)),
    aiMetricRow('usage.aiMemoryPruneDeleted', renderAiNumber(ai.memoryPruneDeleted)),
    aiMetricRow('usage.aiMemoryPruneFailures', renderAiNumber(ai.memoryPruneFailures)),
    aiMetricRow('usage.aiMemoryBudgetRuns', renderAiNumber(ai.memoryBudgetRuns)),
    aiMetricRow('usage.aiMemoryBudgetDeleted', renderAiNumber(ai.memoryBudgetDeleted)),
    aiMetricRow('usage.aiMemoryBudgetFailures', renderAiNumber(ai.memoryBudgetFailures)),
    aiMetricRow('usage.aiAverageLatency', renderAiLatency(ai.averageProviderLatencyMs)),
    aiMetricRow('usage.aiMaxLatency', renderAiLatency(ai.maxProviderLatencyMs)),
    aiMetricRow('usage.aiLastLatency', renderAiLatency(ai.lastProviderLatencyMs)),
    aiMetricRow('usage.aiLatencySamples', renderAiNumber(ai.providerLatencySampleCount)),
    aiMetricRow('usage.aiLatencyP50', renderAiLatency(ai.providerLatencyP50Ms)),
    aiMetricRow('usage.aiLatencyP90', renderAiLatency(ai.providerLatencyP90Ms)),
    aiMetricRow('usage.aiLatencyP95', renderAiLatency(ai.providerLatencyP95Ms)),
    aiMetricRow('usage.aiLastPromptChars', renderAiChars(ai.lastPromptChars)),
    aiMetricRow('usage.aiLastRawOutputChars', renderAiChars(ai.lastRawOutputChars)),
    aiMetricRow('usage.aiLastProviderTiming', renderAiProviderTimingSummary(ai.lastProviderTimings)),
    aiMetricRow('usage.aiLastProviderError', renderAiOptionalText(ai.lastProviderError)),
    aiMetricRow('usage.aiLastMemoryError', renderAiOptionalText(ai.lastMemoryPersistenceError)),
    aiMetricRow('usage.aiLastMemoryPruneError', renderAiOptionalText(ai.lastMemoryPruneError)),
    aiMetricRow('usage.aiLastMemoryBudgetError', renderAiOptionalText(ai.lastMemoryBudgetError)),
  ].join('');

  const panels: Record<AiLifeLayerTab, string> = {
    audit: audit ? renderAiAuditRecords(audit, selectedAuditId) : `<div class="empty">${t('usage.aiAuditNoRecords')}</div>`,
    active: renderAiActiveTriggerControls(active),
    usage: audit ? renderAiAuditSummary(audit) : `<div class="empty">${t('usage.aiAuditNoRecords')}</div>`,
    coverage: coverage ? renderAiContentCoverage(coverage, coverageChecklist) : `<div class="empty">${t('usage.aiCoverageAllClear')}</div>`,
    profiles: profiles ? renderAiProfilePreview(profiles) : `<div class="empty">${t('usage.aiProfilesNoRows')}</div>`,
    diagnostics: diagnostics ? renderAiDiagnostics(diagnostics) : `<div class="empty">${t('usage.aiDiagnosticsNoDecisions')}</div>`,
    details: `
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.colMetric')}</th>
            <th class="num">${t('usage.aiColValue')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
  };

  return `
    <div class="ai-workspace">
    <div class="ai-health-grid">
      <div class="ai-health-cell">
        <div class="ai-health-value"><span class="badge${statusClass}">${escapeHtml(t(statusKey))}</span></div>
        <div class="ai-health-label">${t('usage.aiStatusTitle')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(ai.providerCalls)}</div>
        <div class="ai-health-label">${t('usage.aiProviderCalls')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiLatency(ai.averageProviderLatencyMs)}</div>
        <div class="ai-health-label">${t('usage.aiAverageLatency')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiLatency(ai.providerLatencyP95Ms)}</div>
        <div class="ai-health-label">${t('usage.aiLatencyP95')}</div>
      </div>
      <div class="ai-health-cell">
        <div class="ai-health-value">${renderAiNumber(ai.memoryWritesQueued)}</div>
        <div class="ai-health-label">${t('usage.aiMemoryWritesQueued')}</div>
      </div>
    </div>
    <div class="ai-tabbar" role="tablist" aria-label="${escapeHtml(t('usage.aiTitle'))}">
      ${renderAiTabButton('audit', 'usage.aiAuditRecentTitle', selectedTab)}
      ${renderAiTabButton('active', 'usage.aiActiveTitle', selectedTab)}
      ${renderAiTabButton('usage', 'usage.aiAuditTitle', selectedTab)}
      ${renderAiTabButton('coverage', 'usage.aiCoverageTitle', selectedTab)}
      ${renderAiTabButton('profiles', 'usage.aiProfilesTitle', selectedTab)}
      ${renderAiTabButton('diagnostics', 'usage.aiDiagnosticsTitle', selectedTab)}
      ${renderAiTabButton('details', 'usage.aiDetailsTitle', selectedTab)}
    </div>
    <div class="ai-tab-panels">
      ${renderAiTabPanel('audit', selectedTab, panels.audit)}
      ${renderAiTabPanel('active', selectedTab, panels.active)}
      ${renderAiTabPanel('usage', selectedTab, panels.usage)}
      ${renderAiTabPanel('coverage', selectedTab, panels.coverage)}
      ${renderAiTabPanel('profiles', selectedTab, panels.profiles)}
      ${renderAiTabPanel('diagnostics', selectedTab, panels.diagnostics)}
      ${renderAiTabPanel('details', selectedTab, panels.details)}
    </div>
    </div>`;
}

export function renderProviderUsage(usage: ProviderUsageSnapshot): string {
  const metricRows = usage.metrics.map((metric) => `
    <tr>
      <td>${escapeHtml(t(metric.labelKey))}</td>
      ${usage.windows.map((window) => `<td class="num">${renderMetricCount(metric.counts[window.key] ?? 0)}</td>`).join('')}
    </tr>`).join('');
  const cacheRows = usage.caches.map((cache) => `
    <tr>
      <td>${escapeHtml(t(cache.labelKey))}</td>
      <td class="num">${renderCacheEntries(cache)}</td>
      <td class="num">${renderCacheHitRate(cache)}</td>
      <td class="num">${renderMetricCount(cache.hits)}</td>
      <td class="num">${renderMetricCount(cache.misses)}</td>
      <td class="num">${renderMetricCount(cache.staleRefreshes)}</td>
      <td class="num">${renderMetricCount(cache.stores)}</td>
      <td class="num">${renderMetricCount(cache.failures)}</td>
      <td class="num">${renderMetricCount(cache.evictions)}</td>
    </tr>`).join('');

  return `
    <div class="hint">${escapeHtml(t('usage.externalServiceNote'))}</div>
    <div class="usage-section">
      <h4>${t('usage.requestsTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.colMetric')}</th>
            ${usage.windows.map((window) => `<th class="num">${escapeHtml(t(window.labelKey))}</th>`).join('')}
          </tr></thead>
          <tbody>${metricRows}</tbody>
        </table>
      </div>
    </div>
    <div class="usage-section">
      <h4>${t('usage.cacheTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.cacheColCache')}</th>
            <th class="num">${t('usage.cacheColEntries')}</th>
            <th class="num">${t('usage.cacheColHitRate')}</th>
            <th class="num">${t('usage.cacheColHits')}</th>
            <th class="num">${t('usage.cacheColMisses')}</th>
            <th class="num">${t('usage.cacheColStale')}</th>
            <th class="num">${t('usage.cacheColStores')}</th>
            <th class="num">${t('usage.cacheColFailures')}</th>
            <th class="num">${t('usage.cacheColEvictions')}</th>
          </tr></thead>
          <tbody>${cacheRows}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderAccountsTable(rows: AccountRow[]): string {
  if (rows.length === 0) return `<div class="empty">${t('accounts.empty')}</div>`;
  const body = rows.map((a) => `
    <tr class="clickable" data-account-id="${a.id}">
      <td class="num">${a.id}</td>
      <td>${escapeHtml(a.username)}${a.isAdmin ? ` <span class="badge">${t('accounts.badgeAdmin')}</span>` : ''} ${accountStatusBadge(a)}</td>
      <td class="num">${a.characterCount}</td>
      <td class="num">${a.maxLevel}</td>
      <td class="num">${fmtDuration(a.playtimeSeconds)}</td>
      <td>${fmtDate(a.createdAt)}</td>
      <td>${fmtRelative(a.lastLogin)}</td>
    </tr>`);
  return `<table>
    <thead><tr>
      <th class="num">${t('accounts.colId')}</th><th>${t('accounts.colUsername')}</th><th class="num">${t('accounts.colChars')}</th><th class="num">${t('accounts.colMaxLvl')}</th>
      <th class="num">${t('accounts.colPlaytime')}</th><th>${t('accounts.colRegistered')}</th><th>${t('accounts.colLastLogin')}</th>
    </tr></thead>
    <tbody>${body.join('')}</tbody>
  </table>`;
}

function accountStatusBadge(a: { bannedAt: string | null; suspendedUntil: string | null }): string {
  if (a.bannedAt) return `<span class="badge bad">${t('accounts.badgeBanned')}</span>`;
  const suspendedUntil = a.suspendedUntil ? new Date(a.suspendedUntil) : null;
  if (suspendedUntil && suspendedUntil.getTime() > Date.now()) return `<span class="badge warn">${t('accounts.badgeSuspended')}</span>`;
  return '';
}

function accountStatusDetail(d: AccountDetail): string {
  const activeSuspension = d.suspendedUntil !== null && new Date(d.suspendedUntil).getTime() > Date.now();
  const activeChatMute = d.chatMutedUntil !== null && new Date(d.chatMutedUntil).getTime() > Date.now();
  if (d.bannedAt) return `<span class="badge bad">${t('accounts.badgeBanned')}</span> <span class="hint">${t('detail.since', { value: fmtDate(d.bannedAt) })}</span>`;
  if (activeSuspension) return `<span class="badge warn">${t('detail.suspendedUntil', { value: fmtDate(d.suspendedUntil) })}</span>`;
  return `<span class="badge">${t('detail.statusActive')}</span>${activeChatMute ? ` <span class="badge warn">${t('detail.chatMutedUntil', { value: fmtDate(d.chatMutedUntil) })}</span>` : ''}`;
}

export function renderAccountDetail(d: AccountDetail, includeAdminControls = false): string {
  const canModerateAccount = includeAdminControls && !d.isAdmin;
  const chars = d.characters.length === 0
    ? `<div class="empty">${t('detail.noCharacters')}</div>`
    : `<table><thead><tr><th>${t('detail.colName')}</th><th>${t('characters.colClass')}</th><th class="num">${t('characters.colLevel')}</th><th class="num">${t('detail.colXp')}</th><th class="num">${t('detail.colMoney')}</th><th class="num">${t('online.colPos')}</th><th>${t('characters.colLastPlayed')}</th>${canModerateAccount ? `<th>${t('detail.colActions')}</th>` : ''}</tr></thead><tbody>${
        d.characters.map((c) => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(classLabel(c.class))}</td>
            <td class="num">${c.level}</td>
            <td class="num">${c.xp}</td>
            <td class="num">${fmtCopper(c.copper)}</td>
            <td class="num">${c.pos ? `${Math.round(c.pos.x)}, ${Math.round(c.pos.z)}` : '—'}</td>
            <td>${fmtRelative(c.updatedAt)}</td>
            ${canModerateAccount ? `<td><button data-force-rename-character="${c.id}" data-character-name="${escapeHtml(c.name)}">${t('detail.forceNameChange')}</button></td>` : ''}
          </tr>`).join('')
      }</tbody></table>`;
  const sessions = d.recentSessions.length === 0
    ? `<div class="empty">${t('detail.noSessions')}</div>`
    : `<table><thead><tr><th>${t('online.colCharacter')}</th><th>${t('detail.started')}</th><th class="num">${t('dialog.length')}</th></tr></thead><tbody>${
        d.recentSessions.map((s) => `
          <tr>
            <td>${escapeHtml(s.characterName)}</td>
            <td>${fmtDate(s.startedAt)}</td>
            <td class="num">${s.endedAt ? fmtDuration(s.seconds) : t('detail.onlineNow')}</td>
          </tr>`).join('')
      }</tbody></table>`;
  const accountStatus = accountStatusDetail(d);
  const accountActionButtons = d.bannedAt ? `
      <button data-unban-account="1">${t('detail.unban')}</button>` : `
      <button data-suspend-hours="1">${t('detail.suspend1h')}</button>
      <button data-suspend-hours="24">${t('detail.suspend24h')}</button>
      <button data-suspend-hours="72">${t('detail.suspend3d')}</button>
      <button data-suspend-hours="168">${t('detail.suspend7d')}</button>
      <button data-suspend-hours="720">${t('detail.suspend30d')}</button>
      <input class="account-custom-expiry" type="datetime-local" />
      <button data-suspend-custom="1">${t('detail.suspendCustom')}</button>
      <button data-chat-mute-hours="1">${t('detail.chatMute1h')}</button>
      <button data-chat-mute-custom="1">${t('detail.chatMuteCustom')}</button>
      <button data-ban-account="1" class="danger">${t('detail.ban')}</button>`;
  const adminControls = canModerateAccount ? `
    <div class="account-admin-controls mod-account-actions" data-action-account-id="${d.id}">
      <div class="account-status"><b>${t('detail.status')}</b> ${accountStatus}${d.moderationReason ? ` <span class="hint">${t('detail.reason', { value: escapeHtml(d.moderationReason) })}</span>` : ''}</div>
      ${d.chatMutedUntil && new Date(d.chatMutedUntil).getTime() > Date.now() && d.chatMuteReason ? `<div class="account-status"><b>${t('detail.chatMuteLabel')}</b> <span class="hint">${t('detail.reason', { value: escapeHtml(d.chatMuteReason) })}</span></div>` : ''}
      <input class="account-mod-reason" placeholder="${t('detail.notePlaceholder')}" maxlength="500" />
      ${accountActionButtons}
    </div>
    <div class="mod-confirm account-mod-confirm"></div>` : includeAdminControls ? `
    <div class="account-admin-controls">
      <div class="account-status"><b>${t('detail.status')}</b> <span class="badge">${t('accounts.badgeAdmin')}</span> ${accountStatus}</div>
    </div>` : '';
  // Chat-mute controls are shown for EVERY account (admins included): the chat
  // filter auto-mutes admins too, and ban/suspend gating must not strand them.
  const activeChatMute = d.chatMutedUntil !== null && new Date(d.chatMutedUntil).getTime() > Date.now();
  const chatModControls = includeAdminControls ? `
    <div class="account-admin-controls chat-mod-controls" data-action-account-id="${d.id}">
      <div class="account-status"><b>${t('chatMod.chatLabel')}</b> ${activeChatMute ? `<span class="badge warn">${t('chatMod.mutedUntil', { value: fmtDate(d.chatMutedUntil) })}</span>` : `<span class="badge">${t('chatMod.notMuted')}</span>`} &middot; ${t('chatMod.strikesInline')} <b>${d.chatStrikes}</b></div>
      ${activeChatMute ? `<button data-lift-mute="1">${t('chatMod.liftChatMute')}</button>` : ''}
      ${d.chatStrikes > 0 ? `<button data-reset-strikes="1">${t('chatMod.resetChatStrikes')}</button>` : ''}
    </div>` : '';
  return `<div class="account-detail" data-action-account-id="${d.id}">${adminControls}${chatModControls}<div class="detail-grid">
    <div><h4>${t('detail.charactersHeader')}</h4>${chars}</div>
    <div><h4>${t('detail.sessionsHeader', { value: fmtDuration(d.playtimeSeconds) })}</h4>${sessions}</div>
  </div></div>`;
}

export function renderCharactersTable(rows: CharacterRow[], sort: string, dir: string): string {
  if (rows.length === 0) return `<div class="empty">${t('characters.empty')}</div>`;
  const arrow = (col: string) => (sort === col ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  const sortableHeader = (col: string, label: string, numeric = false) =>
    `<th class="sortable${numeric ? ' num' : ''}" data-sort="${col}">${label}${arrow(col)}</th>`;
  const body = rows.map((c) => `
    <tr>
      <td class="num">${c.id}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(classLabel(c.class))}</td>
      <td class="num">${c.level}</td>
      <td class="num">${c.xp}</td>
      <td class="num">${fmtCopper(c.copper)}</td>
      <td>${escapeHtml(c.username)}</td>
      <td>${fmtDate(c.createdAt)}</td>
      <td>${fmtRelative(c.updatedAt)}</td>
    </tr>`);
  return `<table>
    <thead><tr>
      ${sortableHeader('id', t('characters.colId'), true)}
      ${sortableHeader('name', t('characters.colName'))}
      ${sortableHeader('class', t('characters.colClass'))}
      ${sortableHeader('level', t('characters.colLevel'), true)}
      <th class="num">${t('characters.colXp')}</th><th class="num">${t('characters.colMoney')}</th><th>${t('characters.colAccount')}</th>
      ${sortableHeader('created_at', t('characters.colCreated'))}
      ${sortableHeader('updated_at', t('characters.colLastPlayed'))}
    </tr></thead>
    <tbody>${body.join('')}</tbody>
  </table>`;
}

export function renderPager(total: number, page: number, limit: number): string {
  const pages = Math.max(1, Math.ceil(total / limit));
  return `
    <button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${t('accounts.prev')}</button>
    <span>${t('accounts.pager', { page, pages, total })}</span>
    <button data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>${t('accounts.next')}</button>`;
}

export function renderModerationQueue(rows: ModerationQueueRow[]): string {
  if (rows.length === 0) return `<div class="empty">${t('moderation.empty')}</div>`;
  const body = rows.map((r) => `
    <tr class="clickable" data-moderation-account-id="${r.accountId}">
      <td>${escapeHtml(r.username)}${r.online ? ` <span class="badge">${t('moderation.badgeOnline')}</span>` : ''}</td>
      <td>${r.characterNames.map(escapeHtml).join(', ') || '—'}</td>
      <td class="num">${r.openReports}</td>
      <td>${escapeHtml(reasonLabel(r.latestReason))}</td>
      <td>${fmtRelative(r.latestReportAt)}</td>
      <td>${statusBadge(r.status, r.suspendedUntil)}</td>
    </tr>`);
  return `<table>
    <thead><tr>
      <th>${t('moderation.colAccount')}</th><th>${t('moderation.colCharacters')}</th><th class="num">${t('moderation.colOpenReports')}</th><th>${t('moderation.colLatestReason')}</th><th>${t('moderation.colLatest')}</th><th>${t('moderation.colStatus')}</th>
    </tr></thead>
    <tbody>${body.join('')}</tbody>
  </table>`;
}

export function renderModerationDetail(d: ModerationAccountDetail): string {
  const reports = d.reports.map((r) => {
    const chat = r.chatContext.length === 0
      ? `<div class="empty">${t('report.noChat')}</div>`
      : `<table><thead><tr><th>${t('report.colTime')}</th><th>${t('report.colChannel')}</th><th>${t('report.colMessage')}</th></tr></thead><tbody>${
          r.chatContext.map((c) => `
            <tr>
              <td>${fmtDate(c.createdAt)}</td>
              <td>${escapeHtml(c.channel)}</td>
              <td><b>${escapeHtml(c.characterName)}:</b> ${escapeHtml(c.message)}</td>
            </tr>`).join('')
        }</tbody></table>`;
    return `<div class="mod-report panel" data-report-id="${r.id}">
      <div class="panel-title">${t('report.title', { id: r.id })} <span class="hint">${fmtDate(r.createdAt)}</span></div>
      <div class="mod-report-meta">
        <div><b>${t('report.reporter')}</b> ${escapeHtml(r.reporterUsername ?? t('common.unknown'))} / ${escapeHtml(r.reporterCharacterName || t('common.unknown'))}</div>
        <div><b>${t('report.reported')}</b> ${escapeHtml(r.reportedUsername)} / ${escapeHtml(r.reportedCharacterName || t('common.unknown'))}</div>
        <div><b>${t('report.reason')}</b> ${escapeHtml(reasonLabel(r.reason))}</div>
      </div>
      <div class="mod-details">${escapeHtml(r.details || t('report.noDetails'))}</div>
      <div class="mod-actions">
        <button data-ignore-report="${r.id}">${t('report.ignore')}</button>
        ${r.reportedCharacterId ? `<button data-force-rename-character="${r.reportedCharacterId}" data-character-name="${escapeHtml(r.reportedCharacterName)}">${t('report.forceNameChange')}</button>` : ''}
      </div>
      <h4>${t('report.recentChat')}</h4>
      ${chat}
    </div>`;
  }).join('');
  const moderationAccountButtons = d.account.bannedAt ? `
      <button data-unban-account="1">${t('detail.unban')}</button>` : `
      <button data-suspend-hours="1">${t('detail.suspend1h')}</button>
      <button data-suspend-hours="24">${t('detail.suspend24h')}</button>
      <button data-suspend-hours="72">${t('detail.suspend3d')}</button>
      <button data-suspend-hours="168">${t('detail.suspend7d')}</button>
      <button data-suspend-hours="720">${t('detail.suspend30d')}</button>
      <input id="mod-custom-expiry" type="datetime-local" />
      <button data-suspend-custom="1">${t('detail.suspendCustom')}</button>
      <button data-chat-mute-hours="1">${t('detail.chatMute1h')}</button>
      <button data-chat-mute-custom="1">${t('detail.chatMuteCustom')}</button>
      <button data-ban-account="1">${t('detail.ban')}</button>`;
  return `<div class="mod-detail">
    <div class="panel-title">
      <span>${escapeHtml(d.account.username)}</span>
      <span class="hint">${t('detail.accountNum', { id: d.account.id })}</span>
    </div>
    ${renderAccountDetail(d.account)}
    ${renderChatModeration(d.chat)}
    <div class="mod-account-actions" data-action-account-id="${d.account.id}">
      <input id="mod-reason" placeholder="${t('detail.notePlaceholder')}" maxlength="500" />
      ${moderationAccountButtons}
    </div>
    <div id="mod-confirm" class="mod-confirm"></div>
    <h4>${t('report.openReports')}</h4>
    ${reports || `<div class="empty">${t('report.noOpenReports')}</div>`}
  </div>`;
}

// Chat-filter state for an account: live mute status, strike count, the
// warn/mute incident log, and manual lift/reset actions (slurs the player typed).
function renderChatModeration(chat: ChatModerationDetail): string {
  const muteStatus = chat.chatMutedUntil
    ? `<span class="badge bad">${t('chatMod.mutedUntil', { value: fmtDate(chat.chatMutedUntil) })}</span>`
    : `<span class="badge">${t('chatMod.notMuted')}</span>`;
  const incidents = chat.violations.length === 0
    ? `<div class="empty">${t('chatMod.noIncidents')}</div>`
    : `<table><thead><tr><th>${t('report.colTime')}</th><th>${t('report.colChannel')}</th><th>${t('chatMod.colWord')}</th><th>${t('dialog.action')}</th><th>${t('report.colMessage')}</th></tr></thead><tbody>${
        chat.violations.map((v) => `
          <tr>
            <td>${fmtDate(v.createdAt)}</td>
            <td>${escapeHtml(v.channel)}</td>
            <td>${escapeHtml(v.term)}</td>
            <td>${escapeHtml(v.action)}${v.muteSeconds > 0 ? ` (${escapeHtml(fmtDuration(v.muteSeconds))})` : ''}</td>
            <td>${escapeHtml(v.message)}</td>
          </tr>`).join('')
      }</tbody></table>`;
  return `<div class="panel chat-mod">
    <div class="panel-title">${t('chatMod.title')}</div>
    <div class="chat-mod-status">${t('chatMod.status')} ${muteStatus} &middot; ${t('chatMod.strikes')} <b>${chat.chatStrikes}</b></div>
    <div class="mod-actions">
      ${chat.chatMutedUntil ? `<button data-lift-mute="1">${t('chatMod.liftMute')}</button>` : ''}
      ${chat.chatStrikes > 0 ? `<button data-reset-strikes="1">${t('chatMod.resetStrikes')}</button>` : ''}
    </div>
    <h4>${t('chatMod.recentIncidents')}</h4>
    ${incidents}
  </div>`;
}

function renderWordChips(words: FilterWord[]): string {
  if (words.length === 0) return `<div class="empty">${t('chatFilter.noWords')}</div>`;
  return `<div class="word-chips">${
    words.map((w) => `<span class="word-chip">${escapeHtml(w.word)}<button class="word-del" data-del-word="${w.id}" title="${t('chatFilter.removeWord')}">&times;</button></span>`).join('')
  }</div>`;
}

export function renderChatFilter(data: ChatFilterData): string {
  const ladderHuman = data.config.muteLadderSeconds.map((s) => fmtDuration(s)).join(' → ');
  return `
    <div class="panel">
      <div class="panel-title">${t('chatFilter.escalationTitle')}</div>
      <p class="hint">${t('chatFilter.escalationHint')}</p>
      <div class="cf-config">
        <label>${t('chatFilter.warningsLabel')}
          <input id="cf-warnings" type="number" min="0" max="50" value="${data.config.warningsBeforeMute}" />
        </label>
        <label>${t('chatFilter.ladderLabel')}
          <input id="cf-ladder" type="text" value="${escapeHtml(data.config.muteLadderSeconds.join(', '))}" />
        </label>
        <div class="hint">${t('chatFilter.currentLadder')} ${escapeHtml(ladderHuman || '—')}</div>
        <button data-save-config="1">${t('chatFilter.saveConfig')}</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">${t('chatFilter.softTitle')} <span class="hint">${t('chatFilter.softHint')}</span></div>
      <form class="word-add" data-add-tier="soft"><input placeholder="${t('chatFilter.softPlaceholder')}" maxlength="64" /><button>${t('chatFilter.add')}</button></form>
      ${renderWordChips(data.soft)}
    </div>
    <div class="panel">
      <div class="panel-title">${t('chatFilter.hardTitle')} <span class="hint">${t('chatFilter.hardHint')}</span></div>
      <form class="word-add" data-add-tier="hard"><input placeholder="${t('chatFilter.hardPlaceholder')}" maxlength="64" /><button>${t('chatFilter.add')}</button></form>
      ${renderWordChips(data.hard)}
    </div>
    <div class="panel">
      <div class="panel-title">${t('chatFilter.accountsTitle')} <span class="hint">${t('chatFilter.accountsHint')}</span></div>
      ${renderChatModeratedAccounts(data.accounts)}
    </div>`;
}

function renderChatModeratedAccounts(accounts: ChatModeratedAccount[]): string {
  if (accounts.length === 0) return `<div class="empty">${t('chatFilter.noModeratedAccounts')}</div>`;
  const rows = accounts.map((a) => {
    const muted = a.chatMutedUntil !== null && new Date(a.chatMutedUntil).getTime() > Date.now();
    const muteCell = muted
      ? `<span class="badge warn">${t('chatMod.mutedUntil', { value: fmtDate(a.chatMutedUntil) })}</span>`
      : `<span class="badge">${t('chatMod.notMuted')}</span>`;
    const actions = `${muted ? `<button data-lift-mute="1">${t('chatMod.liftMute')}</button>` : ''}${a.chatStrikes > 0 ? ` <button data-reset-strikes="1">${t('chatMod.resetStrikes')}</button>` : ''}`;
    return `<tr data-action-account-id="${a.id}">
      <td>${escapeHtml(a.username)}${a.isAdmin ? ` <span class="badge">${t('accounts.badgeAdmin')}</span>` : ''}</td>
      <td class="num">${a.chatStrikes}</td>
      <td>${muteCell}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>${t('moderation.colAccount')}</th><th class="num">${t('chatMod.colStrikes')}</th><th>${t('chatMod.colMute')}</th><th>${t('detail.colActions')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function reasonLabel(reason: string): string {
  return ({
    harassment: t('reason.harassment'),
    spam: t('reason.spam'),
    cheating: t('reason.cheating'),
    offensive_name_or_chat: t('reason.offensiveName'),
    other: t('reason.other'),
  } as Record<string, string>)[reason] ?? reason;
}

function statusBadge(status: string, suspendedUntil: string | null): string {
  if (status === 'banned') return `<span class="badge bad">${t('accounts.badgeBanned')}</span>`;
  if (status === 'suspended') return `<span class="badge warn">${t('detail.suspendedUntil', { value: fmtDate(suspendedUntil) })}</span>`;
  return `<span class="badge">${t('detail.statusActive')}</span>`;
}
