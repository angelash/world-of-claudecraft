import { escapeHtml, fmtCopper, fmtDate, fmtDuration, fmtNumber, fmtPercent, fmtRelative } from './format';
import { classLabel, zoneLabel, t } from './i18n';
import type {
  AccountDetail, AccountRow, CharacterRow, ChatFilterData, ChatModeratedAccount,
  ChatModerationDetail, FilterWord, LivePlayer, ModerationAccountDetail, ModerationQueueRow,
  AiContentCoverageReport, AiDecisionJournalEntry, AiLifeLayerDiagnosticsSnapshot, AiNpcMemory, AiRumorMemory,
  AiLifeLayerMetricsSnapshot, AiProfileAuthoringIssue, AiProfileAuthoringValidationReport,
  AiProfilePreviewReport, AiProfilePreviewRow,
  AiProfilePreviewTarget, AiWorldDirectorProposalAuditEntry, AiWorldDirectorState,
  ProviderUsageCache, ProviderUsageSnapshot,
} from './types';

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

function renderAiOptionalText(value: string | undefined): string {
  if (!value) return `<span class="hint">${escapeHtml(t('usage.aiNoRecentError'))}</span>`;
  return escapeHtml(value);
}

function aiMetricRow(labelKey: string, value: string): string {
  return `<tr><td>${t(labelKey)}</td><td class="num">${value}</td></tr>`;
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

function renderAiProfileTargets(targets: readonly AiProfilePreviewTarget[]): string {
  if (targets.length === 0) return `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`;
  const visible = targets.slice(0, 3).map((target) => escapeHtml(t('usage.aiProfileTargetSummary', {
    kind: aiProfileTargetKindLabel(target.kind),
    templateId: target.templateId,
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
    <td>${escapeHtml(row.id)}<div class="hint">${escapeHtml(t('usage.aiProfileFallbackLine', { lineId: row.fallbackLineId }))}</div></td>
    <td>${renderAiProfileTargets(row.appliesTo)}</td>
    <td><span class="badge${canonClass}">${escapeHtml(canonLabel)}</span></td>
    <td>${escapeHtml(row.personaExcerpt)}</td>
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

function aiSubjectKindLabel(kind: string): string {
  switch (kind) {
    case 'item': return t('usage.aiSubjectItem');
    case 'encounter': return t('usage.aiSubjectEncounter');
    case 'quest': return t('usage.aiSubjectQuest');
    case 'scene': return t('usage.aiSubjectScene');
    default: return t('usage.aiDiagnosticsUnknownValue', { value: kind });
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
    <td>${escapeHtml(t('usage.aiEntitySummary', { templateId: entry.templateId, entityId: fmtNumber(entry.entityId) }))}</td>
    <td>${entry.sceneId ? escapeHtml(entry.sceneId) : `<span class="hint">${escapeHtml(t('usage.aiDiagnosticsNone'))}</span>`}</td>
    <td>${renderAiDelimitedItems(entry.lineIds)}</td>
    <td>${renderAiDelimitedItems(entry.intents)}</td>
    <td>${renderAiMemoryWrites(entry)}</td>
    <td>${entry.reason ? escapeHtml(entry.reason) : `<span class="hint">${escapeHtml(t('usage.aiNoReason'))}</span>`}</td>
  </tr>`;
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
    sceneId: state.sceneId,
    zoneId: state.zoneId,
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
    <td>${escapeHtml(entry.intent)}</td>
    <td>${escapeHtml(t('usage.aiSubjectSummary', { kind: aiSubjectKindLabel(entry.subjectKind), value: entry.targetRef }))}</td>
    <td>${escapeHtml(t('usage.aiSceneZoneSummary', { sceneId: entry.sceneId, zoneId: entry.zoneId }))}</td>
    <td class="num">${escapeHtml(fmtPercent(entry.intensity))}</td>
    <td>${renderAiDelimitedItems([...entry.reasonTags, ...entry.safetyNotes], 5)}</td>
  </tr>`;
}

function renderAiNpcMemoryRow(memory: AiNpcMemory): string {
  return `<tr>
    <td><span class="badge">${escapeHtml(t('usage.aiSocialTypeNpcMemory'))}</span></td>
    <td>${escapeHtml(memory.templateId)}</td>
    <td>${renderAiDelimitedItems(memory.sceneIds, 3)}</td>
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
    <td>${escapeHtml(t('usage.aiSceneZoneSummary', { sceneId: rumor.sceneId, zoneId: rumor.zoneId }))}</td>
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
  const flushingClass = diagnostics.memoryPersistence.flushing ? ' warn' : '';
  const pruningClass = diagnostics.memoryPersistence.pruning ? ' warn' : '';
  const errorClass = persistenceErrors.length > 0 ? ' warn' : '';

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
    <div class="usage-section">
      <h4>${t('usage.aiDiagnosticsTitle')}</h4>
      <div class="admin-actions">
        <button class="danger" data-clear-ai-memory>${t('usage.aiClearMemory')}</button>
      </div>
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
          <div class="ai-health-value">${renderAiNumber(diagnostics.memoryPersistence.lastPruneDeleted)}</div>
          <div class="ai-health-label">${t('usage.aiDiagnosticsLastPruneDeleted')}</div>
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
      </div>
    </div>`;
}

function renderAiContentCoverage(coverage: AiContentCoverageReport): string {
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
    coverageRow('usage.aiCoverageObjectMissingOverlap', coverage.scenes.semanticObjectsMissingAnchorOverlap),
    coverageRow('usage.aiCoverageItemMissingRequired', coverage.items.missingRequiredItems),
    coverageRow('usage.aiCoverageItemMissingRequiredSignals', coverage.items.requiredItemsMissingSignals),
    coverageRow('usage.aiCoverageItemMissingDiscardSignals', coverage.items.discardableItemsMissingSignals),
    coverageRow('usage.aiCoverageItemMissingImportantSignals', coverage.items.importantItemsMissingSignals),
  ].join('');

  return `
    <div class="usage-section">
      <h4>${t('usage.aiCoverageTitle')}</h4>
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
    </div>`;
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
    <div class="usage-section">
      <h4>${t('usage.aiProfilesTitle')}</h4>
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
      </div>
    </div>`;
}

export function renderAiLifeLayerMetrics(
  ai: AiLifeLayerMetricsSnapshot,
  coverage?: AiContentCoverageReport,
  diagnostics?: AiLifeLayerDiagnosticsSnapshot,
  profiles?: AiProfilePreviewReport,
): string {
  const needsAttention = ai.providerErrors > 0 || ai.memoryFlushFailures > 0 || ai.memoryPruneFailures > 0;
  const statusKey = needsAttention ? 'usage.aiStatusAttention' : 'usage.aiStatusHealthy';
  const statusClass = needsAttention ? ' warn' : '';
  const rows = [
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
    aiMetricRow('usage.aiMaxLatency', renderAiLatency(ai.maxProviderLatencyMs)),
    aiMetricRow('usage.aiLastLatency', renderAiLatency(ai.lastProviderLatencyMs)),
    aiMetricRow('usage.aiLastProviderError', renderAiOptionalText(ai.lastProviderError)),
    aiMetricRow('usage.aiLastMemoryError', renderAiOptionalText(ai.lastMemoryPersistenceError)),
    aiMetricRow('usage.aiLastMemoryPruneError', renderAiOptionalText(ai.lastMemoryPruneError)),
  ].join('');

  return `
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
        <div class="ai-health-value">${renderAiNumber(ai.memoryWritesQueued)}</div>
        <div class="ai-health-label">${t('usage.aiMemoryWritesQueued')}</div>
      </div>
    </div>
    ${coverage ? renderAiContentCoverage(coverage) : ''}
    ${profiles ? renderAiProfilePreview(profiles) : ''}
    ${diagnostics ? renderAiDiagnostics(diagnostics) : ''}
    <div class="usage-section">
      <h4>${t('usage.aiDetailsTitle')}</h4>
      <div class="table-scroll">
        <table class="usage-table">
          <thead><tr>
            <th>${t('usage.colMetric')}</th>
            <th class="num">${t('usage.aiColValue')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
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
